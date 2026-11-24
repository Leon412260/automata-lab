/*
 * Automata Lab — live sessions (class mode, Kahoot-style).
 *
 * The editor opens a session for one exercise; participants join with a 4-digit session code and a
 * name of their choice. Every "Check" sends only the result (solved yes/no, number of attempts),
 * never the automaton. The editor sees the counts live; the session and its data are deleted at the end.
 *
 * Two interchangeable backends with the same interface:
 *   - Firebase Realtime Database (configured in live-config.js) — works across computers
 *   - local test mode (localStorage) — works only between tabs of the same browser; used when no
 *     Firebase configuration is present, or with ?live=local
 *
 * Data layout (Firebase): sessions/<code>/meta      { open, owner, title, createdAt, endsAt }
 *                         sessions/<code>/exercise  JSON string of the exercise
 *                         sessions/<code>/players/<uid> { name, joinedAt, attempts, solved, solvedAt }
 */
(function (root) {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const TTL = 3 * 60 * 60 * 1000;   // a forgotten session expires after 3 hours

  /** Sessions created before expiry existed fall back to createdAt. */
  function isExpired(meta, now) { return now > (meta.expiresAt || (meta.createdAt || 0) + TTL); }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src + ' — check the internet connection.'));
      document.head.appendChild(s);
    });
  }

  // ---------- Firebase ----------
  function firebaseBackend(config) {
    let db = null, uid = null, offset = 0;
    return {
      kind: 'firebase',
      now: () => Date.now() + offset,      // server time: the countdown agrees on every computer
      async init() {
        if (uid) return uid;
        if (!root.firebase || !root.firebase.database) {
          await loadScript(SDK + 'firebase-app-compat.js');
          await loadScript(SDK + 'firebase-auth-compat.js');
          await loadScript(SDK + 'firebase-database-compat.js');
        }
        const fb = root.firebase;
        if (!fb.apps.length) fb.initializeApp(config);
        const cred = await fb.auth().signInAnonymously();
        uid = cred.user.uid;
        db = fb.database();
        db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
        return uid;
      },
      uid: () => uid,
      async getMeta(code) { return (await db.ref(`sessions/${code}/meta`).get()).val(); },
      async getExercise(code) { const v = (await db.ref(`sessions/${code}/exercise`).get()).val(); return v ? JSON.parse(v) : null; },
      async create(code, meta, exercise) {
        // two child writes (meta first): the security rules check each part separately
        const now = this.now();
        const full = Object.assign({}, meta, { owner: uid, createdAt: now, expiresAt: now + TTL });
        await db.ref(`sessions/${code}/meta`).set(full);
        try { await db.ref(`sessions/${code}/exercise`).set(JSON.stringify(exercise)); }
        catch (e) { await this.end(code).catch(() => {}); throw e; }   // no half-created session
        return full;
      },
      async setMeta(code, patch) { await db.ref(`sessions/${code}/meta`).update(patch); },
      async end(code) { await db.ref(`sessions/${code}`).remove(); },
      async setPlayer(code, patch) { await db.ref(`sessions/${code}/players/${uid}`).update(patch); },
      async getPlayer(code) { return (await db.ref(`sessions/${code}/players/${uid}`).get()).val(); },
      /** cb(null) only when the server confirms that the session is gone; read errors go to onError. */
      watchMeta(code, cb, onError) {
        const ref = db.ref(`sessions/${code}/meta`);
        let stopped = false;
        const fail = e => { if (!stopped && onError) onError(e); };
        const h = ref.on('value', async s => {
          if (s.val() !== null) { cb(s.val()); return; }
          // a refused local write also looks like null for a moment: ask again before believing it
          await new Promise(r => setTimeout(r, 1200));
          if (stopped) return;
          try { const again = (await ref.get()).val(); if (!stopped) cb(again); } catch (e) { fail(e); }
        }, fail);
        return () => { stopped = true; ref.off('value', h); };
      },
      watchPlayers(code, cb, onError) {
        const ref = db.ref(`sessions/${code}/players`);
        const h = ref.on('value', s => cb(s.val() || {}), e => { if (onError) onError(e); });
        return () => ref.off('value', h);
      },
    };
  }

  // ---------- local test mode (same browser only) ----------
  function localBackend() {
    const KEY = c => 'automata-lab:live:' + c;
    let uid = null;
    const read = c => { try { return JSON.parse(localStorage.getItem(KEY(c))); } catch (e) { return null; } };
    const write = (c, v) => {
      if (v === null) localStorage.removeItem(KEY(c)); else localStorage.setItem(KEY(c), JSON.stringify(v));
      window.dispatchEvent(new CustomEvent('live-local', { detail: c }));   // the 'storage' event only reaches other tabs
    };
    function watch(code, pick, cb) {
      const fire = () => { const s = read(code); cb(pick(s)); };
      const onStorage = e => { if (!e.key || e.key === KEY(code)) fire(); };
      const onLocal = e => { if (e.detail === code) fire(); };
      window.addEventListener('storage', onStorage);
      window.addEventListener('live-local', onLocal);
      setTimeout(fire, 0);
      return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('live-local', onLocal); };
    }
    return {
      kind: 'local',
      now: () => Date.now(),
      async init() {
        if (uid) return uid;
        try { uid = sessionStorage.getItem('automata-lab:live-uid'); } catch (e) { uid = null; }
        if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('automata-lab:live-uid', uid); } catch (e) { /* ignore */ } }
        return uid;
      },
      uid: () => uid,
      async getMeta(code) { const s = read(code); return s ? s.meta : null; },
      async getExercise(code) { const s = read(code); return s ? JSON.parse(s.exercise) : null; },
      async create(code, meta, exercise) {
        const full = Object.assign({}, meta, { owner: uid, createdAt: Date.now(), expiresAt: Date.now() + TTL });
        write(code, { meta: full, exercise: JSON.stringify(exercise), players: {} });
        return full;
      },
      async setMeta(code, patch) { const s = read(code); if (s) { Object.assign(s.meta, patch); write(code, s); } },
      async end(code) { write(code, null); },
      async setPlayer(code, patch) {
        const s = read(code);
        if (!s || !s.meta.open) throw new Error('The session is closed.');
        s.players = s.players || {};
        s.players[uid] = Object.assign({}, s.players[uid], patch);
        write(code, s);
      },
      async getPlayer(code) { const s = read(code); return (s && s.players && s.players[uid]) || null; },
      watchMeta(code, cb) { return watch(code, s => (s ? s.meta : null), cb); },
      watchPlayers(code, cb) { return watch(code, s => (s && s.players) || {}, cb); },
    };
  }

  let backend = null;
  function get() {
    if (backend) return backend;
    const forceLocal = new URLSearchParams(location.search).get('live') === 'local';
    const cfg = root.AUTOMATA_LAB_FIREBASE;
    backend = !forceLocal && cfg && cfg.apiKey && cfg.databaseURL ? firebaseBackend(cfg) : localBackend();
    return backend;
  }

  /** A free 4-digit session code. */
  async function newCode(b) {
    for (let i = 0; i < 30; i++) {
      const c = String(1000 + Math.floor(Math.random() * 9000));
      const m = await b.getMeta(c);
      if (!m) return c;
      if (isExpired(m, b.now())) { try { await b.end(c); return c; } catch (e) { /* not removable: try another code */ } }
    }
    throw new Error('Could not find a free session code — try again.');
  }

  root.Live = { get, newCode, isExpired, now: () => get().now(), isTestMode: () => get().kind === 'local' };
})(typeof self !== 'undefined' ? self : this);
