/* Circle v28: voice + video calls (WebRTC). No SQL needed.
   Signals travel over Supabase Realtime broadcast: each user listens on channel "call-<their id>".
   Works while both people have the app open. */
const CALL_RING_SEC = 40;
/* Add a TURN server here if calls do not connect on mobile data, e.g.
   { urls: "turn:YOUR_HOST:443", username: "USER", credential: "PASS" } */
const CALL_TURN = [];
const CALL_ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }, ...CALL_TURN] };

let callCh = null, callPeerCh = {}, call = null, callStarting = false;

const CL_CSS = `
#call-ui{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;color:#fff;
  background:linear-gradient(160deg,#1747D9,#4A35D8 60%,#2a1a7a);padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0);overflow:hidden}
#call-ui video{background:#000}
#call-ui .cl-rv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#call-ui .cl-lv{position:absolute;right:14px;top:calc(env(safe-area-inset-top,0px) + 14px);width:96px;height:136px;object-fit:cover;border-radius:14px;border:2px solid rgba(255,255,255,.6);z-index:3;transform:scaleX(-1)}
#call-ui .cl-mid{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px;text-shadow:0 1px 8px rgba(0,0,0,.35)}
#call-ui .cl-mid .av{width:128px;height:128px;border-radius:50%;object-fit:cover;font-size:44px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;box-shadow:0 0 0 6px rgba(255,255,255,.18)}
#call-ui .cl-name{font-size:26px;font-weight:700}
#call-ui .cl-st{font-size:16px;opacity:.9}
#call-ui.cl-vid.cl-on .cl-mid{justify-content:flex-start;flex:0;padding-top:calc(env(safe-area-inset-top,0px) + 20px);align-self:flex-start;align-items:flex-start;text-align:left}
#call-ui.cl-vid.cl-on .cl-mid .av{display:none}
#call-ui .cl-btns{position:relative;z-index:3;display:flex;gap:18px;justify-content:center;padding:18px 16px 34px;width:100%}
#call-ui .cl-b{width:62px;height:62px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
#call-ui .cl-b.off{background:#fff;color:#1747D9}
#call-ui .cl-b.red{background:#E5334B}
#call-ui .cl-b.grn{background:#1FB45A}
#call-ui .hidden{display:none !important}
`;
function clStyle(){
  if (document.getElementById("cl-style")) return;
  const s = document.createElement("style"); s.id = "cl-style"; s.textContent = CL_CSS; document.head.appendChild(s);
}

/* ---------- signalling ---------- */
function callsInit(){
  if (callCh || !me) return;
  clStyle();
  try {
    callCh = sb.channel("call-" + me.id)
      .on("broadcast", { event: "sig" }, m => { try { onSig(m.payload); } catch (e) {} })
      .subscribe();
  } catch (e) {}
}
function peerChannel(id){
  if (callPeerCh[id]) return callPeerCh[id];
  const ch = sb.channel("call-" + id);
  callPeerCh[id] = new Promise(res => ch.subscribe(st => { if (st === "SUBSCRIBED") res(ch); }));
  return callPeerCh[id];
}
async function sendSig(to, payload){
  try {
    const ch = await Promise.race([peerChannel(to), new Promise((_, rej) => setTimeout(rej, 8000))]);
    ch.send({ type: "broadcast", event: "sig", payload: { ...payload, from: me.id } });
  } catch (e) {}
}

/* ---------- start / receive ---------- */
async function startCall(kind){
  if (!me || !chatId) return;
  if (call || callStarting) return soon("You are already in a call");
  if (typeof blockSet !== "undefined" && (blockSet.has(chatId) || (typeof blockedBy !== "undefined" && blockedBy.has(chatId)))) return soon("You cannot call this person");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return soon("Calls are not supported in this browser");
  callStarting = true;
  const peer = chatId;
  try {
    const [{ data: u }, stream] = await Promise.all([
      sb.from("profiles").select("id,name,avatar_url").eq("id", peer).maybeSingle(),
      getMedia(kind)
    ]);
    if (!u){ stopStream(stream); callStarting = false; return soon("Person not found"); }
    call = newCall(peer, u, kind, true, "c" + Date.now() + Math.random().toString(36).slice(2, 6));
    call.stream = stream;
    callStarting = false;
    drawCall();
    setSt(isOn(peer) ? "Calling…" : "Calling… (they look offline)");
    ringLoop("out");
    call.ringT = setTimeout(() => { if (call && call.state === "calling") endCall("noanswer"); }, CALL_RING_SEC * 1000);
    sendSig(peer, { type: "ring", callId: call.id, kind });
    wakeOn();
  } catch (e) {
    callStarting = false;
    soon(kind === "video" ? "Allow camera and microphone to call" : "Allow microphone to call");
  }
}
function newCall(peer, u, kind, caller, id){
  return { id, peer, u, kind, caller, state: caller ? "calling" : "incoming", stream: null, pc: null, q: [], t0: 0, tick: null, ringI: null, ringT: null, muted: false, camOff: false, front: true, ended: false };
}
async function getMedia(kind, facing){
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: kind === "video" ? { facingMode: facing || "user", width: { ideal: 640 }, height: { ideal: 480 } } : false
  });
}
function stopStream(s){ try { s && s.getTracks().forEach(t => t.stop()); } catch (e) {} }

