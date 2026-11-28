# Circle → Play Store + Real-time Call Ring (පිලිවෙලට කරන්න ඕන දේවල්)

අරමුණ: Circle app එක **Play Store එකට** දාන්න, ඒ වගේම ෆෝන් එක lock කරලා / app එක වහලා තිබුණත් **WhatsApp වගේ full-screen call ring** එකක් එන්න.

> ⚠️ මේ README එක **සැලැස්ම** (plan). Native Android code (Capacitor project, call ring code, send-push update, GitHub Actions workflow) තවම ලියලා නෑ. Phase 4 වලදී Claude ලියලා දෙනවා. ඒක ඔයාගේ phone / GitHub එකේ test කරද්දි පළවෙනි පාරටම 100% වැඩ කරන්නේ නැති වෙන්න පුළුවන්, error log එවුවාම fix කරනවා.

**සලකුණු:** 👤 = ඔයා කරන්න ඕන, 🤖 = Claude ලියලා දෙනවා.

---

## Phase 0 — Accounts (කලින් හදාගන්න)

- [ ] 👤 **GitHub** (තියෙනවා)
- [ ] 👤 **Supabase** (තියෙනවා) → https://supabase.com/dashboard/project/swmokmlkpkojbjevxunj
- [ ] 👤 **Cloudflare Pages** (web app host කරන තැන, තියෙනවා)
- [ ] 👤 **Firebase** (නොමිලේ) → https://console.firebase.google.com (Google account එකෙන්)
- [ ] 👤 **Google Play Console** → https://play.google.com/console ($25 එක පාරයි, ID verify කරන්න වෙනවා. දවස් කීපයක් යන්න පුළුවන්, ඒ නිසා දැන්ම පටන් ගන්න)

---

## Phase 1 — දැනට හදපු web fixes deploy කරන්න

- [ ] 👤 `circle-fixed.zip` extract කරලා files GitHub repo එකට replace කරන්න (`app.js`, `reels.js`, `reels.css`, `index.html`, `sw.js`, `migration-reel-thumb-v35.sql`)
- [ ] 👤 Supabase **SQL Editor** එකේ run කරන්න: https://supabase.com/dashboard/project/swmokmlkpkojbjevxunj/sql/new
  ```sql
  alter table public.reels add column if not exists thumb_url text;
  ```
- [ ] 👤 Cloudflare deploy වුණාට පස්සේ phone එකෙන් test: friends list, Back button, reel cover frame

---

## Phase 2 — Package ID එක තීරණය කරන්න (වෙනස් කරන්න බෑ!)

- [ ] 👤 App එකේ **Package ID** එකක් තෝරන්න. උදා: `com.yourname.circle`
  - Play Store එකට upload කළාම ඒක **ආයේ වෙනස් කරන්න බෑ**.
  - Firebase, Android project, Play Console තුනේම **එකම** ID එක පාවිච්චි වෙනවා.
- [ ] 👤 App name එකත් තීරණය කරන්න (උදා "Circle")
- [ ] 👤 Package ID එක Claude ට එවන්න

---

## Phase 3 — Firebase setup (push notifications ඕන නිසා)

1. [ ] 👤 Firebase console → **Add project** (Google Analytics අවශ්‍ය නෑ)
2. [ ] 👤 Project එක ඇතුලේ **Add app → Android**
   - Package name = Phase 2 එකේ ID එක
   - **`google-services.json`** download කරලා තියාගන්න (මේක Claude ට එවන්න, ගැටළුවක් නෑ)
3. [ ] 👤 Firebase → ⚙️ Project settings → **Service accounts** → **Generate new private key**
   - ලැබෙන `.json` file එක **රහසක්**. Chat එකේ paste කරන්න එපා, GitHub එකට දාන්නත් එපා.
4. [ ] 👤 ඒ JSON එකේ content එක Supabase **secret** එකක් විදියට දාන්න:
   - Supabase dashboard → **Edge Functions → Secrets** → නම `FIREBASE_SERVICE_ACCOUNT`, value = JSON file එකේ මුළු content එක
