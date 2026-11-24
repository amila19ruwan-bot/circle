-- Circle Admin v2 (phase 1). Run ONCE in Supabase SQL editor. Safe to re-run.
-- Needs the old migration-admin.sql (admins table + is_admin()) already applied.

-- 1. Roles
alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins drop constraint if exists admins_role_chk;
alter table public.admins add constraint admins_role_chk check (role in ('super_admin','admin','moderator'));
update public.admins set role = 'super_admin' where role = 'admin' and not exists (select 1 from public.admins where role = 'super_admin');

-- 2. Account status + profile fields
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_status_chk;
alter table public.profiles add constraint profiles_status_chk check (status in ('active','blocked','suspended','banned','restricted','disabled'));
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists status_reason text;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_uq on public.profiles (lower(username)) where username is not null;
alter table public.posts add column if not exists hidden boolean not null default false;
alter table public.reels add column if not exists hidden boolean not null default false;

-- 3. Admin log, user notices, reports
create table if not exists public.admin_logs (
  id bigserial primary key, admin_id uuid, target_user uuid, action text not null, reason text,
  old_value jsonb, new_value jsonb, created_at timestamptz default now());
create table if not exists public.admin_notices (
  id bigserial primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'warning', message text not null, read boolean default false, created_at timestamptz default now());
create table if not exists public.reports (
  id bigserial primary key, reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('user','post','reel','comment')),
  target_id text not null, target_user uuid references public.profiles(id) on delete cascade,
  reason text, status text not null default 'pending' check (status in ('pending','reviewed','resolved','dismissed')),
  handled_by uuid, handled_at timestamptz, note text, created_at timestamptz default now());
alter table public.admin_logs enable row level security;
alter table public.admin_notices enable row level security;
alter table public.reports enable row level security;
drop policy if exists "admins read logs" on public.admin_logs;
create policy "admins read logs" on public.admin_logs for select to authenticated using (public.is_admin());
drop policy if exists "own notices" on public.admin_notices;
create policy "own notices" on public.admin_notices for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "own notices update" on public.admin_notices;
create policy "own notices update" on public.admin_notices for update to authenticated using (user_id = auth.uid());
drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());
drop policy if exists "users file reports" on public.reports;
create policy "users file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
grant select on public.admin_logs, public.reports to authenticated;
grant select, update on public.admin_notices to authenticated;
grant insert on public.reports to authenticated;
grant usage on all sequences in schema public to authenticated;

-- 4. Helpers (server-side permission checks)
create or replace function public.admin_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.admins where user_id = auth.uid() $$;

create or replace function public._need(roles text[]) returns void language plpgsql stable security definer set search_path = public as
$$ begin if coalesce(public.admin_role(), '') <> all (roles) then raise exception 'Not allowed for your role'; end if; end $$;

create or replace function public._log(p_target uuid, p_action text, p_reason text, p_old jsonb, p_new jsonb) returns void
language sql security definer set search_path = public as
$$ insert into public.admin_logs (admin_id, target_user, action, reason, old_value, new_value) values (auth.uid(), p_target, p_action, p_reason, p_old, p_new) $$;

