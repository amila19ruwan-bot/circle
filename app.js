const SUPABASE_URL = "https://swmokmlkpkojbjevxunj.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZPXOX4-iPM2xRCwt--xx1g_LB0kjXZG";
let recovering = /type=recovery/.test(location.hash);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = "post-images";

let me = null, tab = "home", signup = false;
const TABS = ["home","friends","reels","market","me"];
const VERIFIED = ["circle"]; /* names that get the blue tick */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const COLORS = ["radial-gradient(circle at 30% 25%,#4C8DFF,#1747D9 75%)","radial-gradient(circle at 30% 25%,#8E7BFF,#4A35D8 75%)","radial-gradient(circle at 30% 25%,#38BDF8,#1B6BEA 75%)","radial-gradient(circle at 30% 25%,#B26BFF,#6A3AE0 75%)","radial-gradient(circle at 30% 25%,#5B9BFF,#2A4FD6 75%)","radial-gradient(circle at 30% 25%,#7A8CFF,#3B3FD0 75%)"];
function avatar(name, big, url, uid){
  const n = name || "?";
  const cls = "av " + (big === "xl" ? "xl" : big ? "lg" : "") + (uid ? " lnk" : "");
  const click = uid ? ` onclick="openProfile('${uid}')"` : "";
  if (url) return `<img class="${cls}" src="${esc(url)}" alt="${esc(n)}"${click}>`;
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const ini = n.trim().split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase();
  return `<div class="${cls}" style="background:${COLORS[h % COLORS.length]}"${click}>${esc(ini)}</div>`;
}
function ago(t){
  const s = (Date.now() - new Date(t)) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return Math.floor(s / 86400) + " d ago";
}

/* ---------- auth ---------- */
function setAuthMode(s){
  signup = s;
  $("a-name").classList.toggle("hidden", !signup);
  $("a-go").textContent = signup ? "Create account" : "Log in";
  $("a-switch").textContent = signup ? "Have an account? Log in" : "New here? Create an account";
  $("auth-sub").textContent = signup ? "Make an account to join your friends." : "Log in to see what your friends are up to.";
  $("auth-title").textContent = signup ? "Create your account" : "Welcome back";
  $("msg").textContent = "";
}
function toggleAuth(){ setAuthMode(!signup); }
function openAuth(s){
  setAuthMode(s);
  $("auth").classList.add("form-open");
  $("auth-welcome").classList.add("hidden");
  $("auth-form").classList.remove("hidden");
  window.scrollTo(0, 0);
}
function closeAuth(){
  $("auth").classList.remove("form-open");
  $("auth-form").classList.add("hidden");
  $("auth-welcome").classList.remove("hidden");
  window.scrollTo(0, 0);
}
function say(t, ok){ $("msg").textContent = t; $("msg").className = ok ? "ok" : ""; }
async function submitAuth(){
  const email = $("a-email").value.trim(), password = $("a-pass").value, name = $("a-name").value.trim();
  if (!email || !password) return say("Enter your email and password.");
  if (signup && !name) return say("Enter your name.");
  say("Please wait…", true);
  if (signup){
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return say(error.message);
    if (!data.session) return say("Account created. Check your email to confirm, then log in.", true);
    boot(data.user);
  } else {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return say(error.message);
    boot(data.user);
  }
}
async function forgotPass(){
  const email = $("a-email").value.trim();
  if (!email) return say("Type your email above first, then tap Forgot password.");
  say("Please wait…", true);
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" });
  if (error) return say(error.message);
  say("Done. Check your email for the reset link.", true);
}
async function saveNewPass(){
  const password = $("r-pass").value;
  if (password.length < 6) { $("rmsg").textContent = "Use 6 or more characters."; return; }
  const { error } = await sb.auth.updateUser({ password });
  if (error) { $("rmsg").textContent = error.message; return; }
  history.replaceState(null, "", location.pathname);
  location.reload();
}
async function logout(){ await sb.auth.signOut(); try { history.replaceState(null, ""); } catch (e) {} location.reload(); }

/* ---------- boot ---------- */
async function boot(user){
  const { data: p } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (p){ me = p; }
  else {
    const name = (user.user_metadata && user.user_metadata.name) || user.email.split("@")[0];
    const { data, error } = await sb.from("profiles").insert({ id: user.id, name }).select().single();
    if (error){ $("auth").classList.remove("hidden"); return say(error.message); }
    me = data;
  }
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  updateHeader();
  startRealtime();
  startPresence();
  blocksP = loadBlocks(); beat();
  const st = history.state && history.state.t ? history.state : { t: "home", n: 0 };
  try { history.replaceState(st, ""); } catch (e) {}
  show(st);
}
function updateHeader(){ $("h-av").innerHTML = avatar(me.name, false, me.avatar_url, me.id); }
async function refreshBell(){
  const { count } = await sb.from("friendships").select("id", { count: "exact", head: true }).eq("addressee", me.id).eq("status", "pending");
  document.querySelectorAll(".frb").forEach(b => { b.textContent = count > 9 ? "9+" : count; b.classList.toggle("hidden", !count); });
  const { count: mc, error: me2 } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("receiver", me.id).is("read_at", null);
  const mb = $("mbadge"), mn = me2 ? 0 : (mc || 0);
  if (mb){ mb.textContent = mn > 9 ? "9+" : mn; mb.classList.toggle("hidden", !mn); }
  if (!me2){
    if (mn > lastUnread && !rtOk && !(cur && cur.t === "chat")) tone("in");
    lastUnread = mn;
    if (mn) sb.from("messages").update({ delivered_at: new Date().toISOString() }).eq("receiver", me.id).is("delivered_at", null).then(() => {}, () => {});
  }
}
let lastUnread = 0, rtOk = false;
/* ---------- navigation (with phone Back button support) ---------- */
let cur = null;
const TITLES = { home: "Circle", friends: "Friends", reels: "Reels", market: "Marketplace", me: "My profile", profile: "Profile", edit: "Edit profile", saved: "Saved", post: "Post", search: "Search", inbox: "Messages", chat: "Chat", settings: "Settings", compose: "New post", reelnew: "New reel" };
function show(v, keep){
  cur = v; tab = v.t;
  closeLb();
  if (typeof stopReels === "function") stopReels();
  if (v.t !== "chat") stopChatPoll();
  $("app").classList.toggle("chatmode", v.t === "chat");
  $("app").dataset.view = v.t;
  const hl = v.t === "edit" ? "me" : v.t === "compose" ? "home" : v.t === "reelnew" ? "reels" : v.t;
  TABS.forEach(x => $("t-" + x).classList.toggle("on", x === hl));
  $("title").textContent = TITLES[v.t] || "Circle";
  $("title").classList.toggle("long", ($("title").textContent || "").length > 8);
  if (!keep) $("main").scrollTop = 0;
  refreshBell();
  if (v.t === "profile"){ viewId = v.id; renderProfile(v.id); }
  else if (v.t === "me") renderProfile(me.id);
  else if (v.t === "edit") renderEdit();
  else if (v.t === "saved") renderSaved();
  else if (v.t === "post") renderPost(v.id);
  else if (v.t === "settings") renderSettings();
  else if (v.t === "compose") renderCompose();
  else if (v.t === "reelnew") renderReelNew();
  else if (v.t === "inbox") renderInbox();
  else if (v.t === "chat") renderChat(v.id);
  else ({ home: renderHome, friends: renderFriends, reels: renderReels, market: () => renderSoon(v.t), search: renderSearch })[v.t]();
}
function navTo(v, replace){
  const n0 = (history.state && history.state.n) || 0;
  v.n = replace ? n0 : n0 + 1;
  try { history[replace ? "replaceState" : "pushState"](v, ""); } catch (e) {}
  show(v);
}
function go(t){ navTo({ t }, !!(cur && cur.t === t)); }
function openProfile(id){ if (id === me.id) return go("me"); navTo({ t: "profile", id }, !!(cur && cur.t === "profile" && cur.id === id)); }
function openSaved(){ navTo({ t: "saved" }); }
function openEdit(){ navTo({ t: "edit" }); }
function openPost(id){ navTo({ t: "post", id }); }
function openChat(id){ navTo({ t: "chat", id }, !!(cur && cur.t === "chat" && cur.id === id)); }
function goBack(){ if (history.state && history.state.n > 0) history.back(); else navTo({ t: "home" }, true); }
function rerender(){ if (cur) show(cur, true); }
window.addEventListener("popstate", e => { if (me) show(e.state && e.state.t ? e.state : { t: "home", n: 0 }); });
function openPhoto(url){ $("lb-img").src = url; $("lb").classList.remove("hidden"); }
function closeLb(){ const l = $("lb"); if (l) l.classList.add("hidden"); }
let viewId = null;

/* ---------- home ---------- */
const ICON_THUMB = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>`;
const ICON_CHAT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z"/></svg>`;
const ICON_SHARE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4l7 6-7 6v-4c-6 0-9 2-11 6 1-7 4-11 11-12z"/></svg>`;
const ICON_SAVE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.800-8 11-8 11z"/></svg>`;
const ICON_VERIFIED = `<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path fill="#2F6BFF" d="M12 1.8l2.6 1.9 3.200-.1 1 3 2.600 1.900-.9 3.100.9 3.100-2.600 1.900-1 3-3.200-.1L12 22.200l-2.600-1.900-3.200.1-1-3L2.600 15.500l.9-3.100-.9-3.100 2.600-1.900 1-3 3.200.1z"/><path d="M8 12.200l2.800 2.800 5.200-5.600" fill="none" stroke="#fff" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_GLOBE = `<svg class="globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`;
let saved = new Set();
try { saved = new Set(JSON.parse(localStorage.getItem("circle_saved") || "[]")); } catch (e) {}
let noReact = false, feed = [], openCm = new Set(), cmts = {}, pickedFile = null, previewUrl = null;

