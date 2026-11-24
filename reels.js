/* Circle v27: Reels (short videos). Needs migration-reels-v23.sql (+ migration-reels-v27.sql for emoji reactions) */
const REEL_BUCKET = "reels";
const REEL_MAX_MB = 30, REEL_MAX_SEC = 15, REEL_PICK_MB = 300, REEL_DIRECT_MB = 8;
let reelObs = null, homeObs = null, reelMuted = true, reelList = [], homeReels = [], reelFile = null, reelUrl = null;
let reelStart = null, reelForce = null, reelNoRx = false, reelRxT = null;
let reelAuto = true;
try { reelAuto = localStorage.getItem("circle_reel_auto") !== "0"; } catch (e) {}

const IC_HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`;
const IC_CMT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z"/></svg>`;
const IC_SHR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4l7 6-7 6v-4c-6 0-9 2-11 6 1-7 4-11 11-12z"/></svg>`;
const IC_DEL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;
const IC_SND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const IC_MUT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>`;
const IC_PLAY = `<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>`;
const IC_THUMB2 = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>`;

function allReelVideos(){ return document.querySelectorAll("#reels video, .hr-v"); }
function stopReels(){
  if (reelObs){ reelObs.disconnect(); reelObs = null; }
  if (homeObs){ homeObs.disconnect(); homeObs = null; }
  allReelVideos().forEach(v => { try { v.pause(); } catch (e) {} });
  const a = $("app"); if (a) a.classList.remove("rfull");
  closeReelCm(); closeReelMenu(); if (typeof closeRx === "function") closeRx();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) allReelVideos().forEach(v => { try { v.pause(); } catch (e) {} });
});
function syncMuteBtn(){ document.querySelectorAll("[data-snd]").forEach(b => { b.innerHTML = reelMuted ? IC_MUT : IC_SND; }); }
function toggleReelSound(){
  reelMuted = !reelMuted;
  allReelVideos().forEach(v => { v.muted = reelMuted; });
  syncMuteBtn();
}
async function playReelVideo(v){
  v.muted = reelMuted;
  try { await v.play(); }
  catch (e) { v.muted = true; reelMuted = true; syncMuteBtn(); try { await v.play(); } catch (x) {} }
}

/* ---------- data ---------- */
async function fetchReels(limit){
  for (let k = 0; k < 2; k++){
    const res = await sb.from("reels")
      .select("id,user_id,video_url,caption,created_at,profiles!user_id(name,avatar_url),reel_likes(user_id" + (reelNoRx ? "" : ",reaction") + "),reel_comments(id)")
      .order("created_at", { ascending: false }).limit(limit);
    if (res.error && !reelNoRx && /reaction/i.test(res.error.message)){ reelNoRx = true; continue; }
    return res;
  }
  return { data: null, error: { message: "load failed" } };
}
function findReel(id){
  const lists = (cur && cur.t === "reels") ? [reelList, homeReels] : [homeReels, reelList];
  for (const l of lists){ const r = l.find(x => x.id === id); if (r) return r; }
  return null;
}

