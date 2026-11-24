-- Circle Admin v3. Run ONCE in Supabase SQL editor AFTER migration-admin-v2.sql. Safe to re-run.
-- Adds: real account enforcement, hidden-content filter, trash + restore, bulk delete,
-- comment reports, friends counts, user activity history, admin avatar tools.

-- 1. Who may use the app right now (active, or suspension already expired)
create or replace function public.can_interact() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'active' or (status = 'suspended' and suspended_until is not null and suspended_until < now())
                   from public.profiles where id = auth.uid()), true)
$$;
grant execute on function public.can_interact() to authenticated;

-- 2. Server-side enforcement: blocked / banned / disabled / restricted / suspended users cannot write.
--    (Restrictive policies are ANDed with your existing ones, so nothing else changes.)
do $$
declare t text;
begin
  foreach t in array array['posts','reels','comments','reel_comments','messages'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "v3 enforce status" on public.%I', t);
      execute format('create policy "v3 enforce status" on public.%I as restrictive for insert to authenticated with check (public.can_interact())', t);
    end if;
  end loop;
  -- Hidden posts/reels are invisible to everyone except their owner and admins
  foreach t in array array['posts','reels'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "v3 hide filter" on public.%I', t);
      execute format('create policy "v3 hide filter" on public.%I as restrictive for select to authenticated using (hidden = false or user_id = auth.uid() or public.is_admin())', t);
    end if;
  end loop;
end $$;

-- 3. Trash (so deleted content can be restored)
create table if not exists public.admin_trash (
  id bigserial primary key, table_name text not null, row_data jsonb not null,
  owner_id uuid, deleted_by uuid, reason text, deleted_at timestamptz default now(), restored boolean not null default false);
alter table public.admin_trash enable row level security;
drop policy if exists "admins read trash" on public.admin_trash;
create policy "admins read trash" on public.admin_trash for select to authenticated using (public.is_admin());
grant select on public.admin_trash to authenticated;

-- 4. Status changes now also lock the login itself (Supabase auth ban)
create or replace function public.admin_set_status(p_user uuid, p_status text, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare o public.profiles; until_ts timestamptz; ban_ts timestamptz;
begin
  perform public._need(array['super_admin','admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Cannot act on an admin account'; end if;
  select * into o from public.profiles where id = p_user;
  if not found then raise exception 'User not found'; end if;
  if p_status = 'suspended' then until_ts := now() + make_interval(days => greatest(coalesce(p_days, 1), 1)); end if;
  ban_ts := case when p_status in ('blocked','banned','disabled') then timestamptz '2999-01-01'
                  when p_status = 'suspended' then until_ts else null end;
  update public.profiles set status = p_status, suspended_until = until_ts, status_reason = p_reason where id = p_user;
  update auth.users set banned_until = ban_ts where id = p_user;
  perform public._log(p_user, 'set_status', p_reason, jsonb_build_object('status', o.status, 'until', o.suspended_until), jsonb_build_object('status', p_status, 'until', until_ts));
  insert into public.admin_notices (user_id, kind, message) values (p_user, 'status', 'Your account status is now: ' || p_status || '. Reason: ' || p_reason);
end $$;

-- 5. Hide / unhide (ids may be bigint or uuid, so they are passed as text)
drop function if exists public.admin_hide(text, uuid, boolean, text);
drop function if exists public.admin_delete_content(text, uuid, text);

create or replace function public.admin_hide(p_table text, p_id text, p_hidden boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  perform public._need(array['super_admin','admin','moderator']);
  if p_table not in ('posts','reels') then raise exception 'Bad table'; end if;
  if p_hidden and coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  execute format('update public.%I set hidden = $1 where id::text = $2 returning user_id', p_table) into v_owner using p_hidden, p_id;
  perform public._log(v_owner, case when p_hidden then 'hide_' else 'unhide_' end || p_table, p_reason, null, jsonb_build_object('id', p_id));
  if p_hidden and v_owner is not null then
    insert into public.admin_notices (user_id, kind, message) values (v_owner, 'notice', 'One of your ' || p_table || ' was hidden by a moderator. Reason: ' || p_reason);
  end if;
end $$;

-- 6. Delete (archives the row first so it can be restored, and tells the owner)
create or replace function public._trash_and_delete(p_table text, p_id text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare j jsonb; v_owner uuid; v_by text;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id::text = $1', p_table) into j using p_id;
  if j is null then return; end if;
  v_owner := nullif(j->>'user_id', '')::uuid;
  insert into public.admin_trash (table_name, row_data, owner_id, deleted_by, reason) values (p_table, j, v_owner, auth.uid(), p_reason);
  execute format('delete from public.%I where id::text = $1', p_table) using p_id;
  perform public._log(v_owner, 'delete_' || p_table, p_reason, jsonb_build_object('id', p_id), null);
  v_by := case p_table when 'posts' then 'post' when 'reels' then 'reel' else 'comment' end;
  if v_owner is not null then
    insert into public.admin_notices (user_id, kind, message) values (v_owner, 'notice', 'Your ' || v_by || ' was removed by a moderator. Reason: ' || p_reason);
  end if;
end $$;

create or replace function public.admin_delete_content(p_table text, p_id text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need(array['super_admin','admin','moderator']);
  if p_table not in ('posts','reels','comments','reel_comments') then raise exception 'Bad table'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  perform public._trash_and_delete(p_table, p_id, p_reason);
end $$;

create or replace function public.admin_delete_many(p_table text, p_ids text[], p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare x text; n int := 0;
begin
  perform public._need(array['super_admin','admin','moderator']);
  if p_table not in ('posts','reels','comments','reel_comments') then raise exception 'Bad table'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  foreach x in array coalesce(p_ids, '{}') loop
    perform public._trash_and_delete(p_table, x, p_reason); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_delete_user_posts(p_user uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform public._need(array['super_admin','admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  for r in select id::text as id from public.posts where user_id = p_user loop
    perform public._trash_and_delete('posts', r.id, p_reason); n := n + 1;
  end loop;
  perform public._log(p_user, 'delete_all_posts', p_reason, jsonb_build_object('count', n), null);
  return n;
end $$;

create or replace function public.admin_restore(p_trash_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.admin_trash;
begin
  perform public._need(array['super_admin','admin']);
  select * into t from public.admin_trash where id = p_trash_id and not restored;
  if not found then raise exception 'Nothing to restore'; end if;
  if t.table_name not in ('posts','reels','comments','reel_comments') then raise exception 'Bad table'; end if;
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t.table_name, t.table_name) using t.row_data;
  update public.admin_trash set restored = true where id = p_trash_id;
  perform public._log(t.owner_id, 'restore_' || t.table_name, null, null, jsonb_build_object('trash', p_trash_id));
  if t.owner_id is not null then
    insert into public.admin_notices (user_id, kind, message) values (t.owner_id, 'notice', 'Good news: your removed content was restored.');
  end if;
end $$;

-- 7. Profile picture tools
drop policy if exists "admins upload avatars" on storage.objects;
create policy "admins upload avatars" on storage.objects for insert to authenticated with check (bucket_id = 'post-images' and public.is_admin());

create or replace function public.admin_set_avatar(p_user uuid, p_url text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o text;
begin
  perform public._need(array['super_admin','admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  select avatar_url into o from public.profiles where id = p_user;
  update public.profiles set avatar_url = nullif(p_url, '') where id = p_user;
  perform public._log(p_user, case when coalesce(p_url, '') = '' then 'remove_avatar' else 'change_avatar' end, p_reason, jsonb_build_object('avatar', o), jsonb_build_object('avatar', nullif(p_url, '')));
end $$;

-- 8. Richer user info (friends counts from the friendships table)
create or replace function public.admin_user_info(p_user uuid) returns json language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public._need(array['super_admin','admin','moderator']);
  return json_build_object(
    'email', (select email from auth.users where id = p_user),
    'phone', (select phone from auth.users where id = p_user),
    'registered', (select created_at from auth.users where id = p_user),
    'last_login', (select last_sign_in_at from auth.users where id = p_user),
    'posts', (select count(*) from public.posts where user_id = p_user),
    'reels', (select count(*) from public.reels where user_id = p_user),
    'comments', (select count(*) from public.comments where user_id = p_user) + (select count(*) from public.reel_comments where user_id = p_user),
    'reports', (select count(*) from public.reports where target_user = p_user),
    'friends', (select count(*) from public.friendships where status = 'accepted' and (requester = p_user or addressee = p_user)),
    'req_sent', (select count(*) from public.friendships where status = 'pending' and requester = p_user),
    'req_received', (select count(*) from public.friendships where status = 'pending' and addressee = p_user),
    'notices', (select coalesce(json_agg(n order by n.created_at desc), '[]'::json) from (select kind, message, created_at from public.admin_notices where user_id = p_user order by created_at desc limit 10) n));
end $$;

-- 9. Activity history: only what is really recorded
create or replace function public.admin_user_activity(p_user uuid) returns json language plpgsql stable security definer set search_path = public, auth as $$
declare sess json := '[]'::json; logins json := '[]'::json;
begin
  perform public._need(array['super_admin','admin','moderator']);
  begin
    select coalesce(json_agg(s order by s.created_at desc), '[]'::json) into sess
    from (select created_at, updated_at, user_agent, ip::text as ip from auth.sessions where user_id = p_user order by created_at desc limit 15) s;
  exception when others then sess := '[]'::json; end;
  begin
    select coalesce(json_agg(l order by l.created_at desc), '[]'::json) into logins
    from (select created_at, payload->>'action' as action, ip_address::text as ip from auth.audit_log_entries
          where payload->>'actor_id' = p_user::text order by created_at desc limit 25) l;
  exception when others then logins := '[]'::json; end;
  return json_build_object(
    'sessions', sess,
    'auth_events', logins,
    'likes_given', (select count(*) from public.likes where user_id = p_user) + (select count(*) from public.reel_likes where user_id = p_user),
    'recent_posts', (select coalesce(json_agg(x), '[]'::json) from (select id, left(coalesce(body, '(photo)'), 80) as text, created_at from public.posts where user_id = p_user order by created_at desc limit 10) x),
    'recent_reels', (select coalesce(json_agg(x), '[]'::json) from (select id, left(coalesce(caption, '(video)'), 80) as text, created_at from public.reels where user_id = p_user order by created_at desc limit 10) x),
    'recent_comments', (select coalesce(json_agg(x), '[]'::json) from (select left(body, 80) as text, created_at from public.comments where user_id = p_user order by created_at desc limit 10) x),
    'history', (select coalesce(json_agg(x), '[]'::json) from (select action, reason, old_value, new_value, created_at, admin_id from public.admin_logs where target_user = p_user order by created_at desc limit 50) x),
    'reports_filed', (select count(*) from public.reports where reporter_id = p_user),
    'reports_against', (select count(*) from public.reports where target_user = p_user));
end $$;

grant execute on function public.admin_hide(text,text,boolean,text), public.admin_delete_content(text,text,text),
  public.admin_delete_many(text,text[],text), public.admin_delete_user_posts(uuid,text), public.admin_restore(bigint),
  public.admin_set_avatar(uuid,text,text), public.admin_user_info(uuid), public.admin_user_activity(uuid), public.admin_set_status(uuid,text,int,text) to authenticated;

-- 10. Everyone can mark their OWN notices as read (already allowed in v2). Nothing else to do.
-- 11. If anyone is banned/blocked from before v3, lock their login too:
update auth.users u set banned_until = timestamptz '2999-01-01' from public.profiles p where p.id = u.id and p.status in ('blocked','banned','disabled');
update auth.users u set banned_until = p.suspended_until from public.profiles p where p.id = u.id and p.status = 'suspended' and p.suspended_until > now();