async function renderHome(){
  pickedFile = null;
  $("main").innerHTML = `<div class="card comp"><div class="row"><span class="avwrap">${avatar(me.name, false, me.avatar_url)}<i class="dot"></i></span><textarea id="p-body" rows="1" maxlength="1000" placeholder="What is on your mind?" aria-label="New post" oninput="this.style.height='auto';this.style.height=Math.max(40,this.scrollHeight)+'px'" onfocus="this.closest('.comp').classList.add('typing')" onblur="if(!this.value)this.closest('.comp').classList.remove('typing')" style="flex:1"></textarea>
  <div class="cbar">
   <button onclick="openCompose()"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="currentColor"/><circle cx="12" cy="13.5" r="3.5" fill="#fff"/></svg>Photo</button>
   <button onclick="go('reels')"><svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="11" rx="2.5" fill="currentColor"/><path d="M3.5 9L5 4.5l4.5 1L8 9M10.5 9L12 5.5l4.5 1L15 9M17 9l1.5-3.5L21 6" fill="currentColor"/><path d="M10.3 12.5v4.2l3.8-2.1z" fill="#fff" stroke="none"/></svg>Reels</button>
   <button id="p-go" onclick="addPost()"><svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z" fill="currentColor"/><path d="M14 7l3 3" stroke="#fff"/></svg>Post</button>
  </div></div><div id="prev"></div><input id="p-file" type="file" accept="image/*" class="hidden" onchange="pickPhoto(this)"></div><div id="feed"><div class="empty">Loading…</div></div>`;
  loadFeed(null);
}
async function loadFeed(userId, ids){
  let q = sb.from("posts")
    .select("id,user_id,body,image_url,created_at,profiles!user_id(name,avatar_url),likes(user_id" + (noReact ? "" : ",reaction") + "),comments(id)")
    .order("created_at", { ascending: false }).limit(50);
  if (userId) q = q.eq("user_id", userId);
  if (ids){ if (!ids.length){ feed = []; $("feed").innerHTML = `<div class="empty">Nothing saved yet. Tap Save on a post.</div>`; return; } q = q.in("id", ids); }
  const { data, error } = await q;
  if (error && !noReact && /reaction/i.test(error.message)){ noReact = true; return loadFeed(userId, ids); }
  if (!$("feed")) return;
  if (error) { $("feed").innerHTML = `<div class="empty">Could not load posts: ${esc(error.message)}</div>`; return; }
  if (!userId && !ids && typeof loadHomeReels === "function"){ await loadHomeReels(); if (!$("feed")) return; }
  feed = data; openCm = new Set(); cmts = {};
  drawFeed();
  if (userId && $("st-likes")) $("st-likes").textContent = feed.reduce((a, p) => a + p.likes.length, 0);
}
let pfTab = "posts";
function drawFeed(){
  if (tab === "me" || tab === "profile"){
    if (pfTab === "videos"){ $("feed").innerHTML = `<div class="empty">Videos are coming soon.</div>`; return; }
    const list = pfTab === "photos" ? feed.filter(p => p.image_url) : feed;
    if (!list.length){ $("feed").innerHTML = `<div class="empty">${pfTab === "photos" ? "No photos yet." : "No posts yet."}</div>`; return; }
    $("feed").innerHTML = `<div class="pgrid">${list.map(p => p.image_url
      ? `<img src="${esc(p.image_url)}" alt="Photo" loading="lazy" onclick="${pfTab === "photos" ? "openPhoto(this.src)" : `openPost(${p.id})`}">`
      : `<div class="ptxt" onclick="openPost(${p.id})"><span>${esc(p.body)}</span></div>`).join("")}</div>`;
    return;
  }
  const mixed = tab === "home" && typeof feedHtml === "function" ? feedHtml(feed) : null;
  $("feed").innerHTML = mixed ? mixed : !feed.length ? `<div class="empty">No posts here yet.</div>`
    : feed.map(postHtml).join("");
}
function drawPost(id){
  const p = feed.find(x => x.id === id), el = $("post-" + id);
  if (p && el) el.outerHTML = postHtml(p);
}
function postHtml(p){
  const name = p.profiles && p.profiles.name, pav = p.profiles && p.profiles.avatar_url;
  const mineL = p.likes.find(l => l.user_id === me.id), liked = !!mineL, mk = mineL ? rkey(mineL) : "like", n = p.likes.length;
  const count = cmts[p.id] ? cmts[p.id].length : p.comments.length;
  let h = `<div class="card" id="post-${p.id}"><div class="row"><div class="ring${p.user_id === me.id ? " me" : ""}">${avatar(name, false, pav, p.user_id)}</div><div style="flex:1;min-width:0"><div class="name lnk" onclick="openProfile('${p.user_id}')">${esc(name)}${VERIFIED.includes(String(name || "").toLowerCase()) ? ICON_VERIFIED : ""}</div><div class="meta">${ago(p.created_at)} · ${ICON_GLOBE}</div></div>${p.user_id === me.id ? `<button class="del" onclick="delPost(${p.id})" aria-label="Delete post" style="font-size:22px;letter-spacing:1px;line-height:1">•••</button>` : ""}</div>`;
  if (p.body) h += `<p class="body">${esc(p.body)}</p>`;
  if (p.image_url) h += `<img class="post-img" src="${esc(p.image_url)}" alt="Photo" loading="lazy" onclick="openPhoto(this.src)">`;
  if (n || count) h += `<div class="react"><span>${n ? `${topRx(p.likes)}${n}` : ""}</span><span class="lnk" onclick="toggleCm(${p.id})">${count ? count + (count > 1 ? " comments" : " comment") : ""}</span></div>`;
  h += `<div class="acts"><button class="act like${liked ? " on rx-" + mk : ""}" onpointerdown="rxDown(event,${p.id})" onpointerup="rxUp(event,${p.id})" onpointerleave="rxCancel()" onpointercancel="rxCancel()" oncontextmenu="return false" aria-label="Like (hold for reactions)">${liked ? `<b class="rxe">${REACTS[mk][0]}</b><span>${REACTS[mk][1]}</span>` : `${ICON_THUMB}<span>Like</span>`}</button><button class="act" onclick="toggleCm(${p.id})" aria-label="Comment">${ICON_CHAT}<span>Comment</span></button><button class="act" onclick="sharePost(${p.id})" aria-label="Share">${ICON_SHARE}<span>Share</span></button><button class="act ${saved.has(p.id) ? "sv" : ""}" onclick="toggleSave(${p.id})" aria-label="Save">${ICON_SAVE}<span>Save</span></button></div>`;
  if (openCm.has(p.id)){
    const list = cmts[p.id];
    h += list ? list.map(c => `<div class="cm">${avatar(c.profiles && c.profiles.name, false, c.profiles && c.profiles.avatar_url, c.user_id)}<div style="flex:1;min-width:0"><div class="bub"><div class="name lnk" onclick="openProfile('${c.user_id}')">${esc(c.profiles && c.profiles.name)}</div>${esc(c.body)}</div><div class="meta" style="margin:2px 0 0 12px">${ago(c.created_at)}${c.user_id === me.id ? ` · <button class="link" style="min-height:32px;font-size:13px" onclick="delCm(${p.id},${c.id})">Delete</button>` : ""}</div></div></div>`).join("") : `<div class="meta" style="margin-top:10px">Loading…</div>`;
    h += `<div class="cm-form"><input id="c-${p.id}" maxlength="500" placeholder="Write a comment…" aria-label="Write a comment" onkeydown="if(event.key==='Enter')addCm(${p.id})"><button class="btn alt" style="flex:none;padding:0 12px" onmousedown="event.preventDefault()" onclick="toggleEmo('ce-${p.id}')" aria-label="Emoji">😊</button><button class="btn" onclick="addCm(${p.id})">Send</button></div>${emoTray("ce-" + p.id, "c-" + p.id)}`;
  }
  return h + `</div>`;
}
function toggleSave(id){
  saved.has(id) ? saved.delete(id) : saved.add(id);
  try { localStorage.setItem("circle_saved", JSON.stringify([...saved])); } catch (e) {}
  drawPost(id);
}
async function sharePost(id){
  const p = feed.find(x => x.id === id); if (!p) return;
  const data = { title: "Circle", text: (p.body || "A photo on Circle").slice(0, 200), url: location.origin + "/" };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); alert("Link copied"); }
  } catch (e) {}
}
const REACTS = { like: ["👍", "Like"], love: ["❤️", "Love"], haha: ["😂", "Haha"], wow: ["😮", "Wow"], sad: ["😢", "Sad"], angry: ["😡", "Angry"] };
const rkey = l => REACTS[l.reaction] ? l.reaction : "like";
function topRx(likes){
  const c = {}; likes.forEach(l => { const k = rkey(l); c[k] = (c[k] || 0) + 1; });
  return `<span class="rxs2">${Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 3).map(k => `<i>${REACTS[k][0]}</i>`).join("")}</span>`;
}
async function insertLike(id, key){
  let { error } = await sb.from("likes").insert({ post_id: id, user_id: me.id, reaction: key });
  if (error && /reaction/i.test(error.message)){
    if (key !== "like") return "Run migration-reactions-v20.sql in Supabase first.";
    ({ error } = await sb.from("likes").insert({ post_id: id, user_id: me.id }));
  }
  return error ? error.message : null;
}
async function toggleLike(id){
  const p = feed.find(x => x.id === id); if (!p) return;
  if (p.likes.some(l => l.user_id === me.id)){
    const { error } = await sb.from("likes").delete().eq("post_id", id).eq("user_id", me.id);
    if (error) return alert(error.message);
    p.likes = p.likes.filter(l => l.user_id !== me.id);
  } else {
    const err = await insertLike(id, "like");
    if (err) return alert(err);
    p.likes = [...p.likes, { user_id: me.id, reaction: "like" }];
  }
  drawPost(id);
}
async function setReaction(id, key){
  const p = feed.find(x => x.id === id); if (!p) return;
  const mine = p.likes.find(l => l.user_id === me.id);
  if (mine && rkey(mine) === key) return;
  if (mine){
    const { error: de } = await sb.from("likes").delete().eq("post_id", id).eq("user_id", me.id);
    if (de) return alert(de.message);
    p.likes = p.likes.filter(l => l.user_id !== me.id);
  }
  const err = await insertLike(id, key);
  if (err){ drawPost(id); return alert(err); }
  p.likes = [...p.likes, { user_id: me.id, reaction: key }];
  drawPost(id);
}
document.addEventListener("contextmenu", e => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });
/* tap = Like / unlike, hold = reaction bar (Love, Haha, Wow, Sad, Angry) */
let rxT = null;
function rxDown(e, id){
  clearTimeout(rxT); const el = e.currentTarget;
  rxT = setTimeout(() => { rxT = null; try { navigator.vibrate && navigator.vibrate(25); } catch (x) {} showRx(id, el); }, 380);
}
function rxUp(e, id){ if (rxT){ clearTimeout(rxT); rxT = null; toggleLike(id); } }
function rxCancel(){ if (rxT){ clearTimeout(rxT); rxT = null; } }
function closeRx(){ const d = $("rxov"); if (d) d.remove(); }
function showRx(id, el){
  closeRx();
  const r = el.getBoundingClientRect(), d = document.createElement("div");
  d.id = "rxov"; d.className = "rxov"; d.onclick = closeRx;
  d.innerHTML = `<div class="rxbar" style="bottom:${Math.round(innerHeight - r.top + 8)}px">${Object.entries(REACTS).map(([k, v]) => `<button data-k="${k}" aria-label="${v[1]}">${v[0]}</button>`).join("")}</div>`;
  d.querySelectorAll("button").forEach(b => b.onclick = ev => { ev.stopPropagation(); closeRx(); setReaction(id, b.dataset.k); });
  document.body.appendChild(d);
}
async function toggleCm(id){
  if (openCm.has(id)){ openCm.delete(id); return drawPost(id); }
  openCm.add(id); drawPost(id);
  if (!cmts[id]) await loadCm(id);
}
async function loadCm(id){
  const { data, error } = await sb.from("comments").select("id,user_id,body,created_at,profiles(name,avatar_url)").eq("post_id", id).order("created_at");
  if (error) return alert(error.message);
  cmts[id] = data; drawPost(id);
}
async function addCm(id){
  const el = $("c-" + id), body = el && el.value.trim();
  if (!body) return;
  const { error } = await sb.from("comments").insert({ post_id: id, user_id: me.id, body });
  if (error) return alert(error.message);
  await loadCm(id);
  const n = $("c-" + id); if (n) n.focus();
}
async function delCm(pid, id){
  if (!confirm("Delete this comment?")) return;
  const { error } = await sb.from("comments").delete().eq("id", id);
  if (error) return alert(error.message);
  cmts[pid] = (cmts[pid] || []).filter(c => c.id !== id); drawPost(pid);
}
async function delPost(id){
  const p = feed.find(x => x.id === id); if (!p) return;
  if (!confirm("Delete this post?")) return;
  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) return alert(error.message);
  if (p.image_url){
    const i = p.image_url.indexOf("/" + BUCKET + "/");
    if (i > -1) sb.storage.from(BUCKET).remove([decodeURIComponent(p.image_url.slice(i + BUCKET.length + 2))]);
  }
  feed = feed.filter(x => x.id !== id); drawFeed();
  if (tab === "post") goBack();
}
function pickPhoto(input){
  const f = input.files && input.files[0];
  if (!f) return;
  pickedFile = f;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(f);
  $("prev").innerHTML = `<div class="prev"><img src="${previewUrl}" alt="Selected photo"><button onclick="clearPhoto()" aria-label="Remove photo">✕</button></div>`;
}
function clearPhoto(){ pickedFile = null; $("prev").innerHTML = ""; $("p-file").value = ""; }
async function shrink(file, max = 1280){
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
    return blob || file;
  } catch (e) { return file; }
}
async function addPost(){
  const body = $("p-body").value.trim();
  if (!body && !pickedFile) return;
  const btn = $("p-go"); btn.disabled = true;
  let image_url = null;
  if (pickedFile){
    const blob = await shrink(pickedFile);
    const path = `${me.id}/${Date.now()}.jpg`;
    const { error: ue } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (ue){ btn.disabled = false; return alert("Photo upload failed: " + ue.message); }
    image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const { error } = await sb.from("posts").insert({ user_id: me.id, body, image_url });
  if (error){ btn.disabled = false; return alert(error.message); }
  renderHome();
}

/* ---------- reels / marketplace (coming soon) ---------- */
function renderSoon(t){
  const reels = t === "reels";
  const icon = reels ? '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>' : '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9c0 1.7 1.3 3 2.7 3S9.3 10.7 9.3 9c0 1.7 1.3 3 2.7 3s2.7-1.3 2.7-3c0 1.7 1.3 3 2.7 3S20 10.7 20 9"/><path d="M5 12v8h14v-8"/><path d="M10 20v-4h4v4"/>';
  $("main").innerHTML = `<div class="card soon"><div class="big"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></div><h3>${reels ? "Reels" : "Marketplace"}</h3><p>${reels ? "Short videos are coming soon." : "Buy and sell with your friends. Coming soon."}</p></div>`;
}

/* ---------- friends ---------- */
async function renderFriends(){
  $("main").innerHTML = `<div class="empty">Loading…</div>`;
  const [{ data: people }, { data: fr }] = await Promise.all([
    sb.from("profiles").select("id,name,bio,avatar_url").neq("id", me.id).order("name"),
    sb.from("friendships").select("id,requester,addressee,status")
  ]);
  const byId = {}; (people || []).forEach(p => { byId[p.id] = p; nameCache[p.id] = p.name; });
  const rel = {}; (fr || []).forEach(f => rel[f.requester === me.id ? f.addressee : f.requester] = f);
  const incoming = (fr || []).filter(f => f.addressee === me.id && f.status === "pending");
  const friends = (fr || []).filter(f => f.status === "accepted");
  const others = (people || []).filter(p => !rel[p.id]);
  const person = (p, extra) => `<div class="card row">${avatar(p.name, true, p.avatar_url, p.id)}<div style="flex:1"><div class="name lnk" onclick="openProfile('${p.id}')">${esc(p.name)}</div>${p.bio ? `<div class="meta">${esc(p.bio)}</div>` : ""}${extra}</div></div>`;
  let h = "";
  if (incoming.length){
    h += `<h2 class="h2">Friend requests</h2>` + incoming.map(f => byId[f.requester] ? person(byId[f.requester], `<div class="btns"><button class="btn" onclick="answer(${f.id},'accepted')">Confirm</button><button class="btn alt" onclick="answer(${f.id},'declined')">Delete</button></div>`) : "").join("");
  }
  h += `<h2 class="h2">Your friends</h2>` + (friends.length
    ? friends.map(f => { const o = byId[f.requester === me.id ? f.addressee : f.requester]; return o ? person(o, `<div class="btns"><button class="btn soft" onclick="openChat('${o.id}')">Message</button><button class="btn alt" onclick="unfriend(${f.id},'${o.id}')">Unfriend</button></div>`) : ""; }).join("")
    : `<div class="empty">No friends yet. Add someone below.</div>`);
  h += `<h2 class="h2">People you may know</h2>` + (others.length
    ? others.map(p => person(p, `<div class="btns"><button class="btn soft" onclick="addFriend('${p.id}')">Add friend</button></div>`)).join("")
    : `<div class="empty">No one else has joined yet. Share the link with a friend.</div>`);
  const sent = (fr || []).filter(f => f.requester === me.id && f.status === "pending");
  if (sent.length) h += `<h2 class="h2">Requests you sent</h2>` + sent.map(f => byId[f.addressee] ? person(byId[f.addressee], `<div class="meta">Waiting for a reply</div>`) : "").join("");
  $("main").innerHTML = h;
}
async function addFriend(id){
  const { error } = await sb.from("friendships").insert({ requester: me.id, addressee: id });
  if (error) alert(error.message);
  tab === "profile" ? renderProfile(viewId) : renderFriends();
}
const nameCache = {};
async function unfriend(fid, uid){
  const n = nameCache[uid] || "this person";
  if (!confirm("Unfriend " + n + "?")) return;
  const { data, error } = await sb.from("friendships").delete().eq("id", fid).select("id");
  if (error) return alert(error.message);
  if (!data || !data.length) return alert("Could not unfriend. Run migration-5.sql in Supabase first.");
  tab === "profile" ? renderProfile(viewId) : renderFriends();
}
async function answer(id, status){
  const { error } = await sb.from("friendships").update({ status }).eq("id", id);
  if (error) alert(error.message);
  tab === "profile" ? renderProfile(viewId) : renderFriends();
  refreshBell();
}

/* ---------- profile ---------- */
const ICON_BACK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8"/></svg>`;
const COVER_WAVES = `<svg class="cw" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true"><path d="M215 0C235 62 330 78 400 38V0z" fill="rgba(90,165,255,.42)"/><path d="M0 120C90 88 170 150 260 112S370 86 400 100V160H0z" fill="rgba(255,255,255,.09)"/><path d="M300 0C300 40 350 60 400 62V0z" fill="rgba(255,255,255,.1)"/><circle cx="60" cy="40" r="46" fill="rgba(255,255,255,.06)"/></svg>`;
const IC = {
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  share: '<path d="M14 4l7 6-7 6v-4c-6 0-9 2-11 6 1-7 4-11 11-12z"/>',
  doc: '<path d="M6 3h8l4 4v14H6z" fill="currentColor"/><path d="M9 12h6M9 16h6" stroke="#fff"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M18 14c2.5.4 4 2.2 4 5"/>',
  thumb: '<path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  cal: '<rect x="4" y="5" width="16" height="16" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  vid: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5l5 2.5-5 2.5z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.800 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
  userx: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 10h6"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.500V16c0 1.500 3 3 6 3s6-1.500 6-3v-4.500"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1"/><path d="M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1"/>'
};
const ic = (n, c) => `<svg class="ic ${c || ""}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
function siteUrl(w){ return /^https?:\/\//i.test(w) ? w : "https://" + w; }
function joinedOn(u){ return u.created_at ? new Date(u.created_at).toLocaleDateString("en", { month: "long", year: "numeric" }) : ""; }
function introRows(u){
  const r = [];
  if (u.location) r.push(["pin", "Lives in <b>" + esc(u.location) + "</b>"]);
  if (u.work) r.push(["brief", "Works at <b>" + esc(u.work) + "</b>"]);
  if (u.education) r.push(["cap", "Studied at <b>" + esc(u.education) + "</b>"]);
  if (u.website) r.push(["link", `<a href="${esc(siteUrl(u.website))}" target="_blank" rel="noopener noreferrer">${esc(u.website)}</a>`]);
  if (joinedOn(u)) r.push(["cal", "Joined <b>" + joinedOn(u) + "</b>"]);
  return r;
}
async function renderProfile(id){
  const mine = id === me.id;
  pfTab = "posts";
  $("main").innerHTML = `<div class="empty">Loading…</div>`;
  let u = me, fr = null, fcount = 0, fppl = [];
  const pc = sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", id);
  if (!mine){
    const [{ data: pr, error }, { data: f }, { count: pcount }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", id).maybeSingle(),
      sb.from("friendships").select("id,requester,addressee,status")
        .or(`and(requester.eq.${me.id},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${me.id})`).maybeSingle(),
      pc
    ]);
    if (!(cur && cur.t === "profile" && cur.id === id)) return;
    if (!pr) { $("main").innerHTML = `<button class="back" onclick="goBack()">‹ Back</button><div class="empty">${error ? esc(error.message) : "Profile not found."}</div>`; return; }
    u = pr; fr = f; u._posts = pcount || 0; nameCache[id] = pr.name;
  } else {
    const [{ count: pcount }, { data: fa }] = await Promise.all([pc, sb.from("friendships").select("requester,addressee").eq("status", "accepted")]);
    const ids = (fa || []).map(f => f.requester === me.id ? f.addressee : f.requester);
    fcount = ids.length;
    if (ids.length){ const { data: pp } = await sb.from("profiles").select("id,name,avatar_url").in("id", ids.slice(0, 6)); fppl = pp || []; }
    if (!(cur && cur.t === "me")) return;
    u = Object.assign({}, me, { _posts: pcount || 0 });
  }
  const verified = VERIFIED.includes(String(u.name || "").toLowerCase()) ? ICON_VERIFIED : "";
  const cover = u.cover_url ? `<img src="${esc(u.cover_url)}" alt="Cover photo" onclick="openPhoto(this.src)">` : COVER_WAVES;
  const topBtn = mine ? `<button class="cvcam" onclick="$('cv-file').click()">${ic("cam")}Cover</button>` : `<button class="cvb" onclick="goBack()" aria-label="Back">${ICON_BACK}</button>`;
  const avAct = mine ? `<button class="cam" onclick="$('av-file').click()" aria-label="Change photo">${ic("cam")}</button>` : "";
  const avImg = u.avatar_url ? avatar(u.name, "xl", u.avatar_url).replace("<img ", `<img onclick="openPhoto('${esc(u.avatar_url)}')" `) : avatar(u.name, "xl");
  const tag = u.bio ? `<div class="pbio${u.bio.length <= 40 && !/\n/.test(u.bio) ? " ln" : ""}"><span>${esc(u.bio)}</span></div>` : mine ? `<div class="meta">Add a short bio</div>` : "";
  let h = `<div class="pcvr">${cover}${topBtn}</div><div class="card pinfo"><div class="pavw">${avImg}${avAct}</div><div class="nm">${esc(u.name)}${verified}</div>${tag}`;
  if (mine) h += `<input id="av-file" type="file" accept="image/*" class="hidden" onchange="setAvatar(this)"><input id="cv-file" type="file" accept="image/*" class="hidden" onchange="setCover(this)"><div id="av-msg" class="meta"></div>`;
  h += `<div class="stats" style="width:100%"><div>${ic("doc")}<b>${u._posts}</b><span>Posts</span></div>${mine ? `<div>${ic("people", "fill")}<b>${fcount}</b><span>Friends</span></div>` : ""}<div>${ic("thumb", "fill")}<b id="st-likes">–</b><span>Likes</span></div></div><div class="pbtns">`;
  if (mine){
    h += `<button class="btn" onclick="openEdit()">${ic("pen")}Edit profile</button><button class="btn alt" onclick="shareProfile()">${ic("share")}Share profile</button>`;
  } else {
    if (!fr) h += `<button class="btn" onclick="addFriend('${id}')">${ic("plus")}Add friend</button>`;
    else if (fr.status === "accepted") h += `<button class="btn" onclick="openChat('${id}')">${ic("chat")}Message</button><button class="btn alt" onclick="unfriend(${fr.id},'${id}')">${ic("userx")}Unfriend</button>`;
    else if (fr.status === "pending" && fr.requester === me.id) h += `<div class="meta">Request sent · waiting for a reply</div>`;
    else if (fr.status === "pending") h += `<button class="btn" onclick="answer(${fr.id},'accepted')">Confirm</button><button class="btn alt" onclick="answer(${fr.id},'declined')">Delete</button>`;
    const isFr = fr && fr.status === "accepted";
    h += `<button class="btn alt" ${isFr ? 'style="flex:none;width:50px;padding:0" aria-label="Share"' : ""} onclick="shareProfile('${esc(u.name).replace(/'/g, "")}')">${ic("share")}${isFr ? "" : "Share"}</button>`;
  }
  h += `</div>`;
  if (!mine) h += `<div class="btns"><button class="btn soft" style="width:100%" onclick="${blockSet.has(id) ? "unblockUser" : "blockUser"}('${id}')">🚫 ${blockSet.has(id) ? "Unblock" : "Block"}</button></div>`;
  h += `</div>`;
  const rows = introRows(u);
  if (rows.length || mine){
    h += `<div class="card intro"><svg class="swoosh" viewBox="0 0 120 74" aria-hidden="true"><path d="M30 0C80 4 112 30 120 74V0z" fill="rgba(90,140,255,.22)"/><path d="M62 0C98 6 116 26 120 52V0z" fill="#2F6BFF"/></svg><div class="ihead"><i>${ic("user")}</i>Intro</div>${rows.map(r => `<div class="irow"><span class="ico">${ic(r[0])}</span><span>${r[1]}</span></div>`).join("")}`;
    if (mine && rows.length < 5) h += `<div class="btns"><button class="btn soft" style="width:100%" onclick="openEdit()">${ic("plus")}Add more details</button></div>`;
    h += `</div>`;
  }
  if (mine && fppl.length){
    h += `<div class="card"><div class="ctitle">Friends <small>${fcount} total</small></div><div class="fgrid">${fppl.map(p => `<div class="f">${avatar(p.name, false, p.avatar_url, p.id)}<div class="nmx">${esc(p.name)}</div></div>`).join("")}</div><div class="btns"><button class="btn soft" style="width:100%" onclick="go('friends')">See all friends</button></div></div>`;
  }
  h += `<div class="seg"><button id="sg-posts" class="on" onclick="setPfTab('posts')">${ic("grid")}Posts</button><button id="sg-photos" onclick="setPfTab('photos')">${ic("img")}Photos</button><button id="sg-videos" onclick="setPfTab('videos')">${ic("vid")}Videos</button></div><div id="feed"><div class="empty">Loading…</div></div>`;
  if (mine) h += `<div class="card"><button class="btn alt" style="width:100%;margin-bottom:8px" onclick="openSaved()">🔖 Saved posts (${saved.size})</button><button class="btn alt" style="width:100%" onclick="logout()">Log out</button></div>`;
  $("main").innerHTML = h;
  if (mine) updateHeader();
  loadFeed(id);
}
function setPfTab(t){
  pfTab = t;
  ["posts", "photos", "videos"].forEach(x => { const b = $("sg-" + x); if (b) b.classList.toggle("on", x === t); });
  if ($("feed") && feed) drawFeed();
}
async function shareProfile(name){
  const data = { title: "Circle", text: (name || me.name) + " on Circle", url: location.origin + "/" };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); alert("Link copied"); }
  } catch (e) {}
}
function renderEdit(){
  const f = (id, label, val, ph, max) => `<label class="fld" for="${id}">${label}</label><input id="${id}" maxlength="${max || 80}" value="${esc(val || "")}" placeholder="${ph || ""}">`;
  $("main").innerHTML = `<button class="back" onclick="goBack()">‹ Back</button><div class="card"><div class="name" style="font-size:20px">Edit profile</div>
    ${f("m-name", "Name", me.name, "", 60)}
    <label class="fld" for="m-bio">About you</label><textarea id="m-bio" maxlength="200" placeholder="A short bio (optional)">${esc(me.bio || "")}</textarea>
    ${f("m-loc", "Lives in", me.location, "City, Country")}
    ${f("m-work", "Works at", me.work, "Job or company")}
    ${f("m-edu", "Studied at", me.education, "School or university")}
    ${f("m-web", "Website", me.website, "example.com", 120)}
    <div id="m-msg" class="meta" style="min-height:20px;margin-top:8px"></div>
    <div class="btns"><button class="btn alt" onclick="goBack()">Cancel</button><button class="btn" onclick="saveProfile()">Save</button></div>
    <div class="meta" style="margin-top:12px">Change your profile photo or cover from your profile page (tap the 📷).</div></div>`;
}
async function saveProfile(){
  const v = id => $(id).value.trim();
  const name = v("m-name"), bio = v("m-bio");
  if (!name){ $("m-msg").textContent = "Name cannot be empty."; return; }
  const extra = { location: v("m-loc") || null, work: v("m-work") || null, education: v("m-edu") || null, website: v("m-web") || null };
  let { data, error } = await sb.from("profiles").update({ name, bio, ...extra }).eq("id", me.id).select("*").single();
  if (error && /column|schema cache/i.test(error.message)){
    ({ data, error } = await sb.from("profiles").update({ name, bio }).eq("id", me.id).select("*").single());
    if (!error){ me = data; updateHeader(); $("m-msg").textContent = "Name and bio saved. To save the other details, run migration-4.sql in Supabase first."; return; }
  }
  if (error){ $("m-msg").textContent = error.message; return; }
  me = data; updateHeader(); goBack();
}
async function cropTo(file, w, h){
  try {
    const bmp = await createImageBitmap(file);
    const ar = w / h; let sw = bmp.width, sh = sw / ar;
    if (sh > bmp.height){ sh = bmp.height; sw = sh * ar; }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.85)) || file;
  } catch (e) { return file; }
}
function dropOld(url){ if (!url) return; const i = url.indexOf("/" + BUCKET + "/"); if (i > -1) sb.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + BUCKET.length + 2))]); }
async function setImage(input, kind){
  const f = input.files && input.files[0]; if (!f) return;
  const msg = $("av-msg"); msg.textContent = "Uploading…";
  const blob = kind === "avatar" ? await cropTo(f, 480, 480) : await cropTo(f, 1280, 540);
  const path = `${me.id}/${kind}-${Date.now()}.jpg`;
  const { error: ue } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (ue){ msg.textContent = "Upload failed: " + ue.message; return; }
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const col = kind === "avatar" ? "avatar_url" : "cover_url", old = me[col];
  const { data, error } = await sb.from("profiles").update({ [col]: url }).eq("id", me.id).select("*").single();
  if (error){
    sb.storage.from(BUCKET).remove([path]);
    msg.textContent = /column|schema cache/i.test(error.message) ? "Cover photos need migration-4.sql to be run in Supabase first." : error.message;
    return;
  }
  me = data; dropOld(old); rerender();
}
const setAvatar = input => setImage(input, "avatar");
const setCover = input => setImage(input, "cover");

/* ---------- search + saved ---------- */
function renderSearch(){
  $("main").innerHTML = `<div class="card"><input id="s-q" placeholder="Search people by name…" oninput="searchSoon()" aria-label="Search people" autocomplete="off"></div><div id="s-res"><div class="empty">Type a name to find people.</div></div>`;
  $("s-q").focus();
}
let searchT;
function searchSoon(){ clearTimeout(searchT); searchT = setTimeout(doSearch, 250); }
async function doSearch(){
  const box = $("s-q"); if (!box) return;
  const q = box.value.trim().replace(/[%_,()]/g, "");
  if (!q){ $("s-res").innerHTML = `<div class="empty">Type a name to find people.</div>`; return; }
  const { data, error } = await sb.from("profiles").select("id,name,bio,avatar_url").ilike("name", "%" + q + "%").limit(20);
  if (!$("s-res") || tab !== "search") return;
  $("s-res").innerHTML = error ? `<div class="empty">${esc(error.message)}</div>`
    : !data.length ? `<div class="empty">No one found.</div>`
    : data.map(u => `<div class="card row lnk" style="margin-bottom:10px" onclick="openProfile('${u.id}')">${avatar(u.name, true, u.avatar_url)}<div><div class="name">${esc(u.name)}</div>${u.bio ? `<div class="meta">${esc(u.bio)}</div>` : ""}</div></div>`).join("");
}
function renderPost(id){
  $("main").innerHTML = `<button class="back" onclick="goBack()">‹ Back</button><div id="feed"><div class="empty">Loading…</div></div>`;
  loadFeed(null, [id]);
}
function renderSaved(){
  $("main").innerHTML = `<button class="back" onclick="goBack()">‹ Back</button><div id="feed"><div class="empty">Loading…</div></div>`;
  loadFeed(null, [...saved]);
}


/* ---------- sound ---------- */
let audioCtx = null;
function unlockAudio(){
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {}
}
["click", "touchstart", "keydown"].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
function tone(kind){
  const k = kind === "in" ? "in" : "out";
  try {
    const t = TONES[cfg[k + "Tone"]] || TONES.chime, vol = (VOLS[cfg.vol] || VOLS.high)[1] * (k === "in" ? 1 : .75) * .8;
    const play = () => t[1].forEach(([f, d, len]) => {
      const now = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(vol, now + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + len + 0.1);
      o.connect(g); g.connect(audioCtx.destination); o.start(now + d); o.stop(now + d + len + 0.15);
    });
    if (!audioCtx) unlockAudio();
    if (audioCtx && t[1].length){ if (audioCtx.state === "running") play(); else audioCtx.resume().then(play).catch(() => {}); }
  } catch (e) {}
  try { const v = VIBS[cfg[k + "Vib"]]; if (v && v[1].length && navigator.vibrate) navigator.vibrate(v[1]); } catch (e) {}
}

/* ---------- realtime (instant messages) ---------- */
let rt = null;
function startRealtime(){
  if (rt || !me) return;
  try {
    rt = sb.channel("msgs-" + me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "receiver=eq." + me.id }, p => onIncoming(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: "sender=eq." + me.id }, p => {
        if (cur && cur.t === "chat" && p.new && cur.id === p.new.receiver) loadChat(false);
      })
      .subscribe(st => { rtOk = st === "SUBSCRIBED"; });
  } catch (e) {}
}
function onIncoming(m){
  if (!m || blockSet.has(m.sender)) return;
  sb.from("messages").update({ delivered_at: new Date().toISOString() }).eq("id", m.id).is("delivered_at", null).then(() => {}, () => {});
  const inThis = cur && cur.t === "chat" && cur.id === m.sender;
  tone("in");
  if (inThis) loadChat(false);
  else { refreshBell(); if (cur && cur.t === "inbox") renderInbox(); }
}

/* ---------- online status: Realtime presence + last_seen heartbeat ---------- */
let pres = null, onlineIds = new Set(), presOk = false, seenAt = {}, seenOk = false;
const isOn = id => onlineIds.has(id) || (seenAt[id] && Date.now() - seenAt[id] < 80000);
function startPresence(){
  if (!me) return;
  if (pres){ try { sb.removeChannel(pres); } catch (e) {} pres = null; }
  try {
    pres = sb.channel("online-users", { config: { presence: { key: me.id } } });
    pres.on("presence", { event: "sync" }, () => {
      onlineIds = new Set(Object.keys(pres.presenceState()));
      presOk = true; paintPresence();
    }).subscribe(st => { if (st === "SUBSCRIBED" && cfg.online && !document.hidden) { try { pres.track({ at: Date.now() }); } catch (e) {} } });
  } catch (e) {}
}
function setPresence(){
  if (!pres) return;
  try { (cfg.online && !document.hidden) ? pres.track({ at: Date.now() }) : pres.untrack(); } catch (e) {}
}
async function refreshSeen(){
  if (!me) return;
  const ids = new Set([...document.querySelectorAll(".avwrap[data-uid]")].map(e => e.dataset.uid));
  if (cur && cur.t === "chat" && chatId) ids.add(chatId);
  ids.delete(me.id);
  if (!ids.size) return;
  const { data, error } = await sb.from("profiles").select("id,last_seen").in("id", [...ids]);
  if (error || !data) return;
  seenOk = true;
  data.forEach(p => { seenAt[p.id] = p.last_seen ? new Date(p.last_seen).getTime() : 0; });
  paintPresence();
}
async function beat(){
  if (!me || document.hidden) return;
  if (cfg.online) sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", me.id).then(() => {}, () => {});
  setPresence();
  await refreshSeen();
}
document.addEventListener("visibilitychange", () => {
  if (!me) return;
  if (document.hidden) return setPresence();
  if (pres && pres.state !== "joined") startPresence();
  beat();
  if (cur && cur.t === "chat") loadChat(false);
});
window.addEventListener("online", () => { if (me){ startPresence(); beat(); } });
setInterval(beat, 25000);
function paintChatStatus(){
  const w = $("chat-avw"), s = $("chat-sub"); if (!w || !s) return;
  const on = !!isOn(chatId);
  w.classList.toggle("on", on);
  s.textContent = (presOk || seenOk) ? (on ? "Online" : "Offline") : "";
}
function paintPresence(){
  if (cur && cur.t === "chat") paintChatStatus();
  document.querySelectorAll(".avwrap[data-uid]").forEach(el => el.classList.toggle("on", !!isOn(el.dataset.uid)));
}

/* ---------- small helpers for the chat look ---------- */
function soon(t){
  let el = $("toast");
  if (!el){ el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.remove("hidden");
  clearTimeout(soon.t); soon.t = setTimeout(() => el.classList.add("hidden"), 2200);
}
const EMOJIS = ["😊","😂","😍","🥰","😘","😉","😎","🤗","🙂","😢","😭","😕","😮","😡","🤔","😴","👍","🙏","❤️","💙","🔥","🎉","✨","🌹"];
function toggleEmo(id){ const t = $(id || "emo"); if (t) t.classList.toggle("hidden"); }
const POST_EMOJIS = ["😊","😂","🤣","😍","🥰","😘","😉","😎","🤗","🙂","😢","😭","😮","😡","🤔","😴","🥳","😇","🤩","😋","😅","🙈","💪","👍","👏","🙏","❤️","💙","💜","💔","🔥","🎉","✨","🌹","🌞","🌈","🎂","🎁","📸","🇱🇰"];
const emoTray = (id, target) => `<div id="${id}" class="emo-tray hidden">${POST_EMOJIS.map(e => `<button onmousedown="event.preventDefault()" onclick="addEmo('${e}','${target}')" aria-label="${e}">${e}</button>`).join("")}</div>`;
function addEmo(e, tid){
  const el = $(tid || "chat-in"); if (!el) return;
  const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
  el.value = el.value.slice(0, a) + e + el.value.slice(b);
  el.selectionStart = el.selectionEnd = a + e.length;
  el.dispatchEvent(new Event("input"));
}
function emojiOnly(s){
  try { return /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(s) && s.trim().length <= 24; } catch (e) { return false; }
}
const ICON_SMILE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M8 14.5c1 1.5 2.2 2.2 4 2.2s3-.7 4-2.2"/></svg>`;
const ICON_CLIP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5l-8 8a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.700 3.700 0 0 1 5.200 5.200l-8.500 8.500a1.900 1.900 0 0 1-2.600-2.600l7.800-7.800"/></svg>`;
const ICON_PHONE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="currentColor"/></svg>`;
const ICON_VIDEO = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="currentColor"/><path d="M16 10.500l5-3v9l-5-3z" fill="currentColor"/></svg>`;
const ICON_INFO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6" stroke-width="2.800"/><circle cx="12" cy="7.200" r="1" fill="currentColor"/></svg>`;

/* ---------- messages ---------- */
let chatId = null, chatKey = "", chatPoll = null, chatServer = [], chatPending = [];
function stopChatPoll(){ if (chatPoll){ clearInterval(chatPoll); chatPoll = null; } }
const ICON_MORE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>`;
function msgErr(m){
  if (/image_url|hide_seen|blocks/i.test(m)) return "Run migration-chat-v17.sql in Supabase first.";
  if (/row-level security/i.test(m)) return "You can't message this person.";
  return /relation|schema cache|does not exist|permission denied/i.test(m) ? "Messages need migration-5.sql to be run in Supabase first." : m;
}
function clock(t){ return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function dayLabel(t){
  const d = new Date(t), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: d.getFullYear() === n.getFullYear() ? undefined : "numeric" });
}
/* status of my message: sending / sent / delivered / seen */
function msgState(m){ return m.pending ? "sending" : (m.read_at && !m.hide_seen) ? "seen" : (m.delivered_at || m.read_at) ? "delivered" : "sent"; }
const TICK1 = `<svg class="tk" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5"/></svg>`;
const TICK2 = `<svg class="tk tk2" viewBox="0 0 22 16" aria-hidden="true"><path d="M2 8.5l3.2 3.2L12 5"/><path d="M9 11.5l.7.7L18 5"/></svg>`;
const TICKW = `<svg class="tk" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/></svg>`;
function tickHtml(s){ return s === "sending" ? TICKW : s === "sent" ? TICK1 : TICK2; }

/* avatar with a green dot that shows only while that person is online */
function avOn(p){ return `<span class="avwrap${isOn(p.id) ? " on" : ""}" data-uid="${p.id}">${avatar(p.name, true, p.avatar_url)}<i class="dot"></i></span>`; }
function newChat(){ const s = $("start-chat"); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); else go("friends"); }
async function renderInbox(){
  $("main").innerHTML = `<div class="empty">Loading…</div>`;
  const [{ data, error }, { data: fa }] = await Promise.all([
    sb.from("messages").select("*").or(`sender.eq.${me.id},receiver.eq.${me.id}`).order("created_at", { ascending: false }).limit(300),
    sb.from("friendships").select("requester,addressee").eq("status", "accepted")
  ]);
  if (!(cur && cur.t === "inbox")) return;
  if (error){ $("main").innerHTML = `<div class="empty">${esc(msgErr(error.message))}</div>`; return; }
  const conv = new Map();
  data.forEach(m => {
    const o = m.sender === me.id ? m.receiver : m.sender;
    let c = conv.get(o); if (!c){ c = { id: o, last: m, unread: 0 }; conv.set(o, c); }
    if (m.receiver === me.id && !m.read_at) c.unread++;
  });
  pins.forEach(pid => { if (!conv.has(pid)) conv.set(pid, { id: pid, last: null, unread: 0 }); });
  const fids = (fa || []).map(f => f.requester === me.id ? f.addressee : f.requester).filter(i => !conv.has(i));
  const ids = [...new Set([...conv.keys(), ...fids])];
  let ppl = {};
  if (ids.length){ const { data: pp } = await sb.from("profiles").select("id,name,avatar_url").in("id", ids); (pp || []).forEach(p => ppl[p.id] = p); }
  if (!(cur && cur.t === "inbox")) return;
  let h = "";
  if (conv.size){
    const list = [...conv.values()].sort((a, b) => { const x = pins.indexOf(a.id), y = pins.indexOf(b.id); return x > -1 && y > -1 ? x - y : x > -1 ? -1 : y > -1 ? 1 : 0; });
    h += list.map(c => {
      const p = ppl[c.id]; if (!p) return "";
      const pinned = pins.includes(c.id), L = c.last, mine = L && L.sender === me.id;
      return `<div class="card crow${c.unread ? " un" : ""}" onclick="openChat('${c.id}')">${avOn(p)}<div class="mid"><div class="top"><span class="name">${esc(p.name)}</span><span class="tr"><span class="meta">${L ? ago(L.created_at) : ""}</span><button class="pinb${pinned ? " on" : ""}" onclick="event.stopPropagation();togglePin('${c.id}')" aria-label="Pin chat">📌</button></span></div><div class="last">${L ? (mine && cfg.ticks ? `<span class="tkl s-${msgState(L)}">${tickHtml(msgState(L))}</span>` : "") + esc(L.body) : "Tap to send a message"}</div></div>${c.unread ? `<span class="ubadge">${c.unread > 9 ? "9+" : c.unread}</span>` : ""}</div>`;
    }).join("");
  } else {
    h += `<div class="empty">No messages yet. Pick a friend below to start chatting.</div>`;
  }
  const fl = fids.map(i => ppl[i]).filter(Boolean);
  if (fl.length){
    h += `<h2 class="h2" id="start-chat">Start a chat</h2>` + fl.map(p => `<div class="card crow" onclick="openChat('${p.id}')">${avOn(p)}<div class="mid"><div class="name">${esc(p.name)}</div><div class="meta">Tap to send a message</div></div></div>`).join("");
  } else if (!conv.size){
    h += `<div class="empty">Add some friends first, then you can message them.</div>`;
  }
  $("main").innerHTML = h; refreshSeen();
}
async function renderChat(id){
  stopChatPoll();
  chatId = id; chatKey = ""; chatServer = []; chatPending = [];
  $("main").innerHTML = `<div class="chat"><div class="chat-top"><button class="bk" onclick="goBack()" aria-label="Back">${ICON_BACK}</button><div id="chat-who" class="chat-who"></div><div class="chat-act"><button class="hb" onclick="soon('Voice calls are coming soon')" aria-label="Voice call">${ICON_PHONE}</button><button class="hb" onclick="soon('Video calls are coming soon')" aria-label="Video call">${ICON_VIDEO}</button><button class="hb" onclick="chatMenu()" aria-label="More">${ICON_MORE}</button></div></div><div id="chat-list" class="chat-list"><div class="empty">Loading…</div></div><div id="chat-foot"></div></div>`;
  const [{ data: u }, { data: f }] = await Promise.all([
    sb.from("profiles").select("id,name,avatar_url").eq("id", id).maybeSingle(),
    sb.from("friendships").select("id").eq("status", "accepted")
      .or(`and(requester.eq.${me.id},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${me.id})`).maybeSingle()
  ]);
  if (!(cur && cur.t === "chat" && cur.id === id)) return;
  if (!u){ $("chat-list").innerHTML = `<div class="empty">Person not found.</div>`; return; }
  $("chat-who").innerHTML = `<span class="avw" id="chat-avw">${avatar(u.name, false, u.avatar_url)}<i class="odot"></i></span><span class="wtx"><b>${esc(u.name)}</b><small id="chat-sub"></small></span>`;
  $("chat-who").onclick = () => openProfile(id);
  paintChatStatus(); refreshSeen();
  $("chat-foot").innerHTML = f
    ? `<div id="emo" class="emo-tray hidden">${EMOJIS.map(e => `<button onmousedown="event.preventDefault()" onclick="addEmo('${e}')" aria-label="${e}">${e}</button>`).join("")}</div><div class="chat-bar"><div class="cb-field"><button class="cb-ico" onmousedown="event.preventDefault()" onclick="toggleEmo()" aria-label="Emoji">${ICON_SMILE}</button><textarea id="chat-in" rows="1" maxlength="1000" placeholder="Message…" aria-label="Message" oninput="this.style.height='auto';this.style.height=Math.min(120,Math.max(46,this.scrollHeight))+'px'" onfocus="setTimeout(chatBottom,350)"></textarea><button class="cb-ico" onclick="$('chat-file').click()" aria-label="Attach">${ICON_CLIP}</button><input id="chat-file" type="file" accept="image/*" class="hidden" onchange="sendChatPhoto(this)"></div><button class="btn send" id="chat-send" onclick="sendChat()" aria-label="Send">${ICON_SEND}</button></div>`
    : `<div class="chat-note">You can only message people who are your friends.</div>`;
  await blocksP;
  if (f && blockSet.has(id)) $("chat-foot").innerHTML = `<div class="chat-note">You blocked this person. <button class="lnk" onclick="unblockUser('${id}')">Unblock</button></div>`;
  else if (f && blockedBy.has(id)) $("chat-foot").innerHTML = `<div class="chat-note">You can't message this person.</div>`;
  await loadChat(true);
  chatPoll = setInterval(() => { if (!document.hidden) loadChat(false); }, rtOk ? 6000 : 2500);
}
function chatBottom(){ const l = $("chat-list"); if (l) l.scrollTop = l.scrollHeight; }
function drawChat(first){
  const list = $("chat-list"); if (!list) return;
  const msgs = [...chatServer, ...chatPending];
  const key = msgs.map(m => m.id + ":" + msgState(m.sender === me.id ? m : {})).join(",");
  if (!first && key === chatKey) return;
  chatKey = key;
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
  let html = "", lastDay = "";
  if (!msgs.length) html = `<div class="empty" style="margin:auto">Say hi 👋</div>`;
  msgs.forEach(m => {
    const d = dayLabel(m.created_at);
    if (d !== lastDay){ html += `<div class="dsep">${esc(d)}</div>`; lastDay = d; }
    const mine = m.sender === me.id, st = mine && cfg.ticks ? msgState(m) : "";
    const cap = m.image_url && m.body === "📷 Photo" ? "" : esc(m.body);
    html += `<div class="msg ${mine ? "me" : "them"}${!m.image_url && emojiOnly(m.body) ? " emo" : ""}${m.image_url ? " img" : ""}">${m.image_url ? `<img class="mimg" src="${esc(m.image_url)}" alt="Photo" onclick="openPhoto(this.src)">` : ""}${cap}<i>${clock(m.created_at)}</i></div>${st ? `<div class="tkrow s-${st}">${tickHtml(st)}</div>` : ""}`;
  });
  const last = msgs[msgs.length - 1];
  if (cfg.ticks && last && last.sender === me.id){
    const st = msgState(last);
    html += `<div class="seen s-${st}">${st === "sending" ? "Sending…" : st === "sent" ? "Sent" : st === "delivered" ? "Delivered" : "Seen"}</div>`;
  }
  list.innerHTML = html;
  if (first || near || (last && last.sender === me.id)) chatBottom();
}
async function loadChat(first){
  const id = chatId;
  const { data, error } = await sb.from("messages").select("*")
    .or(`and(sender.eq.${me.id},receiver.eq.${id}),and(sender.eq.${id},receiver.eq.${me.id})`)
    .order("created_at", { ascending: false }).limit(100);
  if (!(cur && cur.t === "chat" && cur.id === id)) return;
  const list = $("chat-list"); if (!list) return;
  if (error){ if (first) list.innerHTML = `<div class="empty">${esc(msgErr(error.message))}</div>`; return; }
  chatServer = data.slice().reverse();
  drawChat(first);
  if (!document.hidden && chatServer.some(m => m.sender === id && !m.read_at)){
    const now = new Date().toISOString(), upd = { read_at: now, delivered_at: now };
    if (!cfg.rr) upd.hide_seen = true;
    await sb.from("messages").update(upd).eq("sender", id).eq("receiver", me.id).is("read_at", null);
    refreshBell();
  }
}
async function sendChat(){
  const el = $("chat-in"), body = el && el.value.trim();
  if (!body) return;
  unlockAudio();
  const tmp = { id: "t" + Date.now(), sender: me.id, receiver: chatId, body, created_at: new Date().toISOString(), pending: true };
  chatPending.push(tmp); el.value = ""; el.style.height = "46px"; drawChat(true); el.focus();
  const tray = $("emo"); if (tray) tray.classList.add("hidden");
  const { data, error } = await sb.from("messages").insert({ sender: me.id, receiver: chatId, body }).select("*").single();
  chatPending = chatPending.filter(m => m !== tmp);
  if (error){ drawChat(true); el.value = body; return alert(msgErr(error.message)); }
  chatServer.push(data); drawChat(true); tone("out");
}

