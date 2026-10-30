/* Sesli sohbet — oda boyunca açık kalır, oyun değişse de kopmaz.
   Sesteki herkes birbirine doğrudan bağlanır (PeerJS medya çağrıları). */
(function (root) {
  'use strict';

  const V = {
    on: false, muted: false, stream: null, peer: null,
    calls: new Map(), audios: new Map(), room: [],
    notify: () => {}, onChange: () => {},

    attach(peer, notify) {
      V.peer = peer;
      V.notify = notify;
      peer.on('call', (call) => V._incoming(call));
    },

    async join() {
      if (V.on) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Tarayıcın mikrofonu desteklemiyor (site https üzerinden açılmalı).');
      }
      V.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      V.on = true;
      V.muted = false;
      V.notify(true, false);
      V._sync();
      V.onChange();
    },

    leave(silent) {
      V.on = false;
      for (const c of V.calls.values()) { try { c.close(); } catch { /* yok say */ } }
      for (const pid of [...V.calls.keys()]) V._drop(pid);
      if (V.stream) V.stream.getTracks().forEach(t => t.stop());
      V.stream = null;
      if (!silent) V.notify(false, false);
      V.onChange();
    },

    toggleMute() {
      if (!V.stream) return;
      V.muted = !V.muted;
      V.stream.getAudioTracks().forEach(t => { t.enabled = !V.muted; });
      V.notify(true, V.muted);
      V.onChange();
    },

    // Odadaki koltuk bilgisi her güncellendiğinde çağrılır
    setRoom(seats) {
      V.room = seats || [];
      V._sync();
    },

    _sync() {
      if (!V.on || !V.peer || V.peer.destroyed) return;
      const myId = V.peer.id;
      const want = new Set(V.room.filter(s => s && s.voice && s.peerId && s.peerId !== myId).map(s => s.peerId));
      for (const [pid, c] of V.calls) {
        if (!want.has(pid)) { try { c.close(); } catch { /* yok say */ } V._drop(pid); }
      }
      // Her ikili için sadece küçük kimlikli taraf arar
      for (const pid of want) {
        if (V.calls.has(pid) || !(myId < pid)) continue;
        const c = V.peer.call(pid, V.stream);
        if (c) V._wire(pid, c);
      }
    },

    _incoming(call) {
      if (!V.on) { try { call.close(); } catch { /* yok say */ } return; }
      call.answer(V.stream);
      V._wire(call.peer, call);
    },

    _wire(pid, call) {
      const old = V.calls.get(pid);
      if (old && old !== call) { try { old.close(); } catch { /* yok say */ } }
      V.calls.set(pid, call);
      call.on('stream', (s) => {
        let a = V.audios.get(pid);
        if (!a) {
          a = document.createElement('audio');
          a.autoplay = true;
          a.playsInline = true;
          document.body.appendChild(a);
          V.audios.set(pid, a);
        }
        a.srcObject = s;
        a.play().catch(() => {});
      });
      const gone = () => {
        if (V.calls.get(pid) !== call) return;
        V._drop(pid);
        setTimeout(() => V._sync(), 2000); // hâlâ sesteyse yeniden bağlan
      };
      call.on('close', gone);
      call.on('error', gone);
    },

    _drop(pid) {
      V.calls.delete(pid);
      const a = V.audios.get(pid);
      if (a) { a.srcObject = null; a.remove(); V.audios.delete(pid); }
    },
  };

  root.Voice = V;
})(this);
