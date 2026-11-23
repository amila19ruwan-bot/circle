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
- `sw.js`: service worker (network first, cache fallback). Bump `CACHE` (now `circle-v8`) when you want phones to drop old files.
- `icon.svg`: app icon.
- `migration-2.sql`: likes, comments, photos, delete, profile edit (run once).
- `migration-3.sql`: profile photo column + makes the photo bucket public (run once).
- `migration-5.sql`: unfriend (delete policy on `friendships`) + `messages` table with RLS, friends only (run once). Without it, Unfriend and chat show a "run migration-5.sql" message.
- `migration-chat-v17.sql`: chat photos (`messages.image_url`), `blocks` table + rule that blocks messaging, `messages.hide_seen` (run once, BEFORE uploading v17 files).
- `migration-4.sql`: cover photo + intro fields (lives in, works at, studied at, website) on profiles (run once). The app still works without it; cover and intro fields just cannot be saved until it is run.

## Features
- Sign up, log in, log out, forgot-password email and new-password screen.
- Home feed (all posts, newest first, latest 50) with a post box: text and/or a photo from the gallery (shrunk to 1280 px, stored in Storage bucket `post-images`).
- Each post: avatar ring, name, time, Like (thumbs up), Comment (open/close, delete own), Share (phone share sheet or copy link), Save (kept on this phone only, `localStorage`), delete own post (••• menu).
- Back button: the app keeps its own history (`history.pushState` + `popstate` in `show()/navTo()`), so the phone Back button goes to the previous screen instead of leaving the app.
- Profile page (own and others), styled like the owner's mockup: framed cover photo, arched card with big avatar, name (emoji such as a flag can be typed in the name; blue tick if in `VERIFIED`), bio shown as a tagline, three stat cards, Edit profile / Share profile (or friend) buttons, Intro card, Friends grid (own), Posts / Photos / Videos tabs. Posts tab is a 3-column grid; tap a tile to open the post (`post` view), Photos tiles open full screen. Videos is a placeholder.
- Edit profile is its own screen (name, bio, lives in, works at, studied at, website).
- Tap any avatar or name to open that person's profile.
- Me tab: own profile page; change profile photo and cover with the camera buttons; Saved posts; log out.
- Friends tab: requests (Confirm / Delete), your friends, people you may know (Add friend), requests you sent.
- Header: search people by name, bell with count of incoming friend requests, own avatar.
- Login page follows the owner's mockup: blue hero with the Circle logo, cursive tagline, "Join Circle Today!" text, the girl photo (embedded as a base64 webp in `index.html`), big Create Account and small Sign In buttons. Tapping either opens the form card (name / email / password, forgot password, back).
- Unfriend: on a friend's profile and in the Friends list (confirm dialog, deletes the friendship row so they can be re-added later).
- Messages (friends only): chat icon in the header (red count of unread), Messages screen (conversations + "Start a chat" with friends), full-screen chat with bubbles, day separators, "Seen", and a send box. The chat refreshes every 3 s while open (polling, no realtime setup needed); unread count refreshes every 20 s. Table `messages` (`sender`, `receiver`, `body`, `read_at`); the receiver may only update `read_at`.
- Light theme only (dark mode was removed on purpose; the owner does not want black).
- Floating bottom tab bar: Home, Friends, Reels, Marketplace, Me. Reels and Marketplace are "coming soon" placeholder screens.
- Glass look (v8, from the owner's new mockups): deep blue-to-violet header with glass round buttons, soft wave backdrop at the bottom of every screen, pill-shaped cards, blue-violet gradient chat bubbles, glass bottom nav (Reels tab highlighted in violet).
- Home header: search + big gradient chat button (red unread count). The friend-request count now sits on the Friends tab and on the floating bell of the Messages screen.
- Messages screen: no bottom nav; floating bell (friend requests) + gear (opens Me / settings); compose button (jumps to "Start a chat") and own avatar in the header; tap the logo to go Home.
- Chat screen: glass header with avatar, green dot and "Online/Offline" text (Supabase Realtime *presence*, channel `online-users`, no SQL needed; shows nothing if Realtime is unreachable), phone / video buttons (placeholders: show "coming soon"), info button (opens profile), frosted day pill, emoji-only messages shown big, composer with emoji tray, paperclip (placeholder) and round send button.
- Older look notes: wavy blue header fading into the page, rounded cards, stacked reaction icons (cosmetic, every like counts as a Like), blue tick for names listed in `VERIFIED` in `index.html`.

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
3. Reels and Marketplace are placeholders only. Real reactions (heart, wow) and a shares count would need new DB columns/tables.
4. Chat has text only (no photos, no delete/unsend, no typing indicator), no notification list (the bell only counts friend requests), no reactions other than Like.
5. Icon is SVG only. Some phones want PNG icons (192 and 512) for a perfect install icon.
6. Possible later step: wrap as a native app (Capacitor or Expo) for the Play Store.

## Notes for whoever continues
- Whenever a new table is added, also run `grant ... to authenticated` for it and enable row level security with policies.
- Keep UI mobile first (phone width about 390 px) and touch targets at least 44 px.
- The owner copies code from chat files into GitHub by hand, so give complete files rather than diffs, and one file at a time.


## v17 additions
- Photo icon on Home opens a separate New post page (Gallery / Camera, preview, Post).
- Settings screen (Me -> Chat settings, or chat ⋯ menu): 6 incoming/sent tones, 6 vibration patterns, each can be Off; toggle to show Sent/Delivered/Seen; toggle to hide my Seen from others. Stored in `localStorage` (`circle_cfg`).
- Block / Unblock on profiles, in the chat ⋯ menu and in Settings (`blocks` table).
- Pin up to 3 chats (📌 on each Messages row or chat ⋯ menu); stored on this phone (`circle_pins`).
- Photos in chat via the paperclip (bucket `post-images`, body falls back to `📷 Photo`).

## v18 changes
- `migration-chat-v18.sql`: `profiles.last_seen` (Online heartbeat every 25 s; Online = Realtime presence OR last_seen under 80 s). Run once before uploading.
- Settings now opens from the gear on the Messages screen (and chat ⋯ menu), not from the profile. New: Sound volume (Low..Max, louder tones) and Show my Online status switch.
- Ticks sit under my messages: Sent = 1 grey tick, Delivered = 2 grey ticks, Seen = 2 blue ticks. A message is only marked Seen while the app is on screen.

## v19
- Emoji picker (40 emojis) on the New post page and under each post's comment box (😊 button).

## v20
- Reactions on the Like button: tap = Like/unlike, hold (about 0.4 s) = bar with Love, Haha, Wow, Sad, Angry. Stored in `likes.reaction` (run `migration-reactions-v20.sql` once). Without the SQL, plain Like still works.
- Reaction counts line shows the top 3 reaction emojis used on the post.

## v21
- Long-press no longer selects text or shows the Copy / Select all / Web search popup anywhere (global `user-select:none`, contextmenu blocked); text boxes still work normally.

## v22
- New app icon from the Circle logo: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`; `manifest.webmanifest` rewritten (id, PNG icons incl. maskable, portrait, standalone) so Chrome installs it as a real app.
- Install popup: Chrome's `beforeinstallprompt` is captured and a bottom card (Install / ✕) appears automatically; closing it hides it for 3 days. Settings also shows an Install Circle button while the app is installable.

## v23: Reels
- Run `migration-reels-v23.sql` once (bucket `reels`, tables `reels`, `reel_likes`, `reel_comments`, RLS, grants) BEFORE uploading the v23 files.
- New files `reels.js` and `reels.css` (loaded from `index.html`); `app.js` only routes the `reels` and `reelnew` views.
- Reels tab: full-screen vertical feed (scroll-snap), the visible video autoplays (muted at first, sound button top left), tap to pause, like, comments sheet, share, delete own. ＋ button (top right) opens the New reel page (Gallery / Camera, caption, preview).
- Limits (free Supabase plan): max 60 s and 30 MB per video, MP4 / WebM / MOV. Videos load only when they are the current or next reel to save egress (5 GB / month free).
- Possible later: compress videos in the browser before upload, move videos to Cloudflare R2 when the free storage runs out.

