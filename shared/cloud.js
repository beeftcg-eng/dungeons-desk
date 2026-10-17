// Cloud sign-in and calls for sync, shared by the desktop app, the phone DM app and the character sheet app.
// It talks to the shared Pawmodoro Supabase project over plain REST (no SDK): accounts are Pawmodoro accounts
// (the same ones Beef's Brewhouse uses), and the tables, functions and the `dmdesk` bucket are in Pawmodoro's
// supabase/schema.sql. The anon key only carries the `anon` role; row-level security protects each person's data.
// Keep URL and KEY identical to Pawmodoro's cloud_defaults.py / docs/app.js and Deckbuilder's pawmodoroDefaults.ts.
window.Cloud = (() => {
  const URL_ = 'https://cinxclbsgamdprftcbek.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpbnhjbGJzZ2FtZHByZnRjYmVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTc4OTIsImV4cCI6MjEwNTEzMzg5Mn0.1hpyBV2ZO3MeQUSnx3K5-XG6BbzY-gXb-4uG6Ls7Fr0';
  const BUCKET = 'dmdesk';
  const STORE = 'dd.cloud.session';
  const listeners = new Set();

  // An error the apps can show as is. code: 'auth' (signed out / wrong password), 'setup' (schema not deployed),
  // 'offline', or 'server'.
  class CloudError extends Error { constructor(message, code) { super(message); this.code = code; } }

  let session = null;
  try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { session = null; }
  function setSession(s) {
    session = s;
    try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch { /* storage blocked */ }
    listeners.forEach(f => { try { f(user()); } catch { /* a listener's problem */ } });
  }
  const user = () => session && session.user ? { id: session.user.id, email: session.user.email } : null;
  const fromAuth = (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user.id, email: j.user.email } });

  async function request(path, opts = {}) {
    let res;
    try { res = await fetch(URL_ + path, opts); } catch { throw new CloudError('Can\'t reach the cloud. Check your internet connection.', 'offline'); }
    return res;
  }
  async function authCall(path, body) {
    const res = await request('/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = j.msg || j.error_description || j.message || `Sign-in failed (${res.status})`;
      throw new CloudError(/invalid login/i.test(msg) ? 'Wrong email or password.' : msg, 'auth');
    }
    return j;
  }

  async function signIn(email, password) {
    setSession(fromAuth(await authCall('token?grant_type=password', { email, password })));
    return user();
  }
  async function signUp(email, password) {
    const j = await authCall('signup', { email, password });
    if (!j.access_token) throw new CloudError('Check your email to confirm the account, then sign in.', 'auth');
    setSession(fromAuth(j));
    return user();
  }
  function signOut() {
    const s = session;
    setSession(null);
    if (s) request('/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
  }

  // A fresh access token. The refresh token rotates on every use, so only one refresh runs at a time.
  let refreshing = null;
  async function token() {
    if (!session) throw new CloudError('Not signed in.', 'auth');
    if (session.expires_at - Date.now() > 60000) return session.access_token;
    refreshing = refreshing || (async () => {
      try { setSession(fromAuth(await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token }))); }
      catch (e) { if (e.code === 'auth') setSession(null); throw e.code === 'auth' ? new CloudError('Signed out. Sign in again to keep syncing.', 'auth') : e; }
      finally { refreshing = null; }
    })();
    await refreshing;
    return session.access_token;
  }
  const headers = async (extra) => ({ apikey: KEY, Authorization: 'Bearer ' + await token(), ...extra });

  // A function in Pawmodoro's schema (the dmdesk_* ones).
  async function rpc(name, args = {}) {
    const res = await request('/rest/v1/rpc/' + name, { method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(args) });
    if (res.ok) return res.status === 204 ? null : res.json();
    const j = await res.json().catch(() => ({}));
    if (res.status === 404 || j.code === 'PGRST202') throw new CloudError('Cloud sync isn\'t set up on the server yet.', 'setup');
    if (res.status === 401) { setSession(null); throw new CloudError('Signed out. Sign in again to keep syncing.', 'auth'); }
    throw new CloudError(j.message || `The cloud said no (${res.status}).`, 'server');
  }

  // Images in the private bucket, always under the user's own id: <user>/<rest>.
  const own = (rest) => `${user().id}/${rest}`;
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const storage = {
    async upload(rest, blob) {
      const res = await request(`/storage/v1/object/${BUCKET}/${enc(own(rest))}`, { method: 'POST', headers: await headers({ 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }), body: blob });
      if (!res.ok) throw new CloudError(`Couldn't upload an image (${res.status}).`, 'server');
    },
    async download(rest) {
      const res = await request(`/storage/v1/object/authenticated/${BUCKET}/${enc(own(rest))}`, { headers: await headers() });
      if (!res.ok) throw new CloudError(`Couldn't download an image (${res.status}).`, 'server');
      return res.blob();
    },
    // Names directly inside a folder (not recursive).
    async list(folder) {
      const out = [];
      for (let offset = 0; ; offset += 1000) {
        const res = await request(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: own(folder) + '/', limit: 1000, offset }) });
        if (!res.ok) throw new CloudError(`Couldn't list images (${res.status}).`, 'server');
        const page = await res.json();
        page.filter(o => o.id).forEach(o => out.push(o.name));
        if (page.length < 1000) return out;
      }
    },
    async remove(rests) {
      for (let i = 0; i < rests.length; i += 100) {
        const res = await request(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: rests.slice(i, i + 100).map(own) }) });
        if (!res.ok) throw new CloudError(`Couldn't delete images (${res.status}).`, 'server');
      }
    },
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return { URL: URL_, user, signIn, signUp, signOut, rpc, storage, uid, CloudError, onChange: (f) => listeners.add(f) };
})();
