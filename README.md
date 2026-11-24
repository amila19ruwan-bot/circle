# Circle Admin Panel — v2 (අදියර 1)

## දැන් run කරන්න ඕන දේ (පිළිවෙලට)
1. Supabase → SQL editor → `migration-admin-v2.sql` paste කරලා **Run** (එක පාරයි, ආයෙත් run කළාට කමක් නෑ).
2. `admin.html` GitHub එකට replace කරන්න → Vercel deploy වෙනකම් මිනිත්තුවක් ඉඳලා `admin.html?v=6` open කරන්න.
3. දැනට ඉන්න admins ඔක්කොම **super_admin** වෙනවා. අනිත් අයට role දෙන්න:
```sql
update public.admins set role = 'moderator' -- හෝ 'admin'
where user_id = (select id from auth.users where email = 'EMAIL_HERE');
```

## Roles (server එකේ check වෙනවා — SQL functions වල)
- **moderator:** බලන්න, content delete/hide, warning/notice යවන්න.
- **admin:** + status වෙනස් කිරීම, profile edit, verify, සියලු posts delete.
- **super_admin:** + account permanently delete.
- Admin accounts වලට block/ban/delete කරන්න බෑ.

## කරපු වැඩ ✅
- Dashboard: users, active (7d), online (විනාඩි 2), blocked/banned, suspended, posts, reels, pending/resolved reports.
- User list: profile pic, නම, username, ID, online/offline, last seen, search (නම/username/ID), filter (status), sort (newest/oldest/last active).
- User details: email, phone, registered, last login, last seen, status, bio, posts/reels/comments/reports count.
- Profile edit (නම, username, bio, verified) — reason එක්ක.
- Block / Unblock / Suspend 1-7-30 දවස් / Restrict / Disable / Ban / Restore / Delete account.
- Warning සහ notice යවන්න (DB එකේ `admin_notices` table එකට).
- Delete post/reel/all posts — confirm + reason + log.
- Admin Activity Log page (search, before/after values).
- **App එකේ 🚩 Report:** වෙන කෙනෙකුගේ post, reel, profile වලට (`app.js`, `reels.js` වෙනස් කළා, `reportIt()` function එක; `sw.js` cache v54). තමන්ගේ ඒවාට නෑ.
- **Reports page:** pending/reviewed/resolved/dismissed filter, type filter, reason, reporter + reported user, Mark reviewed / Resolve / Dismiss / Resolve + warn / Delete reported post-reel. (SQL: `admin_handle_report`, migration-admin-v2.sql අන්තිමට අලුතින් එකතු කළා, ආයෙ run කරන්න.)
- හැම destructive action එකටම reason අනිවාර්යයි.

## ඉතුරු වැඩ ⏳ (ඊළඟ අදියර)
1. **App එකේ enforcement:** blocked/suspended/banned user ව app එකෙන් login/post කරන්න නොදී නවත්තන්න `app.js` වෙනස් කරන්න ඕන. දැනට status එක DB එකේ වෙනස් වෙනවා, app එක තාම ඒක බලන්නේ නෑ.
2. **Hidden posts/reels:** `hidden` column එක තියෙනවා, admin_hide function එකත් තියෙනවා, ඒත් app එකේ feed එකෙන් hidden ඒවා filter කරන්න ඕන; admin UI එකේ Hide/Unhide බටන් තාම දාලා නෑ.
4. **Notifications app එකේ පෙන්වීම:** `admin_notices` user ට පෙන්නන්න app එකේ UI එකක් ඕන.
5. **User activity history:** login history/device info Supabase auth එකෙන් විතරයි (last login). ඉතිරි ඒවා record කරන්නේ නෑ.
6. Followers/following: app එක පාවිච්චි කරන්නේ friendships, ඒක schema එක බලලා count එකතු කරන්න ඕන.
7. Profile picture change (admin වෙනුවෙන් upload), selected posts bulk delete, individual comments manage, restore deleted content (දැන් delete permanent).
8. Prompt boxes වෙනුවට නියම modal forms.

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
