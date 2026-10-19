// An in-memory stand-in for Pawmodoro's dmdesk_* file functions (supabase/schema.sql in the pawmodoro repo), with the
// same rules: a campaign must exist before files go in, every write needs the revision it was based on (a stale one
// gets the current file back instead), deleting leaves a deleted row, and pulls are by sequence number. Tests sync
// several "devices" through it: test-library.js (the homebrew library) and test-tablenotes.js (online-table notes).
function fakeCloud() {
  let seq = 0, user = { id: 'user-1', email: 'dm@example.test' };
  const camps = new Map(), files = new Map();             // `${user}|${campaign}` → {name, deleted}; `${user}|${campaign}|${path}` → row
  const key = (...k) => [user.id, ...k].join('|');
  const signedIn = () => { if (!user) throw new Error('not signed in'); };
  const rpcs = {
    dmdesk_save_campaign({ p_id, p_name }) { signedIn(); camps.set(key(p_id), { name: p_name, deleted: false }); return null; },
    dmdesk_delete_campaign({ p_id }) { signedIn(); const c = camps.get(key(p_id)); if (c) c.deleted = true; return null; },
    dmdesk_pull_files({ p_campaign, p_since }) {
      signedIn();
      const c = camps.get(key(p_campaign)), mine = [...files.entries()].filter(([k]) => k.startsWith(key(p_campaign) + '|')).map(([, r]) => r);
      return { exists: !!c && !c.deleted, since: Math.max(p_since || 0, ...mine.map(r => r.seq)),
        rows: mine.filter(r => r.seq > (p_since || 0)).sort((a, b) => a.seq - b.seq).map(r => ({ path: r.path, rev: r.rev, deleted: r.deleted, content: r.deleted ? null : r.content })) };
    },
    dmdesk_put_file({ p_campaign, p_path, p_content, p_base_rev }) {
      signedIn();
      const c = camps.get(key(p_campaign));
      if (!c || c.deleted) throw new Error('no such campaign');
      const cur = files.get(key(p_campaign, p_path));
      if (cur && cur.rev !== (p_base_rev || 0)) return { ok: false, rev: cur.rev, deleted: cur.deleted, content: cur.content };
      const row = { path: p_path, content: p_content || '', rev: cur ? cur.rev + 1 : 1, deleted: false, seq: ++seq };
      files.set(key(p_campaign, p_path), row);
      return { ok: true, rev: row.rev };
    },
    dmdesk_delete_file({ p_campaign, p_path, p_base_rev }) {
      signedIn();
      const cur = files.get(key(p_campaign, p_path));
      if (!cur || cur.deleted) return { ok: true, rev: cur ? cur.rev : 0 };
      if (cur.rev !== (p_base_rev || 0)) return { ok: false, rev: cur.rev, deleted: false, content: cur.content };
      Object.assign(cur, { deleted: true, content: '', rev: cur.rev + 1, seq: ++seq });
      return { ok: true, rev: cur.rev };
    },
  };
  const listeners = new Set();
  const Cloud = {
    user: () => user,
    async rpc(name, args) { if (!rpcs[name]) throw new Error('no such function ' + name); return JSON.parse(JSON.stringify(rpcs[name](args) ?? null)); },
    async signIn(email) { user = { id: 'user-' + email, email }; listeners.forEach(f => f()); },
    signOut() { user = null; listeners.forEach(f => f()); },
    onChange: (f) => listeners.add(f),
  };
  // What the account holds now: {path: content} for one campaign, deleted files left out.
  const contents = (campaign) => Object.fromEntries([...files.entries()].filter(([k, r]) => k.startsWith(key(campaign) + '|') && !r.deleted).map(([, r]) => [r.path, r.content]));
  return { Cloud, contents, camps, as: (u) => { user = u; } };
}
module.exports = { fakeCloud };