async function onSig(p){
  if (!p || !me || !p.from || p.from === me.id) return;
  if (p.type === "ring"){
    if (call || callStarting){ if (!(call && call.id === p.callId)) sendSig(p.from, { type: "busy", callId: p.callId }); return; }
    if (typeof blockSet !== "undefined" && (blockSet.has(p.from) || (typeof blockedBy !== "undefined" && blockedBy.has(p.from)))) return;
    const [{ data: u }, { data: f }] = await Promise.all([
      sb.from("profiles").select("id,name,avatar_url").eq("id", p.from).maybeSingle(),
      sb.from("friendships").select("id").eq("status", "accepted")
        .or(`and(requester.eq.${me.id},addressee.eq.${p.from}),and(requester.eq.${p.from},addressee.eq.${me.id})`).maybeSingle()
    ]);
    if (!u || !f || call) return;
    call = newCall(p.from, u, p.kind === "video" ? "video" : "audio", false, p.callId);
    drawCall();
    ringLoop("in");
    sendSig(p.from, { type: "ringing", callId: p.callId });
    call.ringT = setTimeout(() => { if (call && call.state === "incoming") endCall("missed", true); }, (CALL_RING_SEC + 3) * 1000);
    return;
  }
  if (!call || call.id !== p.callId || call.peer !== p.from) return;
  if (p.type === "ringing" && call.state === "calling") setSt("Ringing…");
  else if (p.type === "accept" && call.caller && call.state === "calling") beginCaller();
  else if (p.type === "offer" && !call.caller) await gotOffer(p.sdp);
  else if (p.type === "answer" && call.caller && call.pc) { await call.pc.setRemoteDescription(p.sdp); flushIce(); }
  else if (p.type === "ice") { call.pc && call.pc.remoteDescription ? call.pc.addIceCandidate(p.cand).catch(() => {}) : call.q.push(p.cand); }
  else if (p.type === "decline" && call.caller){ soon("Call declined"); endCall("remote", true); }
  else if (p.type === "busy" && call.caller){ soon("They are on another call"); endCall("remote", true); }
  else if (p.type === "cancel" && !call.caller){ endCall("remote", true); }
  else if (p.type === "end"){ endCall("remote", true); }
}

