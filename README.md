# Circle Admin Panel — v3 (අදියර 2)

## දැන් run කරන්න ඕන දේ (පිළිවෙලට)
1. Supabase → SQL editor → `migration-admin-v2.sql` (කලින් run කරලා නැත්නම් විතරක්), ඊට පස්සේ **`migration-admin-v3.sql`** paste කරලා **Run**. (ආයෙත් run කළාට කමක් නෑ.)
2. GitHub එකට මේ ෆයිල් replace කරන්න: `app.js`, `reels.js`, `admin.html`, `index.html`, `sw.js`, `migration-admin-v3.sql`.
3. Vercel deploy වුණාම phone එකේ app එක ඇරලා පිටුව refresh කරන්න (cache version `circle-v56`). Admin: `admin.html?v=7`.

## v3 වල අලුතින් කරපු දේවල් ✅
**App එක (`app.js`, `reels.js`)**
- **Enforcement:** blocked / banned / disabled / suspended user ව app එක ඇරපු ගමන් (සහ තත්පර 10 කට වරක් බලලා) logout කරලා, හේතුව සහිත message එකක් පෙන්වනවා. Suspension දවස් ඉවර වුණාම ඒක ඉබේම අයින් වෙනවා.
- **Restricted user:** බලන්න පුළුවන්, post / comment / reel / message දාන්න බෑ (message එකක් පෙන්වනවා).
- **Server-side enforcement (SQL):** app එක මග හැරලා API එකෙන් ගියත් write කරන්න බෑ (restrictive RLS policies). Block / ban / disable / suspend කරද්දී Supabase login එකත් lock වෙනවා (`auth.users.banned_until`).
- **Hidden posts/reels:** admin hide කළාම app එකේ කාටවත් පේන්නේ නෑ (අයිතිකාරයාට සහ admins ට විතරයි). Filter එක database එකේ (RLS) තියෙන්නේ.
- **Notices:** admin යවන warning / notice / status update app එකේ popup එකක් විදියට පේනවා (OK ඔබලා කියවපු බව සටහන් වෙනවා).
- **ඩොට් තුන මෙනු:** post වල ••• මෙනුවේ Delete (තමන්ගේ) / Report (අනිත් අයගේ). Reel වල Report මෙනුව ඇතුලට දැම්මා (Home reel card එකේ ••• සහ Reels tab එකේ ⋯).
- **Comment report:** comment එකක් යටින් "Report" (post comments සහ reel comments දෙකටම).

**Admin panel (`admin.html`)**
- **Modal forms:** prompt / confirm boxes වෙනුවට නියම modal forms (reason අනිවාර්යයි, Cancel බටන් එක, Delete account එකට "DELETE" type කරන්න ඕන).
- **User list:** registration date එකතු කළා.
- **User details:** friends / friend requests (app එක පාවිච්චි කරන්නේ friendships, followers/following නෙවෙයි), profile picture change / remove, Activity history.
- **Activity history:** devices/sessions + IP, login events (Supabase auth වල තියෙනවා නම් විතරයි), likes given, reports filed/against, recent posts/reels/comments, previous suspensions/bans, profile changes, user ට කළ admin actions. database එකේ නැති දේ "Not recorded" කියලා පෙන්වනවා.
- **Posts & reels:** Hide / Unhide, selected delete (checkboxes), likes + reactions count, comments බලන්න සහ එකින් එක delete කරන්න, hidden only filter.
- **Deleted content (🗑️):** admin delete කරන posts / reels / comments trash එකට යනවා, Restore කරන්න පුළුවන් (admin / super_admin). Restore කළාම පරණ likes/comments ආපහු එන්නේ නෑ.
- **Owner ට notice:** content delete / hide / restore කළාම අයිතිකාරයාට ඉබේම notice යනවා. Account restore කළාමත් notice යනවා.
- **Reports:** comment reports, Hide post/reel බටන්, comment delete.
- **Home:** Recent admin activity (අන්තිම 5).
- **Bug fix:** කලින් hide/delete functions වල `id` එක `uuid` ලෙස තිබුණා. Circle හි ids අංක (bigint) නිසා වැඩ කරන්නේ නැති වෙන්න තිබුණා. දැන් `text` ලෙස ගන්නවා (දෙකටම හරි).

## Roles (server එකේ check වෙනවා)
- **moderator:** බලන්න, content delete/hide, comments delete, warning/notice යවන්න.
- **admin:** + status වෙනස් කිරීම, profile edit, picture change, verify, සියලු posts delete, restore.
- **super_admin:** + account permanently delete.
- Admin accounts වලට block/ban/delete කරන්න බෑ.

## තාම ඉතුරු ⏳
1. **Followers/following:** Circle හි follow system එකක් නෑ (friends විතරයි). ඒ නිසා friends count පෙන්වනවා.
2. **Likes history (කවුද කොයි වෙලාවට like කළේ):** `likes` table එකේ time එකක් record වෙන්නේ නෑ, ගණන විතරයි.
3. **Login history / device info:** Supabase `auth.sessions` සහ `auth.audit_log_entries` වල තියෙනවා නම් විතරයි පේන්නේ.
4. **Deleted content restore:** storage එකේ ෆයිල් (පින්තූර/වීඩියෝ) admin delete එකෙන් මැකෙන්නේ නෑ. ඒක නිසා restore කළාම පෙනෙනවා. User තමන්ම delete කළ ඒවා trash එකට යන්නේ නෑ.
5. **Profile picture upload:** admin ට upload කරන්න `post-images` bucket එකේ policy එකක් migration එකෙන් දානවා. ඔබේ bucket නම වෙනස් නම් `migration-admin-v3.sql` හි `'post-images'` වෙනස් කරන්න.
6. Cover photo / වෙනත් profile fields admin ට edit කරන්න බෑ.

