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
- Supabase JS from the jsDelivr CDN (`@supabase/supabase-js@2.45.4`).
- Backend: Supabase (Auth with email + password, Postgres with row level security, Storage).
- Hosting: Vercel, connected to this GitHub repository. Every commit to the main branch redeploys in about a minute.

## Files
- `index.html`: the whole app.
- `manifest.webmanifest`: PWA manifest.
- `sw.js`: service worker (network first, cache fallback). Bump `CACHE` (e.g. `circle-v3`) when you want phones to drop old files.
- `icon.svg`: app icon.
- `migration-2.sql`: likes, comments, photos, delete, profile edit (run once).
- `migration-3.sql`: profile photo column + makes the photo bucket public (run once).

## Features
- Sign up, log in, log out, forgot-password email and new-password screen.
- Home feed (all posts, newest first, latest 50) with a post box: text and/or a photo from the gallery (shrunk to 1280 px, stored in Storage bucket `post-images`).
- Each post: avatar ring, name, time, Like (thumbs up), Comment (open/close, delete own), Share (phone share sheet or copy link), Save (kept on this phone only, `localStorage`), delete own post (••• menu).
- Tap any avatar or name to open that person's profile (photo, bio, friend status/button, their posts).
- Me tab: change profile photo (camera badge), name, bio; Saved posts; own posts; log out.
- Friends tab: requests (Confirm / Delete), your friends, people you may know (Add friend), requests you sent.
- Header: search people by name, bell with count of incoming friend requests, own avatar.
- Light theme only (dark mode was removed on purpose; the owner does not want black).
- Floating bottom tab bar: Home, Friends, Me.

## IMPORTANT: order when updating
When a version needs new SQL, run the SQL first, then upload the new `index.html`. The new page reads columns that must exist (for example `profiles.avatar_url`).

## Original database (Supabase SQL, first setup)

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

## Further database changes (already applied in the live project)
Run `migration-2.sql` then `migration-3.sql` once each (see the files). They add: `profiles.bio`, `profiles.avatar_url`, `posts.image_url`, tables `likes` and `comments`, update/delete policies, and the public Storage bucket `post-images` where each user may write only inside a folder named with their own user id.

Note: `likes` and `comments` both link posts and profiles, so any query that embeds a profile into a post must name the column, e.g. `profiles!user_id(name)`. Without it Supabase reports "more than one relationship was found".

## Supabase settings
- Authentication -> URL Configuration: Site URL should be `https://circle-indol-tau.vercel.app`, and Redirect URLs should include `https://circle-indol-tau.vercel.app/**`. (Confirmation emails used to open a blank page on localhost because this was still the default. Check that it was saved.)
- Authentication -> Sign In / Providers -> Email: "Confirm email" may be on or off. Free Supabase email sending is rate limited (one request per minute per address, and few per hour), so turn it off while testing, and turn it on again before real use.

## Known limitations / to-do
1. The feed shows posts from everyone, not only friends. Fix: filter posts to the user's accepted friends and themselves.
2. Saved posts live only on the phone (`localStorage`). Move to a `saves` table if they should follow the account.
3. No Reels or Marketplace (they appeared in a mockup but do not exist).
4. No chat, no notification list (the bell only counts friend requests), no reactions other than Like.
5. Icon is SVG only. Some phones want PNG icons (192 and 512) for a perfect install icon.
6. Possible later step: wrap as a native app (Capacitor or Expo) for the Play Store.

## Notes for whoever continues
- Whenever a new table is added, also run `grant ... to authenticated` for it and enable row level security with policies.
- Keep UI mobile first (phone width about 390 px) and touch targets at least 44 px.
- The owner copies code from chat files into GitHub by hand, so give complete files rather than diffs, and one file at a time.