/* ---------- reactions (tap = like, hold = emoji bar) ---------- */
function myRx(r){ const m = (r.reel_likes || []).find(l => l.user_id === me.id); return m ? rkey(m) : null; }
function rlLikeBtn(r){
  const k = myRx(r), n = (r.reel_likes || []).length;
  return `<button class="rl-b ${k ? "on" : ""}" id="rl-like-${r.id}" onpointerdown="reelRxDown(event,${r.id})" onpointerup="reelRxUp(event,${r.id})" onpointerleave="reelRxCancel()" onpointercancel="reelRxCancel()" oncontextmenu="return false" aria-label="Like (hold for reactions)">${k ? `<b class="rl-e">${REACTS[k][0]}</b>` : IC_HEART}<span>${n}</span></button>`;
}
function hrLikeBtn(r){
  const k = myRx(r);
  return `<button class="act ${k ? "on" : ""}" id="rl-like-${r.id}" onpointerdown="reelRxDown(event,${r.id})" onpointerup="reelRxUp(event,${r.id})" onpointerleave="reelRxCancel()" onpointercancel="reelRxCancel()" oncontextmenu="return false" aria-label="Like (hold for reactions)">${k ? `<b class="rxe">${REACTS[k][0]}</b><span>${REACTS[k][1]}</span>` : `${IC_THUMB2}<span>Like</span>`}</button>`;
}
function hrReactHtml(r){
  const likes = r.reel_likes || [], n = likes.length, cm = (r.reel_comments || []).length;
  return `<span>${n ? topRx(likes) + n : ""}</span><span class="lnk" onclick="openReelCm(${r.id})">${cm ? cm + (cm > 1 ? " comments" : " comment") : ""}</span>`;
}
function redrawReelLike(id){
  const r = findReel(id); if (!r) return;
  const b = $("rl-like-" + id);
  if (b) b.outerHTML = b.classList.contains("rl-b") ? rlLikeBtn(r) : hrLikeBtn(r);
  const rc = $("hr-react-" + id); if (rc) rc.innerHTML = hrReactHtml(r);
}
function reelRxDown(e, id){
  clearTimeout(reelRxT); const el = e.currentTarget;
  reelRxT = setTimeout(() => { reelRxT = null; try { navigator.vibrate && navigator.vibrate(25); } catch (x) {} showReelRx(id, el); }, 380);
}
function reelRxUp(e, id){ if (reelRxT){ clearTimeout(reelRxT); reelRxT = null; likeReel(id); } }
function reelRxCancel(){ if (reelRxT){ clearTimeout(reelRxT); reelRxT = null; } }
function showReelRx(id, el){
  closeRx();
  const r = el.getBoundingClientRect(), d = document.createElement("div");
  d.id = "rxov"; d.className = "rxov"; d.onclick = closeRx;
  d.innerHTML = `<div class="rxbar" style="bottom:${Math.round(innerHeight - r.top + 8)}px">${Object.entries(REACTS).map(([k, v]) => `<button data-k="${k}" aria-label="${v[1]}">${v[0]}</button>`).join("")}</div>`;
  d.querySelectorAll("button").forEach(b => b.onclick = ev => { ev.stopPropagation(); closeRx(); setReelReaction(id, b.dataset.k); });
  document.body.appendChild(d);
}
async function insReelLike(id, key){
  const row = { reel_id: id, user_id: me.id }; if (!reelNoRx) row.reaction = key;
  let { error } = await sb.from("reel_likes").insert(row);
  if (error && /reaction/i.test(error.message)){
    reelNoRx = true;
    if (key !== "like") return "Run migration-reels-v27.sql in Supabase first.";
    ({ error } = await sb.from("reel_likes").insert({ reel_id: id, user_id: me.id }));
  }
  return error ? error.message : null;
}
async function likeReel(id){
  const r = findReel(id); if (!r || r._busy) return;
  r._busy = true;
  try {
    if (myRx(r)){
      const { error } = await sb.from("reel_likes").delete().eq("reel_id", id).eq("user_id", me.id);
      if (error) return alert(error.message);
      r.reel_likes = (r.reel_likes || []).filter(l => l.user_id !== me.id);
    } else {
      const err = await insReelLike(id, "like");
      if (err) return alert(err);
      (r.reel_likes || (r.reel_likes = [])).push({ user_id: me.id, reaction: "like" });
    }
    redrawReelLike(id);
  } finally { r._busy = false; }
}
async function setReelReaction(id, key){
  const r = findReel(id); if (!r || r._busy) return;
  if (myRx(r) === key) return;
  r._busy = true;
  try {
    if (myRx(r)){
      const { error } = await sb.from("reel_likes").delete().eq("reel_id", id).eq("user_id", me.id);
      if (error) return alert(error.message);
      r.reel_likes = (r.reel_likes || []).filter(l => l.user_id !== me.id);
    }
    const err = await insReelLike(id, key);
    if (err){ redrawReelLike(id); return alert(err); }
    (r.reel_likes || (r.reel_likes = [])).push({ user_id: me.id, reaction: key });
    redrawReelLike(id);
  } finally { r._busy = false; }
}