/* ---------- settings (tones, vibration, seen), stored on this phone ---------- */
const TONES = {
  chime: ["Chime", [[880, 0, .28], [1175, .13, .3]]], bell: ["Bell", [[1318, 0, .5], [1760, .02, .4]]],
  drop: ["Drop", [[900, 0, .12], [500, .08, .2]]], pop: ["Pop", [[620, 0, .1], [820, .07, .14]]],
  marimba: ["Marimba", [[523, 0, .18], [659, .1, .18], [784, .2, .25]]], beep: ["Beep", [[1000, 0, .12], [1000, .18, .12]]],
  off: ["Off", []]
};
const VIBS = {
  short: ["Short", [60]], double: ["Double", [70, 70, 70]], long: ["Long", [220]],
  triple: ["Triple", [60, 50, 60, 50, 60]], pulse: ["Pulse", [80, 60, 160]], off: ["Off", []]
};
const VOLS = { low: ["Low", .35], medium: ["Medium", .6], high: ["High", .9], max: ["Max", 1] };
let cfg = { inTone: "chime", outTone: "pop", inVib: "double", outVib: "short", vol: "high", ticks: true, rr: true, online: true };
try { Object.assign(cfg, JSON.parse(localStorage.getItem("circle_cfg") || "{}")); } catch (e) {}
function saveCfg(){ try { localStorage.setItem("circle_cfg", JSON.stringify(cfg)); } catch (e) {} }
function pickCfg(key, val, kind){ cfg[key] = val; saveCfg(); unlockAudio(); tone(kind); drawSettings(); }
function flipCfg(key){
  cfg[key] = !cfg[key]; saveCfg(); drawSettings();
  if (key === "online"){
    if (!cfg.online) sb.from("profiles").update({ last_seen: null }).eq("id", me.id).then(() => {}, () => {});
    setPresence(); if (cfg.online) beat();
  }
}
function openSettings(){ navTo({ t: "settings" }); }
function chips(key, map, kind){ return `<div class="chips">${Object.entries(map).map(([k, v]) => `<button class="chip${cfg[key] === k ? " on" : ""}" onclick="pickCfg('${key}','${k}','${kind}')">${v[0]}</button>`).join("")}</div>`; }
function swRow(key, label, sub){ return `<div class="swrow" onclick="flipCfg('${key}')"><div><b>${label}</b><small>${sub}</small></div><span class="sw${cfg[key] ? " on" : ""}"><i></i></span></div>`; }
let blkPpl = [];
function renderSettings(){ drawSettings(); fillBlocked(); }
function drawSettings(){
  const m = $("main"), y = m.scrollTop;
  m.innerHTML = `<button class="back" onclick="goBack()">‹ Back</button><div class="card"><div class="ctitle">Sound volume</div>${chips("vol", VOLS, "in")}</div><div class="card"><div class="ctitle">Incoming message</div><div class="meta">Tone (tap to hear it)</div>${chips("inTone", TONES, "in")}<div class="meta">Vibration</div>${chips("inVib", VIBS, "in")}</div>
  <div class="card"><div class="ctitle">When I send</div><div class="meta">Tone</div>${chips("outTone", TONES, "out")}<div class="meta">Vibration</div>${chips("outVib", VIBS, "out")}</div>
  <div class="card"><div class="ctitle">Message status</div>${swRow("ticks", "Show Sent / Delivered / Seen", "Ticks and the status text under my messages")}${swRow("rr", "Let others see when I read", "If off, people see Delivered but never Seen")}</div>
  <div class="card"><div class="ctitle">Privacy</div>${swRow("online", "Show my Online status", "If off, nobody sees you as Online")}</div>
  ${installEv ? `<div class="card"><div class="ctitle">Install app</div><button class="btn" style="width:100%" onclick="doInstall()">📲 Install Circle</button></div>` : ""}
  <div class="card"><div class="ctitle">Blocked people</div><div id="blk-list"></div></div>`;
  m.scrollTop = y; paintBlocked();
}
async function fillBlocked(){
  const ids = [...blockSet];
  blkPpl = [];
  if (ids.length){ const { data } = await sb.from("profiles").select("id,name,avatar_url").in("id", ids); blkPpl = data || []; }
  paintBlocked();
}
function paintBlocked(){
  const el = $("blk-list"); if (!el) return;
  el.innerHTML = blkPpl.length ? blkPpl.filter(p => blockSet.has(p.id)).map(p => `<div class="crow2">${avatar(p.name, false, p.avatar_url)}<b>${esc(p.name)}</b><button class="btn alt" onclick="unblockUser('${p.id}')">Unblock</button></div>`).join("") : `<div class="meta">No blocked people.</div>`;
}

