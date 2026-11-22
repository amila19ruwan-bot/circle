# Circle

A small Facebook-style social app (friends + feed), built as a PWA that runs in the phone browser and can be installed to the Android home screen. UI text is in English; the owner speaks Sinhala and works only from an Android phone (no computer), so keep instructions phone-friendly and reply in Sinhala.

## Live app
- Vercel: https://circle-indol-tau.vercel.app
- Supabase project URL: https://swmokmlkpkojbjevxunj.supabase.co
- Supabase dashboard: https://supabase.com/dashboard/project/swmokmlkpkojbjevxunj
- SQL editor (new query): https://supabase.com/dashboard/project/swmokmlkpkojbjevxunj/sql/new

The publishable key (`sb_publishable_...`) is already inside `index.html`. Never put a secret / service_role key in this repository.

## Stack
- Frontend: plain HTML, CSS and JavaScript in one file (`index.html`), no build step.
- Supabase JS loaded from the jsDelivr CDN (`@supabase/supabase-js@2.45.4`).
- Backend: Supabase (Auth with email + password, Postgres, row level security).
- Hosting: Vercel, connected to this GitHub repository. Every commit to the main branch redeploys automatically.

## Files
- `index.html`: the whole app (login, sign up, Home feed, Friends, Me).
- `manifest.webmanifest`: PWA manifest (name, colors, icon).
- `sw.js`: service worker (network first, cache fallback).
- `icon.svg`: app icon (blue square with a white ring and dot).

Files are edited directly on github.com (Add file -> Create new file, or open a file and use the pencil icon). Commit, and Vercel redeploys in about a minute.

## What works now
- Create account (name, email, password) and log in / log out.
- A profile row is created automatically on first login.
- Post text, and see the feed of all posts (newest first, latest 50).
- Friends screen: send a friend request, see incoming requests with Confirm / Delete, see your friends, see requests you sent.
- Me screen with log out.
- Installable PWA (Chrome menu -> Install app / Add to Home screen).
- Confirmed working: sign up, login and posting text.

## Not tested yet
- The Friends screen with two accounts (need a second account, e.g. in an Incognito tab).

## Design
- Blue (#2457D6) accent, near-black ink (#1B1F27), light grey background (#F4F5F7), white cards, rounded buttons, bottom tab bar with Home / Friends / Me.
- A Design mockup was made earlier in Claude (Feed and Friends screens); the real app follows it.

## Database (Supabase SQL)

Run once in the SQL editor. This is already done for the live project.

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table posts (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table friendships (
  id bigint generated always as identity primary key,
  requester uuid references profiles(id) on delete cascade,
  addressee uuid references profiles(id) on delete cascade,
  status text default 'pending',
  unique (requester, addressee)
);

alter table profiles enable row level security;
alter table posts enable row level security;
alter table friendships enable row level security;

create policy "read profiles" on profiles for select to authenticated using (true);
create policy "add own profile" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "read posts" on posts for select to authenticated using (true);
create policy "write own posts" on posts for insert to authenticated with check (auth.uid() = user_id);
create policy "see my friendships" on friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "send request" on friendships for insert to authenticated with check (auth.uid() = requester);
create policy "answer request" on friendships for update to authenticated using (auth.uid() = addressee);
```

Table permissions (also run once; without these the app showed "permission denied for table profiles"):

```sql
grant usage on schema public to authenticated;
grant select, insert on public.profiles to authenticated;
grant select, insert on public.posts to authenticated;
grant select, insert, update on public.friendships to authenticated;
grant usage, select on all sequences in schema public to authenticated;
```

Friend request statuses: `pending`, `accepted`, `declined`. A "Delete" on a request sets status to `declined` (there is no delete policy).

## Supabase settings
- Authentication -> URL Configuration: Site URL should be `https://circle-indol-tau.vercel.app`, and Redirect URLs should include `https://circle-indol-tau.vercel.app/**`. (Confirmation emails used to open a blank page on localhost because this was still the default. Check that it was saved.)
- Authentication -> Sign In / Providers -> Email: "Confirm email" may be on or off. Free Supabase email sending is rate limited (one request per minute per address, and few per hour), so turn it off while testing, and turn it on again before real use.

## Known limitations / to-do
1. The feed shows posts from everyone, not only friends. Fix: filter posts to the user's accepted friends and themselves (query `friendships` first, or add a SQL view / policy).
2. No photos. Add Supabase Storage (bucket for post images), an upload button using the phone gallery, and an `image_url` column on `posts`.
3. No likes or comments. Add `likes` and `comments` tables with RLS, plus the same `grant` lines.
4. No profile photo or bio, and no way to edit the name (needs an update policy and grant on `profiles`).
5. No delete for own posts (needs delete policy and grant).
6. No chat or notifications.
7. No password reset screen.
8. Icon is an SVG only. Some phones want PNG icons (192 and 512) for a perfect install icon.
9. Possible later step: wrap as a native app (Capacitor or Expo) for the Play Store.

## Notes for whoever continues
- Whenever a new table is added, also run `grant ... to authenticated` for it and enable row level security with policies.
- Keep UI mobile first (phone width about 390 px) and touch targets at least 44 px.
- The owner copies code from chat files into GitHub by hand, so give complete files rather than diffs, and one file at a time.