## කලින් අදියර (v2) ✅
- Dashboard, user list (search / filter / sort), user details, profile edit, Block / Unblock / Suspend 1-7-30 / Restrict / Disable / Ban / Restore / Delete account.
- Warning සහ notice, Delete post/reel/all posts, Admin Activity Log, Reports page (Mark reviewed / Resolve / Dismiss / Resolve + warn / Delete).
- App එකේ 🚩 Report (user, post, reel). `reportIt()` function එක.
- හැම destructive action එකටම reason අනිවාර්යයි.

---

# Circle Admin Panel

Admin panel එක: `https://circle-indol-tau.vercel.app/admin.html`

## ෆයිල් දෙක
- **`admin.html`**: admin panel එක (login, Profiles, Posts & Videos, back button). GitHub repo එකේ root එකේ තියෙන්න ඕන.
- **`migration-admin.sql`**: Supabase database එකට admin අයිතිය සහ permissions දෙන SQL. එක පාරක් run කරන්න.

## පළමු වරට හදන විදිය
1. Supabase dashboard → **Authentication → Users → Add user → Create new user**. Admin email + password දාලා **Auto confirm user** ටික් කරලා create කරන්න. (App එකේ ගිණුමත් පාවිච්චි කරන්න පුළුවන්, ඒ සඳහා app එකෙන් sign up වෙලා තියෙන්න ඕන.)
2. `migration-admin.sql` ෆයිල් එකේ අන්තිමට තියෙන email එක admin email එකට වෙනස් කරන්න.
3. Supabase SQL editor එකේ migration එක paste කරලා **Run** කරන්න.
4. `admin.html` GitHub එකට upload/replace කරන්න. Vercel deploy වෙන්න මිනිත්තුවක් ඉඳලා page එක open කරන්න.

## Admin එකක් එකතු කරන්න / අයින් කරන්න
ගිණුම admin කරන්න (email එක වෙනස් කරලා run කරන්න):
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'EMAIL_HERE'
on conflict do nothing;
```
Admin අයින් කරන්න:
```sql
delete from public.admins
where user_id = (select id from auth.users where email = 'EMAIL_HERE');
```
Admin ලිස්ට් එක බලන්න:
```sql
select a.user_id, u.email from public.admins a join auth.users u on u.id = a.user_id;
```

## පිටුවේ තියෙන දේවල්
- **Login:** admin email + password. Login වුණාට admin නැත්නම් "Not allowed" පෙන්වනවා.
- **Home:** බටන් 2ක්:
  - **👤 Profiles:** හැම user ගේ ලිස්ට් එක, නම අනුව search කරන්න පුළුවන්. Card එක ටච් කලාම user page එක open වෙනවා.
  - **🎬 Posts & Videos:** හැම post සහ reel එකම අලුත්ම එකින් පෙන්වනවා. Delete බටන් තියෙනවා.
- **User page:** බටන් 2ක්:
  - **Posts & reels:** ඒ user ගේ posts සහ reels.
  - **Delete all their posts:** ඒ user ගේ posts ඔක්කොම delete කරනවා (confirm popup එකක් එනවා).
- **Back බටන්:** admin panel එකෙන් එළියට යන්නේ නෑ. User page → Profiles → Home ආකාරයට යනවා.

## Permissions (SQL එකෙන් දෙන දේවල්)
- Admin ට බලන්න පුළුවන්: profiles, posts, reels, comments, reel_comments, friendships.
- Admin ට delete කරන්න පුළුවන්: posts, reels, comments, reel_comments.
- **Admin ට private chat messages බලන්න බෑ.** ඒක ඉස්සරහට දාන්නෙත් නෑ.

## වෙනස්කම් කරන විදිය
- **බටන් නම් වෙනස් කරන්න:** `admin.html` එකේ `👤 Profiles` සහ `🎬 Posts &amp; Videos` කියන text එක සොයලා වෙනස් කරන්න.
- **Version එක:** වෙනස්කම් කරලා zip එකක් හදද්දී නම `circle-admin-5.zip` වගේ අංකය වැඩි කරන්න.
- **පරණ page එකම පෙන්නනවා නම්:** URL එකේ `?v=5` වගේ අංකයක් දාලා open කරන්න (උදා: `admin.html?v=5`).

## ප්‍රශ්න සහ විසඳුම්
- **"Invalid login credentials":** email හෝ password වැරදියි, නැත්නම් ඒ email එකෙන් account එකක් නැහැ. App එකෙන් sign up වෙන්න, නැත්නම් Supabase dashboard එකෙන් password එක වෙනස් කරන්න.
- **"Not allowed":** login වෙලා තියෙන account එක admins table එකේ නැහැ. SQL එකේ admin insert එක ආයෙ run කරන්න.
- **Stats/tabs පෙනුනා නම්:** admin.html අලුත් version එක GitHub එකේ නැහැ. ආයෙ upload කරලා `?v=` අංකය දාලා බලන්න.
- **Posts/reels load වෙන්නේ නැත්නම්:** Supabase SQL editor එකේ `migration-admin.sql` හරියට run වුණාද බලන්න. Error message එක තියෙනවා නම් ඒක copy කරලා දාන්න.

## ආරක්ෂාව
- **Secret keys** (service role / secret key) කිසිම විටෙක මේ repo එකේ දාන්න එපා. Admin page එක publishable key එකෙන් විතරක් වැඩ කරනවා.
- Admin වීම server එකේ (database RLS) check වෙනවා. Page එකේ check එක විතරක් නෙවෙයි.