/* ---------- block / unblock ---------- */
let blockSet = new Set(), blockedBy = new Set(), blocksP = Promise.resolve();
async function loadBlocks(){
  const { data, error } = await sb.from("blocks").select("blocker,blocked");
  if (error || !data) return;
  blockSet = new Set(data.filter(b => b.blocker === me.id).map(b => b.blocked));
  blockedBy = new Set(data.filter(b => b.blocked === me.id).map(b => b.blocker));
}
async function blockUser(id){
  if (!confirm("Block this person? You will not be able to message each other.")) return;
  const { error } = await sb.from("blocks").insert({ blocker: me.id, blocked: id });
  if (error) return alert(/relation|schema cache|does not exist|permission/i.test(error.message) ? "Run migration-chat-v17.sql in Supabase first." : error.message);
  blockSet.add(id); soon("Blocked"); if (cur && cur.t !== "settings") rerender(); else fillBlocked();
}
async function unblockUser(id){
  const { error } = await sb.from("blocks").delete().eq("blocker", me.id).eq("blocked", id);
  if (error) return alert(error.message);
  blockSet.delete(id); soon("Unblocked"); if (cur && cur.t === "settings") fillBlocked(); else rerender();
}

/* ---------- pin up to 3 chats (kept on this phone) ---------- */
let pins = [];
try { pins = JSON.parse(localStorage.getItem("circle_pins") || "[]").slice(0, 3); } catch (e) {}
function togglePin(id){
  if (pins.includes(id)) pins = pins.filter(x => x !== id);
  else if (pins.length >= 3) return soon("You can pin up to 3 chats");
  else pins.push(id);
  try { localStorage.setItem("circle_pins", JSON.stringify(pins)); } catch (e) {}
  soon(pins.includes(id) ? "Pinned to top" : "Unpinned");
  if (cur && cur.t === "inbox") renderInbox();
}

