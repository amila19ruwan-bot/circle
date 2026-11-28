/* Circle native helpers (Android APK only). Does nothing in a normal browser.
   1) Back button: remembers in-app page changes so Android Back goes to the previous page.
   2) Pull-to-refresh: tells the APK whether the scrolled area is at its top.
   3) Push: gets the Firebase (FCM) token and saves it in Supabase. */

/* ---------- 1 + 2: back button and scroll position ---------- */
(function () {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  /* Back button: every go(...) call adds a browser-history entry */
  if (typeof window.go === "function") {
    const origGo = window.go;
    let last = JSON.stringify(["home"]);
    let popping = false;
    try { history.replaceState({ g: ["home"] }, ""); } catch (e) {}

    window.go = function () {
      const args = Array.prototype.slice.call(arguments);
      const r = origGo.apply(this, args);
      if (!popping) {
        const k = JSON.stringify(args);
        if (k !== last) {
          last = k;
          try { history.pushState({ g: args }, ""); } catch (e) {}
        }
      }
      return r;
    };

    window.addEventListener("popstate", function (e) {
      const g = (e.state && e.state.g) || ["home"];
      popping = true;
      last = JSON.stringify(g);
      try { origGo.apply(null, g); } catch (err) {}
      popping = false;
    });
  }

  /* Pull-to-refresh: report if the area under the finger is scrolled down */
  let target = null;
  function atTop(el) {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollTop > 0) return false;
    }
    const se = document.scrollingElement;
    return !(se && se.scrollTop > 0);
  }
  function report() {
    try { if (window.CircleNative) window.CircleNative.setTop(atTop(target)); } catch (e) {}
  }
  document.addEventListener("touchstart", function (e) { target = e.target; report(); }, { passive: true, capture: true });
  document.addEventListener("scroll", report, { passive: true, capture: true });
})();

/* ---------- 3: push notifications ---------- */
(function () {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const PN = cap.Plugins && cap.Plugins.PushNotifications;
  if (!PN) return;

  let started = false, token = null, saved = "", fails = 0;

  function warn(msg) {
    try { if (typeof soon === "function") soon(msg); } catch (e) {}
    try { console.warn(msg); } catch (e) {}
  }

  async function saveToken() {
    if (!token || typeof me === "undefined" || !me) return;
    const key = me.id + ":" + token;
    if (saved === key) return;
    const { error } = await sb.rpc("save_push_sub", { p_endpoint: "fcm:" + token, p_p256dh: "fcm", p_auth: "fcm" });
    if (error) return warn("Notification setup failed: " + error.message);
    saved = key;
  }

  function onTap(action) {
    try {
      const d = (action && action.notification && action.notification.data) || {};
      if (d.from && typeof openChat === "function") openChat(d.from);
    } catch (e) {}
  }

  async function start() {
    if (started || typeof me === "undefined" || !me) return;
    started = true;
    try {
      try {
        await PN.createChannel({ id: "messages", name: "Messages", description: "New messages", importance: 4, visibility: 1, vibration: true });
        await PN.createChannel({ id: "calls", name: "Calls", description: "Incoming calls", importance: 5, visibility: 1, vibration: true });
      } catch (e) {}
      let p = await PN.checkPermissions();
      if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PN.requestPermissions();
      if (p.receive !== "granted") return;
      await PN.addListener("registration", t => { token = t.value; saveToken(); });
      await PN.addListener("registrationError", e => warn("Notification registration failed"));
      await PN.addListener("pushNotificationActionPerformed", onTap);
      await PN.register();
    } catch (e) {
      if (++fails < 3){ started = false; }
      warn("Notification setup error");
    }
  }

  /* wait until the user is logged in, then set up; also re-save if the account changes */
  setInterval(() => { start(); saveToken(); }, 3000);
})();