5. [ ] 👤 Firebase → Project settings → **Cloud Messaging** තුල **Firebase Cloud Messaging API (V1)** enabled කියලා බලන්න

---

## Phase 4 — Native app හදන කොටස (🤖 Claude ලියනවා)

Claude දෙන files:

- 🤖 **`android-app/`** Capacitor project එක (දැනට තියෙන Circle web app එක ඇතුලේ load වෙනවා, calls / chat / reels වැඩ කරන්නේ කලින් වගේම)
- 🤖 **Native incoming-call code**: FCM push එක ආවම ringtone + vibrate, lock screen එකේ **full-screen Accept / Decline** screen එක; Accept කළාම app එක call එකට open වෙනවා
- 🤖 **Supabase SQL (`migration-fcm-v36.sql`)**: ෆෝන් එකේ FCM token එක save කරන table එක
- 🤖 **`send-push` Edge Function update**: කෝල් එකක් එන වෙලාවේ FCM **high-priority** message එකක් යවනවා
- 🤖 **Web app update (`app.js`/`calls.js`)**: token register කරන්න, notification එකෙන් එන callId එකට call එකට join වෙන්න
- 🤖 **GitHub Actions workflow**: PC නැතුව GitHub එකේම APK (test) සහ AAB (Play Store) build කරනවා
- 🤖 **`privacy.html`**, **`terms.html`**, **delete account** page + app එක ඇතුලේ "Delete account" බොත්තම (Play Store එකට අනිවාර්යයි)

ඔයා කරන්න ඕන:

- [ ] 👤 Claude දෙන files GitHub repo එකට දාන්න (`android-app/` folder එකත්)
- [ ] 👤 `google-services.json` එක `android-app/android/app/` ඇතුලට දාන්න (Claude කියලා දෙනවා)
- [ ] 👤 Supabase SQL Editor එකේ `migration-fcm-v36.sql` run කරන්න
- [ ] 👤 Supabase Edge Function `send-push` එක අලුත් code එකෙන් update කරන්න (deploy කරන ක්‍රමය Claude කියලා දෙනවා)

---

## Phase 5 — Signing key (APK/AAB sign කරන්න)

- [ ] 👤 **Keystore** එකක් හදන්න (Claude command / workflow එක දෙනවා)
- [ ] 👤 GitHub repo → Settings → **Secrets and variables → Actions** තුල මේ secrets දාන්න:
  - `KEYSTORE_BASE64`
  - `KEYSTORE_PASSWORD`
  - `KEY_ALIAS`
  - `KEY_PASSWORD`
- [ ] 👤 **Keystore file එකයි passwords ටිකයි** ආරක්ෂිතව backup කරන්න (Google Drive private + වෙනත් තැනක්). නැති වුණොත් අනාගතයේ update දාන්න බෑ.

---

## Phase 6 — Build කරලා test කරන්න

- [ ] 👤 GitHub → **Actions** tab → build workflow එක run කරන්න
- [ ] 👤 ඉවර වුණාම **APK artifact** එක ෆෝන් එකට download කරලා install කරන්න (Unknown sources allow කරන්න)
- [ ] 👤 Build එක fail වුණොත් error log එක Claude ට එවන්න

**Test checklist (ෆෝන් දෙකකින්):**

- [ ] Login, posts, reels, chat වැඩ කරනවා
- [ ] App එක open, call කළාම ring වෙනවා
- [ ] App එක background, call කළාම ring වෙනවා
- [ ] ෆෝන් එක **lock**, call කළාම **full-screen call screen** එක එනවා (Accept / Decline)
- [ ] App එක **swipe කරලා වහලා** call කළාම ring වෙනවා
- [ ] Accept කළාම voice / video call එක connect වෙනවා
- [ ] Notification, camera, mic permissions ඉල්ලනවා
- [ ] Battery saver on කරලා (Xiaomi / Oppo / Samsung) call එනවද බලන්න