/* ---------- bottom sheet + chat menu ---------- */
function closeSheet(){ const d = $("sheet"); if (d) d.remove(); }
function sheet(items){
  closeSheet();
  const d = document.createElement("div"); d.id = "sheet"; d.className = "sheet";
  d.onclick = e => { if (e.target === d) closeSheet(); };
  d.innerHTML = `<div class="sheet-in">${items.map((it, i) => `<button class="${it.cls || ""}" data-i="${i}">${it.label}</button>`).join("")}<button class="cancel" data-i="-1">Cancel</button></div>`;
  d.querySelectorAll("button").forEach(b => b.onclick = () => { const i = +b.dataset.i; closeSheet(); if (i >= 0) items[i].fn(); });
  document.body.appendChild(d);
}
function chatMenu(){
  const id = chatId;
  sheet([
    { label: pins.includes(id) ? "📌 Unpin chat" : "📌 Pin chat to top", fn: () => togglePin(id) },
    { label: "⚙️ Tones & seen settings", fn: openSettings },
    { label: "👤 View profile", fn: () => openProfile(id) },
    blockSet.has(id) ? { label: "✅ Unblock", fn: () => unblockUser(id) } : { label: "🚫 Block", cls: "red", fn: () => blockUser(id) }
  ]);
}

/* ---------- photos in chat ---------- */
async function sendChatPhoto(input){
  const f = input.files && input.files[0]; input.value = "";
  if (!f || !chatId || blockSet.has(chatId)) return;
  unlockAudio();
  const el = $("chat-in"), cap = (el && el.value.trim()) || "📷 Photo";
  const url = URL.createObjectURL(f);
  const tmp = { id: "t" + Date.now(), sender: me.id, receiver: chatId, body: cap, image_url: url, created_at: new Date().toISOString(), pending: true };
  chatPending.push(tmp); if (el){ el.value = ""; el.style.height = "46px"; } drawChat(true);
  const fail = msg => { chatPending = chatPending.filter(m => m !== tmp); drawChat(true); alert(msg); };
  const blob = await shrink(f), path = `${me.id}/chat-${Date.now()}.jpg`;
  const { error: ue } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (ue) return fail("Photo upload failed: " + ue.message);
  const image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await sb.from("messages").insert({ sender: me.id, receiver: chatId, body: cap, image_url }).select("*").single();
  chatPending = chatPending.filter(m => m !== tmp);
  if (error) return fail(msgErr(error.message));
  chatServer.push(data); drawChat(true); tone("out");
}