/* ---------- WebRTC ---------- */
function makePc(){
  const c = call, pc = new RTCPeerConnection(CALL_ICE);
  c.pc = pc;
  c.stream.getTracks().forEach(t => pc.addTrack(t, c.stream));
  pc.onicecandidate = e => { if (e.candidate) sendSig(c.peer, { type: "ice", callId: c.id, cand: e.candidate.toJSON() }); };
  pc.ontrack = e => {
    const v = document.getElementById("cl-rv");
    if (v && v.srcObject !== e.streams[0]){ v.srcObject = e.streams[0]; if (c.kind === "video") v.classList.remove("hidden"); v.play().catch(() => {}); }
  };
  pc.onconnectionstatechange = () => {
    if (!call || call !== c) return;
    const s = pc.connectionState;
    if (s === "connected") connected();
    else if (s === "disconnected"){ setSt("Reconnecting…"); clearTimeout(c.dcT); c.dcT = setTimeout(() => { if (call === c && c.pc && c.pc.connectionState !== "connected") endCall("lost"); }, 9000); }
    else if (s === "failed") endCall("failed");
  };
  return pc;
}
async function beginCaller(){
  const c = call;
  stopRing(); clearTimeout(c.ringT);
  c.state = "connecting"; setSt("Connecting…");
  try {
    const pc = makePc();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSig(c.peer, { type: "offer", callId: c.id, sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: offer.type, sdp: offer.sdp } });
  } catch (e) { endCall("failed"); }
}
async function acceptCall(){
  const c = call; if (!c || c.state !== "incoming") return;
  stopRing(); clearTimeout(c.ringT);
  try {
    c.stream = await getMedia(c.kind);
  } catch (e) {
    soon(c.kind === "video" ? "Allow camera and microphone to answer" : "Allow microphone to answer");
    return endCall("decline");
  }
  if (call !== c){ stopStream(c.stream); return; }
  c.state = "connecting"; drawCall(); setSt("Connecting…"); wakeOn();
  sendSig(c.peer, { type: "accept", callId: c.id });
}
async function gotOffer(sdp){
  const c = call;
  try {
    const pc = c.pc || makePc();
    await pc.setRemoteDescription(sdp);
    flushIce();
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    sendSig(c.peer, { type: "answer", callId: c.id, sdp: { type: ans.type, sdp: ans.sdp } });
  } catch (e) { endCall("failed"); }
}
function flushIce(){
  if (!call || !call.pc) return;
  const q = call.q; call.q = [];
  q.forEach(cd => call.pc.addIceCandidate(cd).catch(() => {}));
}
function connected(){
  const c = call; if (!c || c.state === "connected") return;
  clearTimeout(c.dcT);
  c.state = "connected"; c.t0 = Date.now();
  const ui = document.getElementById("call-ui"); if (ui) ui.classList.add("cl-on");
  paintTime(); c.tick = setInterval(paintTime, 1000);
  try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
}
function paintTime(){
  if (!call || !call.t0) return;
  const s = Math.floor((Date.now() - call.t0) / 1000);
  setSt(String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"));
}

/* ---------- ending ---------- */
async function endCall(why, fromRemote){
  const c = call; if (!c || c.ended) return;
  c.ended = true;
  const was = c.state;
  if (!fromRemote){
    if (was === "incoming") sendSig(c.peer, { type: "decline", callId: c.id });
    else if (was === "calling") sendSig(c.peer, { type: "cancel", callId: c.id });
    else sendSig(c.peer, { type: "end", callId: c.id });
  }
  if (c.caller && was === "calling" && (why === "noanswer" || why === "hang")){
    /* leave a note in the chat so they see it when they open the app */
    sb.from("messages").insert({ sender: me.id, receiver: c.peer, body: c.kind === "video" ? "📹 Missed video call" : "📞 Missed voice call" }).then(() => {
      if (cur && cur.t === "chat" && cur.id === c.peer && typeof loadChat === "function") loadChat(false);
    }, () => {});
  }
  if (why === "noanswer") soon("No answer");
  if (why === "failed") soon("Call failed. Check your internet and try again");
  if (why === "lost") soon("Call lost");
  if (c.state === "connected" || c.t0){ const s = Math.floor((Date.now() - c.t0) / 1000); soon("Call ended · " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")); }
  stopRing(); clearTimeout(c.ringT); clearTimeout(c.dcT); clearInterval(c.tick);
  try { c.pc && c.pc.close(); } catch (e) {}
  stopStream(c.stream);
  wakeOff();
  const ui = document.getElementById("call-ui"); if (ui) ui.remove();
  call = null;
}
function hangUp(){ endCall(call && call.state === "calling" ? "hang" : "end"); }

/* ---------- controls ---------- */
function toggleMute(){
  if (!call || !call.stream) return;
  call.muted = !call.muted;
  call.stream.getAudioTracks().forEach(t => t.enabled = !call.muted);
  const b = document.getElementById("cl-mute"); if (b){ b.classList.toggle("off", call.muted); b.textContent = call.muted ? "🔇" : "🎤"; }
}
function toggleCam(){
  if (!call || !call.stream) return;
  call.camOff = !call.camOff;
  call.stream.getVideoTracks().forEach(t => t.enabled = !call.camOff);
  const b = document.getElementById("cl-cam"); if (b){ b.classList.toggle("off", call.camOff); b.textContent = call.camOff ? "🚫" : "📹"; }
}
async function flipCam(){
  const c = call; if (!c || c.kind !== "video" || !c.stream) return;
  try {
    const ns = await getMedia("video", c.front ? "environment" : "user");
    const nt = ns.getVideoTracks()[0];
    const old = c.stream.getVideoTracks()[0];
    const sender = c.pc && c.pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) await sender.replaceTrack(nt);
    if (old){ c.stream.removeTrack(old); old.stop(); }
    c.stream.addTrack(nt);
    nt.enabled = !c.camOff;
    c.front = !c.front;
    const lv = document.getElementById("cl-lv");
    if (lv){ lv.srcObject = c.stream; lv.style.transform = c.front ? "scaleX(-1)" : "none"; }
    ns.getAudioTracks().forEach(t => t.stop());
  } catch (e) { soon("Could not switch camera"); }
}

/* ---------- screen ---------- */
function drawCall(){
  clStyle();
  const c = call, old = document.getElementById("call-ui"); if (old) old.remove();
  const ui = document.createElement("div");
  ui.id = "call-ui"; ui.className = c.kind === "video" ? "cl-vid" : "";
  const incoming = c.state === "incoming";
  ui.innerHTML =
    `<video id="cl-rv" class="cl-rv ${c.kind === "video" ? "hidden" : ""}" ${c.kind === "video" ? "" : 'style="opacity:0;pointer-events:none"'} autoplay playsinline></video>` +
    (c.kind === "video" ? `<video id="cl-lv" class="cl-lv ${incoming ? "hidden" : ""}" autoplay playsinline muted></video>` : "") +
    `<div class="cl-mid">${avatar(c.u.name, "xl", c.u.avatar_url)}<div class="cl-name">${esc(c.u.name)}</div><div class="cl-st" id="cl-st">${incoming ? (c.kind === "video" ? "Incoming video call…" : "Incoming voice call…") : ""}</div></div>` +
    `<div class="cl-btns" id="cl-btns"></div>`;
  document.body.appendChild(ui);
  paintBtns();
  const lv = document.getElementById("cl-lv"); if (lv && c.stream){ lv.srcObject = c.stream; lv.play().catch(() => {}); }
}
function paintBtns(){
  const c = call, b = document.getElementById("cl-btns"); if (!c || !b) return;
  if (c.state === "incoming"){
    b.innerHTML = `<button class="cl-b red" onclick="endCall('decline')" aria-label="Decline">✖</button><button class="cl-b grn" onclick="acceptCall()" aria-label="Answer">${c.kind === "video" ? "📹" : "📞"}</button>`;
    return;
  }
  b.innerHTML =
    `<button id="cl-mute" class="cl-b ${c.muted ? "off" : ""}" onclick="toggleMute()" aria-label="Mute">${c.muted ? "🔇" : "🎤"}</button>` +
    (c.kind === "video" ? `<button id="cl-cam" class="cl-b ${c.camOff ? "off" : ""}" onclick="toggleCam()" aria-label="Camera">${c.camOff ? "🚫" : "📹"}</button><button class="cl-b" onclick="flipCam()" aria-label="Flip camera">🔄</button>` : "") +
    `<button class="cl-b red" onclick="hangUp()" aria-label="End call">✖</button>`;
}
function setSt(t){
  const el = document.getElementById("cl-st"); if (el) el.textContent = t;
  if (call && call.state === "connecting"){ const b = document.getElementById("cl-btns"); if (b && !document.getElementById("cl-mute")) paintBtns(); const lv = document.getElementById("cl-lv"); if (lv){ lv.classList.remove("hidden"); if (call.stream && lv.srcObject !== call.stream){ lv.srcObject = call.stream; lv.play().catch(() => {}); } } }
}

/* ---------- ring sound + screen lock ---------- */
function ringLoop(dir){
  stopRing();
  const go = () => { try { tone(dir === "in" ? "in" : "out"); } catch (e) {} };
  go(); call.ringI = setInterval(go, dir === "in" ? 2200 : 3200);
}
function stopRing(){ if (call && call.ringI){ clearInterval(call.ringI); call.ringI = null; } }
let wl = null;
async function wakeOn(){ try { if (navigator.wakeLock) wl = await navigator.wakeLock.request("screen"); } catch (e) {} }
function wakeOff(){ try { wl && wl.release(); } catch (e) {} wl = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && call && call.state !== "incoming") wakeOn(); });

/* start listening as soon as the user is logged in */
setInterval(() => { try { if (typeof me !== "undefined" && me && !callCh) callsInit(); } catch (e) {} }, 1500);
