-- Circle v30: Web Push (notifications when the app is closed). Run ONCE in the Supabase SQL editor.

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;
drop policy if exists "read own push subs" on push_subscriptions;
drop policy if exists "delete own push subs" on push_subscriptions;
create policy "read own push subs" on push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "delete own push subs" on push_subscriptions for delete to authenticated using (auth.uid() = user_id);
grant select, delete on public.push_subscriptions to authenticated;

-- The phone saves its subscription through this function (it also takes over an endpoint that was used by another account on the same phone).
create or replace function save_push_sub(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
$$;
grant execute on function save_push_sub(text, text, text) to authenticated;
