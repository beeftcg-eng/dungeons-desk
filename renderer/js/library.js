// The homebrew library: one set of homebrew notes shared by every campaign, on this device (dm.library: Documents/
// Dungeons Desk Library on desktop, IndexedDB on the phone) and, when signed in, in the account (a hidden cloud
// campaign, CLOUD_ID, synced with the same dmdesk_* functions as campaigns).
// Each campaign keeps its own copies in Homebrew/, so notes stay editable and shareable as usual. Keeping them in step:
//  - plan(): this campaign ↔ the library. The last state both agreed on (a hash per path, kept per campaign in this
//    device's library sync state, never in the campaign, which may sync to devices with another library) says which side changed: new homebrew goes into the library, library entries come into the campaign, edits and
//    deletions travel either way. Two different versions that meet for the first time ("local") stay apart.
//  - cloudPlan(): the library ↔ the account, against the revisions last synced (dm.library.meta()).
// Who a note is shared with (share:) belongs to each campaign, so it never goes into the library. A note with
// `library: false` stays in its campaign only.
window.Library = (() => {
  const CLOUD_ID = 'dd-homebrew-library';
  const CLOUD_NAME = '★ Homebrew library (shared by all campaigns)';

  function hash(s) {
    let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  // A note without its share: lines (and the share lines on their own), so sharing stays with each campaign.
  function splitShare(content) {
    content = String(content || '').replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---(?=\n|$)/.exec(content);
    if (!m) return { body: content, share: '' };
    const keep = [], share = [], lines = m[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^share\s*:/.test(lines[i])) { share.push(lines[i]); while (i + 1 < lines.length && /^\s+(-|\S)/.test(lines[i + 1])) share.push(lines[++i]); }
      else keep.push(lines[i]);
    }
    return { body: `---\n${keep.join('\n')}\n---` + content.slice(m[0].length), share: share.join('\n') };
  }
  const withShare = (body, share) => share ? body.replace(/^---\n/, `---\n${share}\n`) : body;
  const libHash = (content) => hash(splitShare(content).body);
  const optedOut = (content) => { const m = /^---\n([\s\S]*?)\n---/.exec(String(content || '').replace(/\r\n/g, '\n')); return !!m && /^library\s*:\s*(false|no|off)\s*$/im.test(m[1]); };
  const isHomebrewPath = (p) => /^Homebrew\/.+\.md$/i.test(p);

  // camp: Map path → {content, mtime} (this campaign's Homebrew/ notes, without opted-out ones); lib: Map path →
  // {content, mtime}; base: {path: hash | 'local'}. → { actions: [{do, path, content?}], base, kept: [paths] }.
  // do: 'note' (write into the campaign), 'unnote' (delete from the campaign), 'lib' (write into the library),
  // 'unlib' (delete from the library).
  function plan(camp, lib, base) {
    const out = [], nb = { ...base }, kept = [];
    for (const path of new Set([...camp.keys(), ...lib.keys(), ...Object.keys(base)])) {
      const c = camp.get(path), l = lib.get(path), b = base[path];
      if (b === 'local') { if (c) kept.push(path); else delete nb[path]; continue; }
      const ch = c && libHash(c.content), lh = l && libHash(l.content);
      const toNote = () => out.push({ do: 'note', path, content: withShare(splitShare(l.content).body, c ? splitShare(c.content).share : '') });
      const toLib = () => out.push({ do: 'lib', path, content: splitShare(c.content).body });
      if (c && l) {
        if (ch === lh) nb[path] = ch;
        else if (b === ch) { toNote(); nb[path] = lh; }                    // changed in the library (another campaign)
        else if (b === lh) { toLib(); nb[path] = ch; }                     // changed here
        else if (b === undefined) { nb[path] = 'local'; kept.push(path); } // two versions meeting for the first time
        else if ((c.mtime || 0) >= (l.mtime || 0)) { toLib(); nb[path] = ch; } // both changed: the newer one wins
        else { toNote(); nb[path] = lh; }
      } else if (c) {
        if (b === undefined) { toLib(); nb[path] = ch; }                   // new homebrew in this campaign
        else if (b === ch) { out.push({ do: 'unnote', path }); delete nb[path]; } // removed from the library elsewhere
        else { toLib(); nb[path] = ch; }                                   // removed elsewhere, but changed here since: keep it
      } else if (l) {
        if (b === undefined) { toNote(); nb[path] = lh; }                  // new in the library
        else if (b === lh) { out.push({ do: 'unlib', path }); delete nb[path]; } // deleted in this campaign
        else { toNote(); nb[path] = lh; }                                  // deleted here, but changed elsewhere since: keep it
      } else delete nb[path];
    }
    // Something wiped a whole side (an emptied library folder, a campaign whose notes didn't load): put things back
    // instead of deleting half of everything.
    const known = Object.keys(base).length, gone = (k) => out.filter(a => a.do === k);
    if (gone('unlib').length > 5 && gone('unlib').length > known / 2) gone('unlib').forEach(a => { const l = lib.get(a.path); Object.assign(a, { do: 'note', content: l.content }); nb[a.path] = libHash(l.content); });
    if (gone('unnote').length > 5 && gone('unnote').length > known / 2) gone('unnote').forEach(a => { const c = camp.get(a.path); Object.assign(a, { do: 'lib', content: splitShare(c.content).body }); nb[a.path] = libHash(c.content); });
    return { actions: out, base: nb, kept };
  }

  // lib: Map path → content; files: {path: {rev, hash}} as last synced; rows: dmdesk_pull_files rows.
  // → { write: [{path, content}], remove: [paths], files } after pulling. Pushing is what's left: any local file whose
  // hash differs from files[path].hash, and any files[path] with no local file.
  function cloudPlan(lib, files, rows) {
    const nf = { ...files }, write = [], remove = [];
    for (const row of rows) {
      const m = nf[row.path], local = lib.get(row.path);
      if (m && m.rev === row.rev) continue;
      const localChanged = local != null && (!m || hash(local) !== m.hash);
      if (row.deleted) {
        if (local != null && !localChanged) { remove.push(row.path); delete nf[row.path]; }
        else if (local != null) nf[row.path] = { rev: row.rev, hash: null };    // changed here: it goes up again
        else delete nf[row.path];
      } else if (!localChanged || local == null) { write.push({ path: row.path, content: row.content }); nf[row.path] = { rev: row.rev, hash: hash(row.content) }; }
      else if (hash(local) === hash(row.content)) nf[row.path] = { rev: row.rev, hash: hash(local) };
      else nf[row.path] = { rev: row.rev, hash: m ? m.hash : null };           // both changed: this device's goes up
    }
    return { write, remove, files: nf };
  }

  // ---------- In the app ----------
  let loaded = false, busy = null, again = false, timer = null, lastError = null, lastSync = null, stats = { count: 0, kept: [] }, cardEl = null;
  const soon = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(() => syncNow().catch(() => {}), ms); };

  function syncNow() {
    if (busy) { again = true; return busy; }
    busy = run().then(() => { lastError = null; }, (e) => { lastError = e.message || String(e); if (e.code !== 'offline') console.warn('Homebrew library:', e); })
      .finally(() => { busy = null; lastSync = Date.now(); drawCard(); if (again) { again = false; soon(1000); } });
    return busy;
  }
  async function run() {
    await Notes.flush();
    let libChanged = await campaignSync();
    if (window.Cloud && Cloud.user()) {
      const pulled = await cloudSync();
      if (pulled) libChanged = (await campaignSync()) || libChanged;
      if (libChanged) await cloudSync();
    }
  }

  // This campaign ↔ the library. Returns whether the library changed.
  async function campaignSync() {
    if (!loaded) { await Notes.refresh(); loaded = true; }
    const cache = Notes.notesCache(), camp = new Map();
    Notes.list().forEach(n => { const c = cache.get(n.path); if (isHomebrewPath(n.path) && c != null && !optedOut(c)) camp.set(n.path, { content: c, mtime: n.mtime }); });
    const libFiles = await dm.library.list(), lib = new Map(libFiles.map(f => [f.path, f]));
    const meta = await dm.library.meta(), key = String(await dm.vault.get()), bases = meta.campaigns || {};
    const p = plan(camp, lib, bases[key] || {});
    const notes = [];
    let libChanged = false;
    for (const a of p.actions) {
      if (a.do === 'note') { await dm.notes.write(a.path, a.content); notes.push(a.path); }
      else if (a.do === 'unnote') { await dm.notes.delete(a.path); notes.push(a.path); }
      else if (a.do === 'lib') { await dm.library.write(a.path, a.content); libChanged = true; }
      else if (a.do === 'unlib') { await dm.library.delete(a.path); libChanged = true; }
    }
    if (JSON.stringify(p.base) !== JSON.stringify(bases[key] || {})) { const m = await dm.library.meta(); m.campaigns = { ...(m.campaigns || {}), [key]: p.base }; await dm.library.saveMeta(m); }
    if (notes.length) await Notes.syncedChanges(notes);
    stats = { count: new Set([...lib.keys(), ...p.actions.filter(a => a.do === 'lib').map(a => a.path)]).size - p.actions.filter(a => a.do === 'unlib').length, kept: p.kept };
    return libChanged;
  }

  // The library ↔ the account. Returns whether anything came down.
  async function cloudSync(retried) {
    const user = Cloud.user();
    let meta = await dm.library.meta();
    if (meta.user !== user.id) meta = { campaigns: meta.campaigns, user: user.id, since: 0, files: {} }; // another account: start over
    if (!meta.created) { await Cloud.rpc('dmdesk_save_campaign', { p_id: CLOUD_ID, p_name: CLOUD_NAME }); meta.created = true; }
    const libFiles = await dm.library.list(), lib = new Map(libFiles.map(f => [f.path, f.content]));
    const r = await Cloud.rpc('dmdesk_pull_files', { p_campaign: CLOUD_ID, p_since: meta.since || 0 });
    // The cloud copy was deleted (or never made): make it again, once, and send everything.
    if (!r.exists) { if (retried) throw new Error('Couldn\'t create the library in your account'); meta.created = false; meta.files = {}; meta.since = 0; await dm.library.saveMeta(meta); return cloudSync(true); }
    const p = cloudPlan(lib, meta.files || {}, r.rows.filter(row => isHomebrewPath(row.path)));
    for (const w of p.write) { await dm.library.write(w.path, w.content); lib.set(w.path, w.content); }
    for (const path of p.remove) { await dm.library.delete(path); lib.delete(path); }
    meta.files = p.files; meta.since = r.since;
    for (const [path, content] of lib) {
      const m = meta.files[path], h = hash(content);
      if (m && m.hash === h) continue;
      let res = await Cloud.rpc('dmdesk_put_file', { p_campaign: CLOUD_ID, p_path: path, p_content: content, p_base_rev: m ? m.rev : 0 });
      if (!res.ok) res = await Cloud.rpc('dmdesk_put_file', { p_campaign: CLOUD_ID, p_path: path, p_content: content, p_base_rev: res.rev }); // last write wins
      if (res.ok) meta.files[path] = { rev: res.rev, hash: h };
    }
    for (const path of Object.keys(meta.files)) {
      if (lib.has(path)) continue;
      await Cloud.rpc('dmdesk_delete_file', { p_campaign: CLOUD_ID, p_path: path, p_base_rev: meta.files[path].rev });
      delete meta.files[path];
    }
    await dm.library.saveMeta(meta);
    return p.write.length + p.remove.length > 0;
  }

  // A note that kept its own version: take the library's, or put this one in the library for every campaign.
  async function resolveKept(path, take) {
    const meta = await dm.library.meta(), key = String(await dm.vault.get()), base = { ...((meta.campaigns || {})[key] || {}) };
    const lib = (await dm.library.list()).find(f => f.path === path), cur = Notes.notesCache().get(path);
    if (take === 'library' && lib) { await dm.notes.write(path, withShare(splitShare(lib.content).body, splitShare(cur || '').share)); base[path] = libHash(lib.content); await Notes.syncedChanges([path]); }
    else if (cur != null) { await dm.library.write(path, splitShare(cur).body); base[path] = libHash(cur); }
    meta.campaigns = { ...(meta.campaigns || {}), [key]: base }; await dm.library.saveMeta(meta);
    soon(200);
  }

  function init() {
    soon(1500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(800); });
    window.addEventListener('focus', () => soon(800));
    setInterval(() => soon(0), 60000);
    if (window.Cloud) Cloud.onChange(() => soon(500));
  }

  // ⚙ Settings card.
  function card() {
    cardEl = U.h('div.card');
    drawCard();
    return cardEl;
  }
  function drawCard() {
    if (!cardEl) return;
    const { h } = U;
    cardEl.innerHTML = '';
    const signedIn = window.Cloud && Cloud.user();
    cardEl.append(h('h3', '📚 Homebrew library'),
      h('p', `Your homebrew monsters, spells and items are shared by all your campaigns${signedIn ? ', on every device you sign in on' : ' on this device'}. Make or import homebrew in any campaign and it's in all of them; edit or delete it in one and the others follow.`),
      h('p.dim.small', `${stats.count} note${stats.count === 1 ? '' : 's'} in the library. ${busy ? 'Syncing…' : lastError ? '' : lastSync ? 'Up to date.' : ''}`, lastError ? h('span.err-text', ` ⚠ ${lastError}`) : null),
      signedIn ? null : h('p.dim.small', 'Sign in under ☁ Cloud sync to keep it in your account too, so the phone app and your other computers have it.'),
      h('p.dim.small', 'Who you share a note with stays per campaign. To keep a note in one campaign only, add ', h('code', 'library: false'), ' to its properties.'),
      stats.kept.length ? h('div.callout.callout-warning', h('div.callout-title', `⚠ ${stats.kept.length} with a different version in the library`),
        h('p.small', 'These were in this campaign before the library had another version with the same name, so this campaign keeps its own for now.'),
        stats.kept.map(p => h('div.row', h('span.grow', p.replace(/^Homebrew\//, '').replace(/\.md$/, '')),
          h('button.small', { onclick: () => resolveKept(p, 'library') }, 'Use the library\'s'), h('button.small', { onclick: () => resolveKept(p, 'mine') }, 'Use this one everywhere')))) : null,
      h('div.row', h('button', { onclick: () => syncNow() }, '↻ Sync now'), dm.isWeb ? null : h('button', { onclick: () => dm.library.reveal() }, '📂 Open library folder')));
  }

  return { init, card, syncNow, soon, plan, cloudPlan, splitShare, withShare, optedOut, hash, CLOUD_ID };
})();
