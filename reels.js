/* Circle v23: Reels (short videos). Needs migration-reels-v23.sql */
const REEL_BUCKET = "reels";
const REEL_MAX_MB = 30, REEL_MAX_SEC = 60;
let reelObs = null, reelMuted = true, reelList = [], reelFile = null, reelUrl = null;

const IC_HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`;
const IC_CMT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z"/></svg>`;
const IC_SHR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4l7 6-7 6v-4c-6 0-9 2-11 6 1-7 4-11 11-12z"/></svg>`;
const IC_DEL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;
const IC_SND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const IC_MUT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>`;

function stopReels(){
  if (reelObs){ reelObs.disconnect(); reelObs = null; }
  document.querySelectorAll("#reels video").forEach(v => { try { v.pause(); } catch (e) {} });
  closeReelCm();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) document.querySelectorAll("#reels video").forEach(v => { try { v.pause(); } catch (e) {} });
});

/* ---------- feed ---------- */
async function renderReels(){
  $("main").innerHTML = `<div id="reels"><div class="rl-msg">Loading…</div></div>
    <button class="rl-add" onclick="navTo({t:'reelnew'})" aria-label="New reel">＋</button>
    <button class="rl-mute" id="rl-mute" onclick="toggleReelSound()" aria-label="Sound">${reelMuted ? IC_MUT : IC_SND}</button>`;
  const { data, error } = await sb.from("reels")
    .select("id,user_id,video_url,caption,created_at,profiles!user_id(name,avatar_url),reel_likes(user_id),reel_comments(id)")
    .order("created_at", { ascending: false }).limit(30);
  const box = $("reels"); if (!box) return;
  if (error){
    box.innerHTML = `<div class="rl-msg">${/reel/i.test(error.message) && /relation|schema|find|exist/i.test(error.message) ? "Run migration-reels-v23.sql in Supabase first." : "Could not load reels: " + esc(error.message)}</div>`;
    return;
  }
  reelList = data || [];
  if (!reelList.length){ box.innerHTML = `<div class="rl-msg">No reels yet.<br>Tap ＋ to post the first one!</div>`; return; }
  box.innerHTML = reelList.map(reelHtml).join("");
  const secs = box.querySelectorAll(".rl");
  secs.forEach((s, i) => { if (i < 2) loadReelSrc(s); });
  reelObs = new IntersectionObserver(es => {
    es.forEach(e => {
      const s = e.target, v = s.querySelector("video");
      if (e.isIntersecting && e.intersectionRatio >= .6){
        loadReelSrc(s);
        const nx = s.nextElementSibling; if (nx) loadReelSrc(nx);
        v.muted = reelMuted;
        const p = v.play();
        if (p && p.catch) p.catch(() => { v.muted = true; reelMuted = true; syncMuteBtn(); v.play().catch(() => {}); });
      } else { try { v.pause(); } catch (x) {} }
    });
  }, { root: box, threshold: [0, .6] });
  secs.forEach(s => reelObs.observe(s));
}
function reelHtml(r){
  const n = r.profiles ? r.profiles.name : "Someone", av = r.profiles ? r.profiles.avatar_url : null;
  const likes = (r.reel_likes || []).length, mine = (r.reel_likes || []).some(l => l.user_id === me.id), cm = (r.reel_comments || []).length;
  return `<section class="rl" id="rl-${r.id}" data-id="${r.id}" data-src="${esc(r.video_url)}">
    <video loop playsinline preload="none" onclick="toggleReelPlay(this)"></video>
    <div class="rl-pause"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></div>
    <div class="rl-side">
      <button class="rl-b ${mine ? "on" : ""}" id="rl-like-${r.id}" onclick="likeReel(${r.id})" aria-label="Like">${IC_HEART}<span>${likes}</span></button>
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
  if (v && !v.getAttribute("src") && s.dataset.src){ v.preload = "auto"; v.src = s.dataset.src; }
}
function toggleReelPlay(v){
  const s = v.closest(".rl");
  if (v.paused){ v.play().catch(() => {}); s.classList.remove("paused"); }
  else { v.pause(); s.classList.add("paused"); }
}
function syncMuteBtn(){ const b = $("rl-mute"); if (b) b.innerHTML = reelMuted ? IC_MUT : IC_SND; }
function toggleReelSound(){
  reelMuted = !reelMuted;
  document.querySelectorAll("#reels video").forEach(v => { v.muted = reelMuted; });
  syncMuteBtn();
}

/* ---------- like / share / delete ---------- */
async function likeReel(id){
  const r = reelList.find(x => x.id === id); if (!r) return;
  const btn = $("rl-like-" + id); if (!btn || btn.dataset.busy) return;
  btn.dataset.busy = "1";
  const likes = r.reel_likes || (r.reel_likes = []);
  const i = likes.findIndex(l => l.user_id === me.id);
  let err;
  if (i > -1){ ({ error: err } = await sb.from("reel_likes").delete().eq("reel_id", id).eq("user_id", me.id)); if (!err) likes.splice(i, 1); }
  else { ({ error: err } = await sb.from("reel_likes").insert({ reel_id: id, user_id: me.id })); if (!err) likes.push({ user_id: me.id }); }
  delete btn.dataset.busy;
  if (err) return alert(err.message);
  btn.classList.toggle("on", i === -1);
  btn.querySelector("span").textContent = likes.length;
}
async function shareReel(id){
  const r = reelList.find(x => x.id === id); if (!r) return;
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
  const e = $("rl-cn-" + id); if (e) e.textContent = n;
  const r = reelList.find(x => x.id === id); if (r) r.reel_comments = new Array(n).fill({});
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
    <p class="rn-note">Max ${REEL_MAX_SEC} seconds and ${REEL_MAX_MB} MB. MP4 works best.</p>
    <button class="btn" id="rn-go" style="width:100%;margin-top:6px" onclick="submitReel()">Post reel</button></div>`;
}
function pickReel(input){
  const f = input.files && input.files[0]; input.value = "";
  if (!f) return;
  if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) return alert("This video type is not supported. Please pick an MP4 video.");
  if (f.size > REEL_MAX_MB * 1048576) return alert("Video is too big (" + (f.size / 1048576).toFixed(1) + " MB). Max is " + REEL_MAX_MB + " MB. Pick a shorter video or record in lower quality.");
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
async function submitReel(){
  if (!reelFile) return alert("Pick a video first.");
  const btn = $("rn-go"); btn.disabled = true; btn.textContent = "Uploading… please wait";
  const f = reelFile, ext = f.type === "video/webm" ? "webm" : f.type === "video/quicktime" ? "mov" : "mp4";
  const path = `${me.id}/${Date.now()}.${ext}`;
  const reset = () => { btn.disabled = false; btn.textContent = "Post reel"; };
  const { error: ue } = await sb.storage.from(REEL_BUCKET).upload(path, f, { contentType: f.type, cacheControl: "31536000" });
  if (ue){ reset(); return alert("Upload failed: " + ue.message); }
  const video_url = sb.storage.from(REEL_BUCKET).getPublicUrl(path).data.publicUrl;
  const caption = ($("rn-cap").value || "").trim() || null;
  const { error } = await sb.from("reels").insert({ user_id: me.id, video_url, caption });
  if (error){ sb.storage.from(REEL_BUCKET).remove([path]); reset(); return alert(error.message); }
  reelFile = null;
  navTo({ t: "reels" }, true);
}