-- 5. Actions (admin + super_admin: status/profile; moderator+: content/notices; super_admin: delete account)
create or replace function public.admin_set_status(p_user uuid, p_status text, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.profiles; until_ts timestamptz;
begin
  perform public._need(array['super_admin','admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Cannot act on an admin account'; end if;
  select * into o from public.profiles where id = p_user;
  if not found then raise exception 'User not found'; end if;
  if p_status = 'suspended' then until_ts := now() + make_interval(days => greatest(coalesce(p_days, 1), 1)); end if;
  update public.profiles set status = p_status, suspended_until = until_ts, status_reason = p_reason where id = p_user;
  perform public._log(p_user, 'set_status', p_reason, jsonb_build_object('status', o.status, 'until', o.suspended_until), jsonb_build_object('status', p_status, 'until', until_ts));
  insert into public.admin_notices (user_id, kind, message) values (p_user, 'status', 'Your account status is now: ' || p_status || '. Reason: ' || p_reason);
end $$;

create or replace function public.admin_edit_profile(p_user uuid, p_name text, p_username text, p_bio text, p_verified boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.profiles;
begin
  perform public._need(array['super_admin','admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  select * into o from public.profiles where id = p_user;
  update public.profiles set name = p_name, username = nullif(trim(p_username), ''), bio = p_bio, is_verified = p_verified where id = p_user;
  perform public._log(p_user, 'edit_profile', p_reason, jsonb_build_object('name', o.name, 'username', o.username, 'bio', o.bio, 'verified', o.is_verified), jsonb_build_object('name', p_name, 'username', p_username, 'bio', p_bio, 'verified', p_verified));
end $$;

create or replace function public.admin_notify(p_user uuid, p_kind text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need(array['super_admin','admin','moderator']);
  if coalesce(trim(p_message), '') = '' then raise exception 'Message is required'; end if;
  insert into public.admin_notices (user_id, kind, message) values (p_user, p_kind, p_message);
  perform public._log(p_user, 'notify_' || p_kind, p_message, null, null);
end $$;

create or replace function public.admin_hide(p_table text, p_id uuid, p_hidden boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need(array['super_admin','admin','moderator']);
  if p_table not in ('posts','reels') then raise exception 'Bad table'; end if;
  execute format('update public.%I set hidden = $1 where id = $2', p_table) using p_hidden, p_id;
  perform public._log(null, case when p_hidden then 'hide_' else 'unhide_' end || p_table, p_reason, null, jsonb_build_object('id', p_id));
end $$;

create or replace function public.admin_delete_content(p_table text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need(array['super_admin','admin','moderator']);
  if p_table not in ('posts','reels','comments','reel_comments') then raise exception 'Bad table'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
  perform public._log(null, 'delete_' || p_table, p_reason, jsonb_build_object('id', p_id), null);
end $$;

create or replace function public.admin_delete_user_posts(p_user uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._need(array['super_admin','admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  delete from public.posts where user_id = p_user;
  get diagnostics n = row_count;
  perform public._log(p_user, 'delete_all_posts', p_reason, jsonb_build_object('count', n), null);
  return n;
end $$;

create or replace function public.admin_delete_user(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public._need(array['super_admin']);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason is required'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Cannot delete an admin account'; end if;
  perform public._log(p_user, 'delete_account', p_reason, (select to_jsonb(p) from public.profiles p where id = p_user), null);
  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;
end $$;

-- 6. Read helpers
create or replace function public.admin_dashboard() returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need(array['super_admin','admin','moderator']);
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'active', (select count(*) from public.profiles where status = 'active' and last_seen > now() - interval '7 days'),
    'online', (select count(*) from public.profiles where last_seen > now() - interval '2 minutes'),
    'blocked', (select count(*) from public.profiles where status in ('blocked','banned','disabled')),
    'suspended', (select count(*) from public.profiles where status = 'suspended'),
    'posts', (select count(*) from public.posts), 'reels', (select count(*) from public.reels),
    'pending_reports', (select count(*) from public.reports where status = 'pending'),
    'resolved_reports', (select count(*) from public.reports where status = 'resolved'));
end $$;

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
    'notices', (select coalesce(json_agg(n order by n.created_at desc), '[]'::json) from (select kind, message, created_at from public.admin_notices where user_id = p_user order by created_at desc limit 10) n));
end $$;

grant execute on function public.admin_role(), public.admin_set_status(uuid,text,int,text), public.admin_edit_profile(uuid,text,text,text,boolean,text),
  public.admin_notify(uuid,text,text), public.admin_hide(text,uuid,boolean,text), public.admin_delete_content(text,uuid,text),
  public.admin_delete_user_posts(uuid,text), public.admin_delete_user(uuid,text), public.admin_dashboard(), public.admin_user_info(uuid) to authenticated;

-- 7. Reports handling (added after first v2 release; safe to re-run)
create or replace function public.admin_handle_report(p_id bigint, p_status text, p_note text, p_warn boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  perform public._need(array['super_admin','admin','moderator']);
  if p_status not in ('reviewed','resolved','dismissed') then raise exception 'Bad status'; end if;
  if p_status in ('resolved','dismissed') and coalesce(trim(p_note), '') = '' then raise exception 'Note is required'; end if;
  select * into r from public.reports where id = p_id;
  if not found then raise exception 'Report not found'; end if;
  update public.reports set status = p_status, note = p_note, handled_by = auth.uid(), handled_at = now() where id = p_id;
  if p_warn and r.target_user is not null then
    insert into public.admin_notices (user_id, kind, message) values (r.target_user, 'warning', 'Warning after a report: ' || coalesce(nullif(trim(p_note), ''), r.reason, 'policy violation'));
  end if;
  perform public._log(r.target_user, 'report_' || p_status, p_note, jsonb_build_object('report', p_id, 'status', r.status), jsonb_build_object('status', p_status, 'warned', p_warn));
end $$;
grant execute on function public.admin_handle_report(bigint, text, text, boolean) to authenticated;