---

## Phase 7 — Play Console setup

1. [ ] 👤 **Create app** (නම, language, free)
2. [ ] 👤 **Privacy Policy URL** (Phase 4 එකේ `privacy.html` page එකේ ලින්ක් එක)
3. [ ] 👤 **Data safety** form එක පුරවන්න (Claude විස්තර ලියලා දෙනවා)
4. [ ] 👤 **Content rating** questionnaire (social app / user-generated content)
5. [ ] 👤 **App content** declarations:
   - User-generated content (report / block / moderation තියෙනවා කියලා)
   - **Account deletion** URL + app එක ඇතුලේ delete option
   - Permissions: camera, microphone, notifications
   - **Full-screen intent** declaration (calling app එකක් විදියට)
6. [ ] 👤 **Store listing**: විස්තරය, **icon 512×512**, **feature graphic 1024×500**, phone **screenshots** (අඩුම තරමින් 2)
7. [ ] 👤 **AAB** file එක upload කරන්න (Actions build එකෙන් ලැබෙන `.aab`)
8. [ ] 👤 Play Console එකේ **App signing SHA-256** එකත් Firebase project එකට add කරන්න (Project settings → Android app → Add fingerprint)

---

## Phase 8 — Testing track → Production

- [ ] 👤 **Closed testing** track එකට release එක දාන්න
- [ ] 👤 Testers add කරන්න (email list). **Personal developer account** එකක නම් production එකට යන්න කලින් අවම testers ගණනක් අවම දවස් ගණනක් closed testing කරන්න ඕන (සාමාන්‍යයෙන් **testers 12ක් × දවස් 14ක්**). ඒ නීතිය Play Console එකේ දැන් කොහොමද කියලා බලන්න, වෙනස් වෙලා තියෙන්න පුළුවන්.
- [ ] 👤 Testing කාලය ඉවර වුණාම **Apply for production** → **Production** release එකක් හදන්න
- [ ] 👤 Google review එක (දවස් කීපයක්) ඉවර වෙනකම් ඉන්න

---

## Phase 9 — Play එක reject කරන්න පුළුවන් දේවල්

- **"Minimum functionality / web wrapper"**: Website එකක් විතරක් ඇතුලේ දාපු apps reject කරන්න පුළුවන්. ඔයාගේ app එකේ native push + native call screen තියෙන එක මේකට උදව් වෙනවා.
- **Account deletion** නැතිනම් reject.
- **Privacy policy / data safety** වැරදි නම් reject.
- **Report / block / moderation** (social app) නැතිනම් reject.
- **Full-screen intent** declaration නැතිනම් call screen එක lock screen එකේ පෙන්නන්න බෑ.

---

## Phase 10 — Release එකෙන් පස්සේ

- **Web code update**: App එක ඇතුලේ web app එක load වෙන්නේ Cloudflare site එකෙන් නම්, GitHub එකට push කරාම Play update එකක් නැතුව users ලට update එක ඒවි.
- **Native code update** (call ring, permissions වගේ): අලුත් AAB එකක් හදලා Play එකට upload කරන්න ඕන, version code එක වැඩි කරලා.
- Keystore එක නැති නොකරගන්න.

---

## සාරාංශය (පිලිවෙල)

1. Phase 0 → Accounts (Play Console එක දැන්ම පටන් ගන්න)
2. Phase 1 → web fixes deploy + SQL
3. Phase 2 → Package ID තීරණය කරලා Claude ට කියන්න
4. Phase 3 → Firebase (`google-services.json` + service account → Supabase secret)
5. Phase 4 → Claude native code ලියනවා, ඔයා GitHub එකට දානවා, SQL / function deploy
6. Phase 5 → Signing key + GitHub secrets
7. Phase 6 → Build, ෆෝන් දෙකකින් test (call ring ඇතුළුව)
8. Phase 7 → Play Console forms + AAB upload
9. Phase 8 → Closed testing → Production