/* ---------- new post page (opens from the Photo icon) ---------- */
let composeFile = null, composeDraft = "";
function openCompose(){ const b = $("p-body"); composeDraft = b ? b.value : ""; navTo({ t: "compose" }); }
function renderCompose(){
  composeFile = null;
  $("main").innerHTML = `<div class="card comp2"><div class="who">${avatar(me.name, false, me.avatar_url)}<b>${esc(me.name)}</b></div><textarea id="c-body" rows="5" maxlength="1000" placeholder="What is on your mind?" aria-label="New post"></textarea><div id="c-prev"></div><div class="copts"><button onclick="$('c-gal').click()">🖼️ Gallery</button><button onclick="$('c-cam').click()">📷 Camera</button><button onmousedown="event.preventDefault()" onclick="toggleEmo('c-emo')">😊 Emoji</button></div>${emoTray("c-emo", "c-body")}<input id="c-gal" type="file" accept="image/*" class="hidden" onchange="pickCompose(this)"><input id="c-cam" type="file" accept="image/*" capture="environment" class="hidden" onchange="pickCompose(this)"><button class="btn" id="c-go" style="width:100%;margin-top:12px" onclick="submitCompose()">Post</button></div>`;
  $("c-body").value = composeDraft; composeDraft = "";
}
function pickCompose(input){
  const f = input.files && input.files[0]; input.value = "";
  if (!f) return;
  composeFile = f;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(f);
  $("c-prev").innerHTML = `<div class="prev"><img src="${previewUrl}" alt="Selected photo"><button onclick="composeFile=null;$('c-prev').innerHTML=''" aria-label="Remove photo">✕</button></div>`;
}
async function submitCompose(){
  const body = $("c-body").value.trim();
  if (!body && !composeFile) return;
  const btn = $("c-go"); btn.disabled = true; btn.textContent = "Posting…";
  let image_url = null;
  if (composeFile){
    const blob = await shrink(composeFile), path = `${me.id}/${Date.now()}.jpg`;
    const { error: ue } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (ue){ btn.disabled = false; btn.textContent = "Post"; return alert("Photo upload failed: " + ue.message); }
    image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const { error } = await sb.from("posts").insert({ user_id: me.id, body, image_url });
  if (error){ btn.disabled = false; btn.textContent = "Post"; return alert(error.message); }
  goBack();
}

/* ---------- install popup (Chrome "Install app") ---------- */
let installEv = null;
const isInstalled = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEv = e; showInstall(); });
window.addEventListener("appinstalled", () => { installEv = null; hideInstall(); });
function showInstall(){
  if (isInstalled() || !installEv || $("inst")) return;
  try { if (Date.now() - (+localStorage.getItem("circle_inst_no") || 0) < 3 * 864e5) return; } catch (e) {}
  const d = document.createElement("div"); d.id = "inst"; d.className = "inst";
  d.innerHTML = `<img src="icon-192.png" alt=""><div class="it"><b>Install Circle</b><small>Add it to your home screen like an app</small></div><button class="btn" onclick="doInstall()">Install</button><button class="x" onclick="dismissInstall()" aria-label="Close">✕</button>`;
  document.body.appendChild(d);
}
function hideInstall(){ const d = $("inst"); if (d) d.remove(); }
function dismissInstall(){ try { localStorage.setItem("circle_inst_no", String(Date.now())); } catch (e) {} hideInstall(); }
async function doInstall(){
  const ev = installEv; if (!ev) return;
  hideInstall(); ev.prompt();
  const r = await ev.userChoice.catch(() => ({}));
  installEv = null;
  if (r.outcome === "dismissed") dismissInstall();
  if (cur && cur.t === "settings") drawSettings();
}

/* ---------- start ---------- */
(async () => {
  sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") { recovering = true; $("auth").classList.add("hidden"); $("app").classList.add("hidden"); $("reset").classList.remove("hidden"); } });
  const { data: { session } } = await sb.auth.getSession();
  if (recovering) { $("reset").classList.remove("hidden"); return; }
  if (session) boot(session.user); else $("auth").classList.remove("hidden");
})();
setInterval(() => { if (me && !document.hidden) refreshBell(); }, 10000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