/* ---------- auto-play setting + menu ---------- */
let reelMenuId = null;
function currentReelId(){
  const box = $("reels"); if (!box) return null;
  let best = null, bd = Infinity;
  box.querySelectorAll(".rl").forEach(s => { const d = Math.abs(s.offsetTop - box.scrollTop); if (d < bd){ bd = d; best = s; } });
  return best ? best.dataset.id : null;
}
function reelReportRow(){
  const r = reelMenuId && [...(typeof reelList !== "undefined" ? reelList : []), ...(typeof homeReels !== "undefined" ? homeReels : [])].find(x => String(x.id) === String(reelMenuId));
  if (!r || r.user_id === me.id) return "";
  return `<button class="rlm-row" style="color:#D62839" onclick="reportReelFromMenu()"><span>🚩 Report reel</span></button>`;
}
function reportReelFromMenu(){
  const r = [...reelList, ...homeReels].find(x => String(x.id) === String(reelMenuId)); if (!r) return;
  closeReelMenu(); reportIt("reel", String(r.id), r.user_id);
}
function reelMenuHtml(){
  return `<div class="rls-bg" onclick="closeReelMenu()"></div><div class="rlm"><div class="rls-h"><b>Reel settings</b><button onclick="closeReelMenu()" aria-label="Close">✕</button></div>
    <button class="rlm-row" onclick="toggleReelAuto()"><span>Auto-play videos<small>${reelAuto ? "On" : "Off"}: videos ${reelAuto ? "start playing by themselves" : "play only when you tap them"}</small></span><i class="sw ${reelAuto ? "on" : ""}"></i></button>${reelReportRow()}</div>`;
}
function openReelMenu(id){
  closeReelMenu();
  reelMenuId = id != null ? id : currentReelId();
  const d = document.createElement("div"); d.id = "rl-menu"; d.innerHTML = reelMenuHtml();
  document.body.appendChild(d);
}
function closeReelMenu(){ const m = $("rl-menu"); if (m) m.remove(); }
function toggleReelAuto(){
  reelAuto = !reelAuto;
  try { localStorage.setItem("circle_reel_auto", reelAuto ? "1" : "0"); } catch (e) {}
  const m = $("rl-menu"); if (m) m.innerHTML = reelMenuHtml();
  if (reelAuto){ if ($("reels")) startReelObs(); initHomeVideos(); }
  else {
    allReelVideos().forEach(v => { try { v.pause(); } catch (e) {} });
    document.querySelectorAll(".rl, .hr-w").forEach(s => s.classList.add("paused"));
  }
}

