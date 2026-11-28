/* Circle native push (Android APK only).
   Gets the Firebase (FCM) token and saves it in Supabase so the server can notify this phone
   even when the app is closed. Does nothing in a normal browser. */
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
