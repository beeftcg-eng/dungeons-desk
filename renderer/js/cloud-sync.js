// Cloud sync for campaigns, between the desktop app and the phone app (and other computers). It works through
// window.dm, so the same code runs on both. The cloud side is Pawmodoro's dmdesk_* functions (shared/cloud.js).
//
// What syncs: every note (.md), the app state (.dmtools/state.json: party, initiative, handouts, maps…) and images
// (.dmtools/media and note attachments, in the `dmdesk` bucket under <user>/<campaign>/media|attach/).
// The link (dm.cloud.load/save, .dmtools/cloud.json on desktop) remembers, for each file, the server rev and the
// hash of what this device last synced, so a local change is "hash differs" and a remote one is "rev differs".
// - Changed on one side only: that side wins.
// - A note changed on both: this device's version stays, the other one is saved next to it as
//   "<name> (other device <date>).md", and nothing is lost.
// - The app state changed on both: merged per top-level key (party, initiative, maps…) against the last synced
//   state; a key changed on both keeps this device's.
// - Deleted on one side and changed on the other: the changed one comes back.
// Images (names are unique) are copied to whichever side lacks them. One that was on both sides at the last sync
// (link.media) and is now gone from one side was deleted there (🧹 Clean up images), so it's deleted on the other.
// Each image is at most 10 MB; bigger ones stay on their device, and the app says so once.
// The link belongs to one account (link.user). Signed in as someone else, nothing syncs until the DM signs back in
// or moves the campaign to this account (a fresh cloud copy; the other account's copy stays as it was).
window.CloudSync = (() => {
  const { h, toast } = U;
  const STATE = '.dmtools/state.json', PENDING = 'dd.cloud.pending', MAX_IMAGE = 10 * 1024 * 1024;
  let link = null, running = null, again = false, lastError = null, cardEl = null;

  // FNV-1a over the text, twice with different seeds: a cheap fingerprint to notice local changes.
  function hash(s) {
    let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  // Attachments can sit in folders, and Storage names allow few characters, so their vault path is encoded.
  const attachKey = (rel) => b64url(rel) + (/\.[a-z0-9]+$/i.exec(rel) || [''])[0].toLowerCase();
  const attachPath = (key) => { try { return unb64url(key.replace(/\.[a-z0-9]+$/i, '')); } catch { return null; } };
  const blobToDataUrl = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  function dataUrlToBlob(u) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(u), raw = atob(m[2]), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }

  const linked = () => !!(link && Cloud.user() && link.user === Cloud.user().id);
  const save = () => dm.cloud.save(link);

  // ---------- Setup ----------
  async function init() {
    link = await dm.cloud.load();
    // "Get it on this device" made this campaign and reloaded: link it, taking everything from the cloud.
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch { /* ignore */ }
    if (pending && !link && Cloud.user() && pending.user === Cloud.user().id) {
      localStorage.removeItem(PENDING);
      link = { cloudId: pending.cloudId, user: pending.user, since: 0, files: {}, media: [], base: null, adopt: true };
      await save();
    }
    Cloud.onChange(() => drawCard());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncSoon(500); });
    setInterval(() => syncSoon(0), 45000);
    if (linked()) syncSoon(link.adopt ? 300 : 3000);
  }
  let timer = null;
  function syncSoon(ms) { clearTimeout(timer); timer = setTimeout(() => syncNow().catch(() => {}), ms); }

  // ---------- One sync ----------
  function syncNow() {
    if (!linked() || document.hidden) return Promise.resolve();
    if (running) { again = true; return running; }
    running = run().then(() => { lastError = null; }, (e) => { lastError = e.message || String(e); if (e.code !== 'offline') console.warn('Cloud sync:', e); })
      .finally(() => { running = null; drawCard(); if (again) { again = false; syncSoon(1000); } });
    drawCard();
    return running;
  }

  async function run() {
    await Notes.flush();
    await Store.saveNow();
    const C = link.cloudId, files = link.files, changedNotes = new Set(), conflicts = [];
    let stateChanged = false;
    // This device as it is now.
    const local = new Map((await dm.notes.readAll()).map(n => [n.path, n.content]));
    local.set(STATE, JSON.stringify(Store.get()));

    // Keep the cloud's campaign name in step with this one's.
    const name = (await dm.campaigns.list()).currentName;
    if (link.name !== name) { await Cloud.rpc('dmdesk_save_campaign', { p_id: C, p_name: name }); link.name = name; }

    // 1. What changed in the cloud.
    const r = await Cloud.rpc('dmdesk_pull_files', { p_campaign: C, p_since: link.since || 0 });
    if (!r.exists) {
      link = null; await dm.cloud.save(null);
      toast('This campaign was removed from the cloud, so it stopped syncing. It\'s still here on this device.', 'err');
      return;
    }
    for (const row of r.rows) {
      const m = files[row.path], L = local.get(row.path);
      if (m && m.rev === row.rev) continue;                       // our own save, coming back
      const localChanged = !link.adopt && (m ? (L == null ? true : hash(L) !== m.hash) : L != null);
      if (row.path === STATE) {
        if (row.deleted) continue;
        let remote; try { remote = JSON.parse(row.content); } catch { continue; }
        // Read the live state right now (not the copy from the start), so nothing done meanwhile is lost.
        const now = JSON.parse(JSON.stringify(Store.get())), changedHere = !link.adopt && (!m || hash(JSON.stringify(now)) !== m.hash);
        await Store.replace(changedHere ? merge(link.base || {}, now, remote) : remote);
        local.set(STATE, JSON.stringify(Store.get()));
        files[STATE] = { rev: row.rev, hash: hash(row.content) };
        link.base = remote;
        stateChanged = true;
        continue;
      }
      if (!/\.md$/i.test(row.path)) continue;
      if (!localChanged || L == null) {
        // Only the cloud changed (or it was deleted here and edited there: it comes back).
        if (row.deleted) { if (L != null && !localChanged) { await dm.notes.delete(row.path); local.delete(row.path); changedNotes.add(row.path); } delete files[row.path]; }
        else { if (L !== row.content) { await dm.notes.write(row.path, row.content); changedNotes.add(row.path); } local.set(row.path, row.content); files[row.path] = { rev: row.rev, hash: hash(row.content) }; }
      } else if (row.deleted) {
        files[row.path] = { rev: row.rev, hash: '' };              // deleted there, edited here: this one goes back up
      } else if (L === row.content) {
        files[row.path] = { rev: row.rev, hash: hash(L) };
      } else {
        // Edited on both: keep this device's, save the other next to it.
        const d = new Date(), pad = (n) => String(n).padStart(2, '0');
        const copy = await freePath(row.path.replace(/\.md$/i, ` (other device ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}).md`));
        await dm.notes.write(copy, row.content);
        local.set(copy, row.content);
        files[row.path] = { rev: row.rev, hash: hash(row.content) };
        changedNotes.add(copy);
        conflicts.push(row.path.split('/').pop().replace(/\.md$/i, ''));
      }
    }
    // Adopting a campaign from the cloud: notes this new local copy made for itself (its overview) aren't kept.
    if (link.adopt) {
      for (const p of [...local.keys()]) if (p !== STATE && !files[p]) { await dm.notes.delete(p); local.delete(p); changedNotes.add(p); }
      if (!files[STATE]) files[STATE] = { rev: 0, hash: hash(local.get(STATE)) };
      delete link.adopt;
    }
    link.since = r.since;
    await save();

    // 2. What changed here.
    for (const [path, content] of local) {
      const m = files[path], hsh = hash(content);
      if (m && m.hash === hsh) continue;
      const res = await Cloud.rpc('dmdesk_put_file', { p_campaign: C, p_path: path, p_content: content, p_base_rev: m ? m.rev : 0 });
      if (res.ok) { files[path] = { rev: res.rev, hash: hsh }; if (path === STATE) link.base = JSON.parse(content); }
      else again = true;                                           // someone saved first: the next sync sorts it out
    }
    for (const path of Object.keys(files)) {
      if (local.has(path)) continue;
      const res = await Cloud.rpc('dmdesk_delete_file', { p_campaign: C, p_path: path, p_base_rev: files[path].rev });
      if (res.ok) delete files[path]; else again = true;
    }
    await save();

    // 3. Images.
    const gotImages = await syncImages(C);

    link.lastSync = Date.now();
    await save();
    if (changedNotes.size || gotImages) await Notes.syncedChanges([...changedNotes]);
    if (stateChanged) publishToPlayers();
    if (conflicts.length) toast(`Changed on two devices: ${conflicts.join(', ')}. The other version is saved next to it.`, 'err');
  }

  // Per top-level key of the app state: whichever side changed it since the last sync wins; both → this device.
  function merge(base, mine, theirs) {
    const out = {}, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) out[k] = same(mine[k], base[k]) ? theirs[k] : mine[k];
    return out;
  }
  async function freePath(p) {
    let out = p, i = 2;
    while (await dm.notes.exists(out)) out = p.replace(/\.md$/i, ` ${i++}.md`);
    return out;
  }

  async function syncImages(C) {
    let got = 0;
    const known = new Set(link.media || []), tooBig = new Set(link.tooBig || []), big = [];
    const [remoteMedia, remoteAttach, localMedia, localAttach] = await Promise.all([
      Cloud.storage.list(`${C}/media`), Cloud.storage.list(`${C}/attach`), dm.media.list(), dm.attach.list()]);
    const rm = new Set(remoteMedia), ra = new Map(remoteAttach.map(k => [attachPath(k), k]).filter(([p]) => p));
    const lm = new Set(localMedia), la = new Set(localAttach);
    // Gone from one side since the last sync: deleted there. An empty cloud with images we knew about looks more
    // like a mistake than a clean-up, so then nothing is deleted here and everything goes back up.
    if (rm.size || ra.size) {
      for (const n of [...lm]) if (!rm.has(n) && known.has('m:' + n)) { await dm.media.delete(n); lm.delete(n); got++; }
      for (const p of [...la]) if (!ra.has(p) && known.has('a:' + p)) { await dm.attach.delete(p); la.delete(p); got++; }
      const gone = [];
      for (const n of [...rm]) if (!lm.has(n) && known.has('m:' + n)) { gone.push(`${C}/media/${n}`); rm.delete(n); }
      for (const [p, k] of [...ra]) if (!la.has(p) && known.has('a:' + p)) { gone.push(`${C}/attach/${k}`); ra.delete(p); }
      if (gone.length) await Cloud.storage.remove(gone);
    }
    // New on one side: copied to the other.
    const up = async (rest, dataUrl, label) => {
      const blob = dataUrlToBlob(dataUrl);
      if (blob.size > MAX_IMAGE) { if (!tooBig.has(label)) big.push(label.replace(/^[am]:(.*\/)?/, '')); tooBig.add(label); return false; }
      await Cloud.storage.upload(rest, blob);
      return true;
    };
    for (const n of lm) if (!rm.has(n) && await up(`${C}/media/${n}`, await dm.media.read(n), 'm:' + n)) rm.add(n);
    for (const p of la) if (!ra.has(p) && await up(`${C}/attach/${attachKey(p)}`, await dm.attach.read(p), 'a:' + p)) ra.set(p, attachKey(p));
    for (const n of rm) if (!lm.has(n)) { await dm.media.write(n, await blobToDataUrl(await Cloud.storage.download(`${C}/media/${n}`))); lm.add(n); got++; }
    for (const [p, k] of ra) if (!la.has(p)) { await dm.attach.write(p, await blobToDataUrl(await Cloud.storage.download(`${C}/attach/${k}`))); la.add(p); got++; }
    link.media = [...[...lm].filter(n => rm.has(n)).map(n => 'm:' + n), ...[...la].filter(p => ra.has(p)).map(p => 'a:' + p)];
    link.tooBig = [...tooBig].filter(l => l.startsWith('m:') ? lm.has(l.slice(2)) : la.has(l.slice(2)));
    if (big.length) toast(`Too big to sync (over 10 MB), so only on this device: ${big.join(', ')}`, 'err');
    return got;
  }

  // ---------- Linking ----------
  async function start() {
    const u = Cloud.user(), name = (await dm.campaigns.list()).currentName;
    const id = Cloud.uid();
    await Cloud.rpc('dmdesk_save_campaign', { p_id: id, p_name: name });
    link = { cloudId: id, user: u.id, email: u.email, name, since: 0, files: {}, media: [], base: null };
    await save();
    toast('Uploading this campaign…');
    await syncNow();
    if (!lastError) toast('This campaign now syncs');
  }
  async function moveHere() {
    if (!await U.confirm('Sync with this account', `Start syncing this campaign with ${Cloud.user().email} instead? It stops syncing with the other account.`)) return;
    link = null;
    await dm.cloud.save(null);
    await start();
  }
  async function stop(remove) {
    if (remove) {
      if (!await U.confirm('Delete from the cloud', 'Delete this campaign\'s cloud copy, with its images? Every device keeps its own copy, but they stop syncing.')) return;
      try {
        const C = link.cloudId;
        const names = [...(await Cloud.storage.list(`${C}/media`)).map(n => `${C}/media/${n}`), ...(await Cloud.storage.list(`${C}/attach`)).map(n => `${C}/attach/${n}`)];
        if (names.length) await Cloud.storage.remove(names);
        await Cloud.rpc('dmdesk_delete_campaign', { p_id: C });
      } catch (e) { return toast(e.message, 'err'); }
    }
    link = null;
    await dm.cloud.save(null);
    toast(remove ? 'Deleted from the cloud' : 'This campaign no longer syncs');
    drawCard();
  }
  // A campaign that's in the cloud but not on this device: make a new local campaign and fill it from the cloud.
  async function getHere(c) {
    const have = (await dm.campaigns.list()).campaigns.map(x => x.name.toLowerCase());
    let name = c.name || 'Campaign', i = 2;
    while (have.includes(name.toLowerCase())) name = `${c.name} ${i++}`;
    localStorage.setItem(PENDING, JSON.stringify({ cloudId: c.id, user: Cloud.user().id }));
    const ok = await Campaigns.switchTo(() => dm.campaigns.create(name, false, false));
    if (!ok) localStorage.removeItem(PENDING);
  }

  // ---------- Settings card ----------
  function card() { cardEl = h('div.card.cloud-card'); drawCard(); return cardEl; }
  async function drawCard() {
    if (!cardEl || !cardEl.isConnected) return;
    const u = Cloud.user();
    cardEl.innerHTML = '';
    cardEl.append(h('h3', '☁ Cloud sync'));
    if (!u) {
      const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'username' });
      const pass = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
      const go = async (fn) => {
        if (!email.value.trim() || !pass.value) return toast('Enter your email and a password', 'err');
        try { await fn(email.value.trim(), pass.value); toast('Signed in'); } catch (e) { toast(e.message, 'err'); }
      };
      cardEl.append(h('p', 'Keep campaigns in step between this app on your computer and on your phone. Notes, the party, initiative, handouts, maps and images all sync.'),
        h('p.dim', 'It uses a Pawmodoro account, the same one Beef\'s Brewhouse uses. Make one here if you don\'t have one.'),
        h('div.cloud-signin', email, pass, h('div.row', h('button.primary', { onclick: () => go(Cloud.signIn) }, 'Sign in'), h('button', { onclick: () => go(Cloud.signUp) }, 'Create account'))));
      return;
    }
    cardEl.append(h('p', 'Signed in as ', h('b', u.email), ' ', h('button.small', { onclick: () => { Cloud.signOut(); } }, 'Sign out')));
    if (link && link.user !== u.id) {
      cardEl.append(h('p', '⚠ This campaign syncs with ', link.email ? h('b', link.email) : 'a different account', ', so it isn\'t syncing now. Sign in with that account to carry on, or move it to this one.'),
        h('p.dim', 'Moving makes a fresh cloud copy in this account from what\'s on this device. The other account\'s copy stays as it was.'),
        h('div.row', h('button', { onclick: () => moveHere().catch(e => toast(e.message, 'err')) }, '☁ Sync with this account instead')));
    }
    if (linked()) {
      const when = link.lastSync ? new Date(link.lastSync).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : null;
      cardEl.append(
        h('p', running ? '↻ Syncing…' : lastError ? h('span.err-text', '⚠ ', lastError) : when ? `✓ This campaign syncs. Last synced ${when}.` : '✓ This campaign syncs.'),
        h('div.row', h('button', { onclick: () => syncNow(), disabled: !!running }, '↻ Sync now'),
          h('button', { onclick: () => stop(false) }, 'Stop syncing'), h('button.danger', { onclick: () => stop(true) }, 'Delete cloud copy')));
    } else if (!link) {
      cardEl.append(h('p.dim', 'This campaign is only on this device.'), h('button.primary', { onclick: () => start().catch(e => toast(e.message, 'err')) }, '☁ Sync this campaign'));
    }
    const list = h('div.cloud-list', h('p.dim.small', 'Loading your cloud campaigns…'));
    cardEl.append(h('h4', 'In your cloud'), list);
    try {
      const all = await Cloud.rpc('dmdesk_campaigns_list');
      list.innerHTML = '';
      const others = all.filter(c => !(linked() && c.id === link.cloudId) && c.id !== Library.CLOUD_ID);
      if (!others.length) list.append(h('p.dim.small', linked() ? 'No other campaigns.' : 'Nothing yet.'));
      others.forEach(c => list.append(h('div.row', h('span.grow', h('b', c.name), h('span.dim.small', ` · ${c.notes} note${c.notes === 1 ? '' : 's'}`)),
        h('button.small', { onclick: () => getHere(c) }, '⬇ Get it on this device'))));
    } catch (e) { list.innerHTML = ''; list.append(h('p.dim.small', e.message)); }
  }

  return { init, card, syncNow, isLinked: linked, hash, merge };
})();