/* ---------- Reels tab ---------- */
async function renderReels(){
  const full = !!reelStart;
  $("app").classList.toggle("rfull", full);
  $("main").innerHTML = `<div id="reels"><div class="rl-msg">Loading…</div></div>
    <button class="rl-back" onclick="goBack()" aria-label="Back">‹</button>
    <button class="rl-mute" id="rl-mute" data-snd onclick="toggleReelSound()" aria-label="Sound">${reelMuted ? IC_MUT : IC_SND}</button>
    <button class="rl-menu" onclick="openReelMenu()" aria-label="Menu">⋯</button>
    <button class="rl-add" onclick="navTo({t:'reelnew'})" aria-label="New reel">＋</button>`;
  const { data, error } = await fetchReels(30);
  const box = $("reels"); if (!box) return;
  if (error){
    box.innerHTML = `<div class="rl-msg">${/reel/i.test(error.message) && /relation|schema|find|exist/i.test(error.message) ? "Run migration-reels-v23.sql in Supabase first." : "Could not load reels: " + esc(error.message)}</div>`;
    return;
  }
  reelList = data || [];
  if (!reelList.length){ box.innerHTML = `<div class="rl-msg">No reels yet.<br>Tap ＋ to post the first one!</div>`; reelStart = null; return; }
  box.innerHTML = reelList.map(reelHtml).join("");
  const secs = box.querySelectorAll(".rl");
  secs.forEach((s, i) => { if (i < 2) loadReelSrc(s); });
  if (reelStart){
    const t = $("rl-" + reelStart);
    if (t){ loadReelSrc(t); if (t.nextElementSibling) loadReelSrc(t.nextElementSibling); box.scrollTop = t.offsetTop; reelForce = reelStart; }
    reelStart = null;
  }
  startReelObs();
}
function startReelObs(){
  const box = $("reels"); if (!box) return;
  if (reelObs){ reelObs.disconnect(); reelObs = null; }
  reelObs = new IntersectionObserver(es => {
    es.forEach(e => {
      const s = e.target, v = s.querySelector("video");
      if (e.isIntersecting && e.intersectionRatio >= .6){
        loadReelSrc(s);
        const nx = s.nextElementSibling; if (nx) loadReelSrc(nx);
        const force = reelForce && String(reelForce) === s.dataset.id;
        if (reelAuto || force){ if (force) reelForce = null; s.classList.remove("paused"); playReelVideo(v); }
        else { try { v.pause(); } catch (x) {} s.classList.add("paused"); }
      } else { try { v.pause(); } catch (x) {} }
    });
  }, { root: box, threshold: [0, .6] });
  box.querySelectorAll(".rl").forEach(s => reelObs.observe(s));
}
function reelHtml(r){
  const n = r.profiles ? r.profiles.name : "Someone", av = r.profiles ? r.profiles.avatar_url : null;
  const cm = (r.reel_comments || []).length;
  return `<section class="rl" id="rl-${r.id}" data-id="${r.id}" data-src="${esc(r.video_url)}">
    <video loop playsinline preload="none" onclick="toggleReelPlay(this)"></video>
    <div class="rl-pause">${IC_PLAY}</div>
    <div class="rl-side">
      ${rlLikeBtn(r)}
      <button class="rl-b" onclick="openReelCm(${r.id})" aria-label="Comments">${IC_CMT}<span id="rl-cn-${r.id}">${cm}</span></button>
      <button class="rl-b" onclick="shareReel(${r.id})" aria-label="Share">${IC_SHR}<span>Share</span></button>
      ${r.user_id === me.id ? `<button class="rl-b" onclick="deleteReel(${r.id})" aria-label="Delete">${IC_DEL}<span>Delete</span></button>` : ""}
    </div>
    <div class="rl-info">
      <div class="rl-who" onclick="openProfile('${r.user_id}')">${avatar(n, false, av)}<b>${esc(n)}</b><small>${ago(r.created_at)}</small></div>
      ${r.caption ? `<p>${esc(r.caption)}</p>` : ""}
    </div>
  </section>`;
}
function loadReelSrc(s){
  const v = s.querySelector("video");
  if (v && !v.getAttribute("src") && s.dataset.src){ v.preload = "auto"; v.src = s.dataset.src + "#t=0.1"; }
}
function toggleReelPlay(v){
  const s = v.closest(".rl");
  if (v.paused){ playReelVideo(v); s.classList.remove("paused"); }
  else { v.pause(); s.classList.add("paused"); }
}

/* ---------- share / delete ---------- */
async function shareReel(id){
  const r = findReel(id); if (!r) return;
  const url = location.origin, text = (r.caption ? r.caption + " - " : "") + "Watch this reel on Circle";
  try { if (navigator.share){ await navigator.share({ title: "Circle", text, url }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(url); alert("Link copied."); } catch (e) { alert(url); }
}
async function deleteReel(id){
  const r = reelList.find(x => x.id === id); if (!r || r.user_id !== me.id) return;
  if (!confirm("Delete this reel?")) return;
  const { error } = await sb.from("reels").delete().eq("id", id);
  if (error) return alert(error.message);
  const k = "/" + REEL_BUCKET + "/", i = r.video_url.indexOf(k);
  if (i > -1) sb.storage.from(REEL_BUCKET).remove([decodeURIComponent(r.video_url.slice(i + k.length))]).then(() => {}, () => {});
  reelList = reelList.filter(x => x.id !== id);
  const s = $("rl-" + id); if (s){ if (reelObs) reelObs.unobserve(s); s.remove(); }
  if (!reelList.length && $("reels")) $("reels").innerHTML = `<div class="rl-msg">No reels yet.<br>Tap ＋ to post the first one!</div>`;
}

/* ---------- comments sheet ---------- */
let rcmId = null;
function closeReelCm(){ const s = $("rl-sheet"); if (s) s.remove(); rcmId = null; }
async function openReelCm(id){
  closeReelCm(); rcmId = id;
  const el = document.createElement("div");
  el.id = "rl-sheet";
  el.innerHTML = `<div class="rls-bg" onclick="closeReelCm()"></div><div class="rls">
    <div class="rls-h"><b>Comments</b><button onclick="closeReelCm()" aria-label="Close">✕</button></div>
    <div class="rls-list" id="rls-list"><div class="rl-msg2">Loading…</div></div>
    <div class="rls-f"><input id="rls-in" maxlength="300" placeholder="Add a comment…" autocomplete="off"><button onclick="sendReelCm()">Send</button></div></div>`;
  document.body.appendChild(el);
  $("rls-in").addEventListener("keydown", e => { if (e.key === "Enter") sendReelCm(); });
  loadReelCm();
}
async function loadReelCm(){
  const id = rcmId; if (!id) return;
  const { data, error } = await sb.from("reel_comments").select("id,user_id,body,created_at,profiles!user_id(name,avatar_url)").eq("reel_id", id).order("created_at", { ascending: true }).limit(100);
  const l = $("rls-list"); if (!l || rcmId !== id) return;
  if (error){ l.innerHTML = `<div class="rl-msg2">${esc(error.message)}</div>`; return; }
  l.innerHTML = data.length ? data.map(c => {
    const n = c.profiles ? c.profiles.name : "Someone", av = c.profiles ? c.profiles.avatar_url : null;
    return `<div class="rls-c">${avatar(n, false, av)}<div><b>${esc(n)}</b> <small>${ago(c.created_at)}</small><p>${esc(c.body)}</p></div>${c.user_id === me.id ? `<button onclick="delReelCm(${c.id})" aria-label="Delete comment">✕</button>` : ""}</div>`;
  }).join("") : `<div class="rl-msg2">No comments yet. Be the first!</div>`;
  setReelCount(id, data.length);
}
function setReelCount(id, n){
  const e = $("rl-cn-" + id); if (e) e.textContent = n || (e.closest(".hr-acts") ? "Comment" : 0);
  const r = findReel(id); if (r) r.reel_comments = new Array(n).fill({});
  const rc = $("hr-react-" + id); if (rc && r) rc.innerHTML = hrReactHtml(r);
}
async function sendReelCm(){
  const inp = $("rls-in"), body = inp && inp.value.trim(); if (!body || !rcmId) return;
  inp.disabled = true;
  const { error } = await sb.from("reel_comments").insert({ reel_id: rcmId, user_id: me.id, body });
  inp.disabled = false;
  if (error) return alert(error.message);
  inp.value = ""; await loadReelCm();
  const l = $("rls-list"); if (l) l.scrollTop = l.scrollHeight;
}
async function delReelCm(cid){
  if (!confirm("Delete this comment?")) return;
  const { error } = await sb.from("reel_comments").delete().eq("id", cid);
  if (error) return alert(error.message);
  loadReelCm();
}

/* ---------- new reel page ---------- */
function renderReelNew(){
  reelFile = null;
  $("main").innerHTML = `<div class="card comp2"><div class="who">${avatar(me.name, false, me.avatar_url)}<b>${esc(me.name)}</b></div>
    <div id="rn-prev"></div>
    <textarea id="rn-cap" rows="3" maxlength="150" placeholder="Write a caption…" aria-label="Caption"></textarea>
    <div class="copts"><button onclick="$('rn-gal').click()">🎞️ Gallery</button><button onclick="$('rn-cam').click()">🎥 Camera</button></div>
    <input id="rn-gal" type="file" accept="video/*" class="hidden" onchange="pickReel(this)">
    <input id="rn-cam" type="file" accept="video/*" capture="environment" class="hidden" onchange="pickReel(this)">
    <p class="rn-note">Max ${REEL_MAX_SEC} seconds. Big videos are shrunk on your phone before upload (keep the screen on, it takes about as long as the video).</p>
    <button class="btn" id="rn-go" style="width:100%;margin-top:6px" onclick="submitReel()">Post reel</button></div>`;
}
function pickReel(input){
  const f = input.files && input.files[0]; input.value = "";
  if (!f) return;
  if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) return alert("This video type is not supported. Please pick an MP4 video.");
  if (f.size > REEL_PICK_MB * 1048576) return alert("Video is too big (" + Math.round(f.size / 1048576) + " MB). Max is " + REEL_PICK_MB + " MB. Pick a shorter video.");
  const url = URL.createObjectURL(f), probe = document.createElement("video");
  probe.preload = "metadata";
  probe.onloadedmetadata = () => {
    if (isFinite(probe.duration) && probe.duration > REEL_MAX_SEC + 0.5){ URL.revokeObjectURL(url); return alert("Video is too long (" + Math.round(probe.duration) + " s). Max is " + REEL_MAX_SEC + " seconds."); }
    reelFile = f;
    if (reelUrl) URL.revokeObjectURL(reelUrl);
    reelUrl = url;
    const p = $("rn-prev");
    if (p) p.innerHTML = `<div class="prev rn-v"><video src="${url}" controls playsinline muted></video><button onclick="reelFile=null;$('rn-prev').innerHTML=''" aria-label="Remove video">✕</button></div>`;
  };
  probe.onerror = () => { URL.revokeObjectURL(url); alert("Could not read this video. Try another one."); };
  probe.src = url;
}
/* shrink a video on the phone: re-record it (max 720p short side, 1.5 Mbps) with canvas + MediaRecorder */
function reelMime(){
  if (!window.MediaRecorder) return null;
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"].find(t => MediaRecorder.isTypeSupported(t)) || null;
}
async function compressReel(file, onProg){
  const mime = reelMime();
  if (!mime || !HTMLCanvasElement.prototype.captureStream) throw new Error("not supported");
  const url = URL.createObjectURL(file), v = document.createElement("video");
  v.playsInline = true; v.preload = "auto"; v.src = url;
  let ac = null, lock = null;
  const cleanup = () => {
    try { v.pause(); } catch (e) {}
    URL.revokeObjectURL(url);
    if (ac) { try { ac.close(); } catch (e) {} }
    if (lock) { try { lock.release(); } catch (e) {} }
  };
  try {
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error("read")); });
    const dur = v.duration;
    if (!isFinite(dur) || !v.videoWidth || !v.videoHeight) throw new Error("metadata");
    const sc = Math.min(1, 720 / Math.min(v.videoWidth, v.videoHeight));
    const w = Math.max(2, Math.round(v.videoWidth * sc / 2) * 2), h = Math.max(2, Math.round(v.videoHeight * sc / 2) * 2);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const stream = cv.captureStream(30);
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      await ac.resume();
      const src = ac.createMediaElementSource(v), dst = ac.createMediaStreamDestination();
      src.connect(dst);
      dst.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) { ac = null; }
    try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) {}
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1500000, audioBitsPerSecond: 96000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((ok, no) => { rec.onstop = ok; rec.onerror = e => no((e && e.error) || new Error("recorder")); });
    let stopped = false;
    const finish = () => { if (stopped) return; stopped = true; try { if (rec.state !== "inactive") rec.stop(); } catch (e) {} };
    v.onended = finish;
    const draw = () => {
      if (stopped) return;
      ctx.drawImage(v, 0, 0, w, h);
      if (onProg) onProg(Math.min(99, Math.round(v.currentTime / dur * 100)));
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
    };
    rec.start(500);
    try { await v.play(); } catch (e) { v.muted = true; await v.play(); }
    draw();
    setTimeout(finish, (dur + 6) * 1000);
    await done;
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    if (!blob.size) throw new Error("empty");
    return blob;
  } finally { cleanup(); }
}
async function submitReel(){
  if (!reelFile) return alert("Pick a video first.");
  const btn = $("rn-go"); btn.disabled = true;
  const reset = () => { btn.disabled = false; btn.textContent = "Post reel"; };
  const f = reelFile;
  let blob = f, type = f.type;
  if (f.size > REEL_DIRECT_MB * 1048576){
    btn.textContent = "Shrinking video… 0%";
    try {
      blob = await compressReel(f, p => { btn.textContent = "Shrinking video… " + p + "% (keep screen on)"; });
      type = blob.type;
    } catch (e) {
      if (f.size > REEL_MAX_MB * 1048576){ reset(); return alert("Could not shrink this video on your phone. Pick a smaller video (under " + REEL_MAX_MB + " MB)."); }
      blob = f; type = f.type;
    }
  }
  if (blob.size > REEL_MAX_MB * 1048576){ reset(); return alert("Video is still too big (" + Math.round(blob.size / 1048576) + " MB). Pick a shorter video."); }
  btn.textContent = "Uploading… please wait";
  const ext = type === "video/webm" ? "webm" : type === "video/quicktime" ? "mov" : "mp4";
  const path = `${me.id}/${Date.now()}.${ext}`;
  const { error: ue } = await sb.storage.from(REEL_BUCKET).upload(path, blob, { contentType: type, cacheControl: "31536000" });
  if (ue){ reset(); return alert("Upload failed: " + ue.message); }
  const video_url = sb.storage.from(REEL_BUCKET).getPublicUrl(path).data.publicUrl;
  const caption = ($("rn-cap") ? $("rn-cap").value : "").trim() || null;
  const { error } = await sb.from("reels").insert({ user_id: me.id, video_url, caption });
  if (error){ sb.storage.from(REEL_BUCKET).remove([path]); reset(); return alert(error.message); }
  reelFile = null;
  navTo({ t: "reels" }, true);
}

/* ---------- reels inside the Home feed ---------- */
async function loadHomeReels(){
  try { const { data, error } = await fetchReels(10); homeReels = error ? [] : (data || []); }
  catch (e) { homeReels = []; }
}
function openReelFull(id){ reelStart = id; navTo({ t: "reels" }); }
function homeReelHtml(r){
  const n = r.profiles ? r.profiles.name : "Someone", av = r.profiles ? r.profiles.avatar_url : null;
  const cm = (r.reel_comments || []).length;
  return `<div class="card hr-card" id="hr-${r.id}"><div class="row"><div class="ring${r.user_id === me.id ? " me" : ""}">${avatar(n, false, av, r.user_id)}</div><div style="flex:1;min-width:0"><div class="name lnk" onclick="openProfile('${r.user_id}')">${esc(n)}${VERIFIED.includes(String(n || "").toLowerCase()) ? ICON_VERIFIED : ""}</div><div class="meta">${ago(r.created_at)} · posted a reel</div></div><button class="hr-menu" onclick="openReelMenu(${r.id})" aria-label="Reel settings">•••</button></div>
    ${r.caption ? `<p class="body">${esc(r.caption)}</p>` : ""}
    <div class="hr-w paused"><video class="hr-v" src="${esc(r.video_url)}#t=0.1" loop playsinline muted preload="metadata" onclick="openReelFull(${r.id})"></video>
      <div class="hr-pl">${IC_PLAY}</div>
      <button class="hr-snd" data-snd onclick="toggleReelSound()" aria-label="Sound">${reelMuted ? IC_MUT : IC_SND}</button></div>
    <div class="react" id="hr-react-${r.id}">${hrReactHtml(r)}</div>
    <div class="acts hr-acts">
      ${hrLikeBtn(r)}
      <button class="act" onclick="openReelCm(${r.id})" aria-label="Comment">${IC_CMT}<span id="rl-cn-${r.id}">${cm || "Comment"}</span></button>
      <button class="act" onclick="shareReel(${r.id})" aria-label="Share">${IC_SHR}<span>Share</span></button>
    </div></div>`;
}
function initHomeVideos(){
  if (homeObs){ homeObs.disconnect(); homeObs = null; }
  const vs = document.querySelectorAll(".hr-v"); if (!vs.length) return;
  homeObs = new IntersectionObserver(es => {
    es.forEach(e => {
      const v = e.target, w = v.parentElement;
      if (reelAuto && e.isIntersecting && e.intersectionRatio >= .6){ w.classList.remove("paused"); playReelVideo(v); }
      else { try { v.pause(); } catch (x) {} w.classList.add("paused"); }
    });
  }, { threshold: [0, .6] });
  vs.forEach(v => homeObs.observe(v));
}
function feedHtml(posts){
  const all = posts.map(p => ({ t: new Date(p.created_at).getTime(), h: () => postHtml(p) }))
    .concat(homeReels.map(r => ({ t: new Date(r.created_at).getTime(), h: () => homeReelHtml(r) })));
  all.sort((x, y) => y.t - x.t);
  setTimeout(initHomeVideos, 0);
  return all.map(x => x.h()).join("");
}
