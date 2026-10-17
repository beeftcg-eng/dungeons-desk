// The phone app's window.dm: the same surface preload.js gives the Electron renderer, kept in the browser's IndexedDB
// instead of a vault folder. Each campaign is a set of rows keyed by its id; the open one is localStorage 'web.campaign'.
// Things a browser can't do (host the players' LAN server, open folders, auto-update) answer harmlessly.
(() => {
  if (window.dm) return;
  const DB_NAME = 'dungeons-desk', SNAPSHOT_EVERY = 10 * 60 * 1000, SNAPSHOTS_KEPT = 60;
  const VERSION = document.documentElement.dataset.version || '';
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
  const CAMPAIGN_FOLDERS = ['NPCs', 'Party', 'Bestiary', 'Encounters', 'Locations', 'Lore', 'Factions', 'Sessions'];

  // ---------- IndexedDB ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      d.createObjectStore('campaigns', { keyPath: 'id' });
      d.createObjectStore('notes', { keyPath: ['cid', 'path'] });
      d.createObjectStore('blobs', { keyPath: ['cid', 'kind', 'name'] }); // kind: media (.dmtools/media, by file name) | attach (note images, by vault path)
      d.createObjectStore('history', { keyPath: ['cid', 'path', 'ts'] });
      d.createObjectStore('state', { keyPath: 'cid' });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  }));
  const done = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  async function tx(stores, mode, fn) {
    const t = (await db()).transaction(stores, mode);
    const out = fn(...[].concat(stores).map(s => t.objectStore(s)));
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage full?')); });
    return out;
  }
  const get = (store, key) => db().then(d => done(d.transaction(store).objectStore(store).get(key)));
  const all = (store, range) => db().then(d => done(d.transaction(store).objectStore(store).getAll(range)));
  const put = (store, val) => tx(store, 'readwrite', s => { s.put(val); });
  const del = (store, key) => tx(store, 'readwrite', s => { s.delete(key); });
  const inCampaign = (cid) => IDBKeyRange.bound([cid], [cid, []]);

  // ---------- Campaigns ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let cid = localStorage.getItem('web.campaign');
  const campaign = () => get('campaigns', cid);
  async function touch(c) { c.lastOpened = Date.now(); await put('campaigns', c); }
  async function makeCampaign(name, { examples = false, guide = true } = {}) {
    const c = { id: uid(), name, created: Date.now(), lastOpened: Date.now(), folders: [...CAMPAIGN_FOLDERS] };
    await put('campaigns', c);
    await put('notes', { cid: c.id, path: `${fileName(name)}.md`, content: overviewNote(name), mtime: Date.now() });
    if (examples) await seed(c.id, 'examples');
    if (guide) await seed(c.id, 'guide');
    return c;
  }
  async function useCampaign(id) { cid = id; localStorage.setItem('web.campaign', id); const c = await campaign(); if (c) await touch(c); }
  // First run: a campaign with the guide and the examples, like the desktop app's first vault.
  const ready = (async () => {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (cid && await campaign()) return;
    const list = await all('campaigns');
    if (list.length) return useCampaign(list.sort((a, b) => b.lastOpened - a.lastOpened)[0].id);
    const c = await makeCampaign('My Campaign', { examples: true, guide: true });
    await useCampaign(c.id);
  })().then(loadUrls);

  const fileName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();
  function safe(rel) {
    const parts = [];
    for (const p of String(rel).replace(/\\/g, '/').split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') throw new Error('Path escapes vault: ' + rel);
      parts.push(p);
    }
    return parts.join('/');
  }

  // Seed notes ship next to the page as seed.json ({ examples: {path: text}, guide: {…} }).
  let seedData = null;
  async function seed(id, part) {
    seedData = seedData || await fetch('seed.json').then(r => r.json()).catch(() => ({}));
    const files = seedData[part] || {};
    let added = 0;
    const have = new Set((await all('notes', inCampaign(id))).map(n => n.path));
    for (const [path, content] of Object.entries(files)) {
      if (have.has(path)) continue;
      await put('notes', { cid: id, path, content, mtime: Date.now() });
      added++;
    }
    return added;
  }

  // ---------- Images: blobs in IndexedDB, shown through object URLs ----------
  // App.mediaUrl() and the note renderer need a URL straight away, so every image's URL is made up front.
  const urls = { media: new Map(), attach: new Map() };
  async function loadUrls() {
    for (const m of Object.values(urls)) { m.forEach(u => URL.revokeObjectURL(u)); m.clear(); }
    for (const b of await all('blobs', inCampaign(cid))) urls[b.kind].set(b.name, URL.createObjectURL(b.blob));
  }
  // Decoded by hand: fetch() of a data: URL is blocked by the page's CSP (connect-src).
  function toBlob(dataUrl) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error('Not an image');
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }
  const toDataUrl = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  async function saveBlob(kind, name, dataUrl) {
    const blob = toBlob(dataUrl);
    await put('blobs', { cid, kind, name, blob });
    const old = urls[kind].get(name); if (old) URL.revokeObjectURL(old);
    urls[kind].set(name, URL.createObjectURL(blob));
  }

  // ---------- Note history (same rules as main.js) ----------
  async function snapshots(rel) {
    const rows = await db().then(d => done(d.transaction('history').objectStore('history').getAllKeys(IDBKeyRange.bound([cid, rel, 0], [cid, rel, Infinity]))));
    return rows.map(k => k[2]).sort((a, b) => b - a);
  }
  async function snapshot(rel, { force = false } = {}) {
    const cur = await get('notes', [cid, rel]);
    if (!cur || !cur.content.trim()) return;
    const list = await snapshots(rel);
    if (!force && list[0] && Date.now() - list[0] < SNAPSHOT_EVERY) return;
    if (list[0]) { const last = await get('history', [cid, rel, list[0]]); if (last && last.content === cur.content) return; }
    await tx('history', 'readwrite', s => {
      s.put({ cid, path: rel, ts: Date.now(), content: cur.content });
      list.slice(SNAPSHOTS_KEPT - 1).forEach(ts => s.delete([cid, rel, ts]));
    });
  }

  // ---------- Campaign files (shared with the desktop app's 🗺 → Export / Import) ----------
  async function exportCampaign(id = cid) {
    const c = await get('campaigns', id);
    const notes = {}, media = {}, attachments = {};
    for (const n of await all('notes', inCampaign(id))) notes[n.path] = n.content;
    for (const b of await all('blobs', inCampaign(id))) (b.kind === 'media' ? media : attachments)[b.name] = await toDataUrl(b.blob);
    const st = await get('state', id);
    const data = { format: 'dungeons-desk-campaign', version: 1, name: c.name, exported: new Date().toISOString(), folders: c.folders || [], notes, state: st ? st.data : {}, media, attachments };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${fileName(c.name) || 'Campaign'}.ddcampaign.json`);
    c.exported = Date.now();
    await put('campaigns', c);
    return true;
  }
  async function importCampaign(data) {
    if (!data || data.format !== 'dungeons-desk-campaign') throw new Error('That isn\'t a Dungeons Desk campaign file.');
    const have = new Set((await all('campaigns')).map(c => c.name));
    let name = fileName(data.name) || 'Imported campaign', i = 2;
    while (have.has(name)) name = `${fileName(data.name) || 'Imported campaign'} ${i++}`;
    const c = { id: uid(), name, created: Date.now(), lastOpened: Date.now(), folders: (data.folders || []).map(f => { try { return safe(f); } catch { return ''; } }).filter(Boolean) };
    const tryPath = (p) => { try { return safe(p); } catch { return null; } };
    const notes = Object.entries(data.notes || {}).map(([p, content]) => ({ cid: c.id, path: tryPath(p), content: String(content), mtime: Date.now() })).filter(n => n.path && /\.md$/i.test(n.path));
    const blobs = [
      ...Object.entries(data.media || {}).filter(([, u]) => /^data:image\//.test(u)).map(([n, u]) => ({ cid: c.id, kind: 'media', name: String(n).split('/').pop(), blob: toBlob(u) })),
      ...Object.entries(data.attachments || {}).map(([p, u]) => [tryPath(p), u]).filter(([p, u]) => p && IMAGE_EXT.test(p) && /^data:image\//.test(u)).map(([p, u]) => ({ cid: c.id, kind: 'attach', name: p, blob: toBlob(u) })),
    ];
    // One transaction, so a failed import leaves nothing half-made behind.
    await tx(['campaigns', 'notes', 'blobs', 'state'], 'readwrite', (cs, ns, bs, ss) => {
      cs.put(c); notes.forEach(n => ns.put(n)); blobs.forEach(b => bs.put(b));
      ss.put({ cid: c.id, data: data.state && typeof data.state === 'object' ? data.state : {} });
    });
    return c.id;
  }
  const pickFile = (accept) => new Promise((res) => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept });
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
  function download(blob, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // ---------- Printing: an invisible frame and the browser's print sheet (which also offers Save as PDF) ----------
  function printHtml(html) {
    return new Promise((res) => {
      const f = Object.assign(document.createElement('iframe'), { style: 'position:fixed;width:0;height:0;border:0;right:0;bottom:0' });
      f.srcdoc = html;
      f.onload = () => setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 60000); res(true); } }, 400);
      document.body.append(f);
    });
  }

  const overviewNote = (name) => `---
type: campaign
tags: [campaign]
setting:
started: ${new Date().toISOString().slice(0, 10)}
---
# ${name}

> [!quote] The pitch
> One or two sentences you'd say to sell this campaign to your players.

## Themes & Tone
-

## The Party
- [[ ]]

## Starting Location
[[ ]]

## Major Factions
- [[ ]]

## The Big Threat
> [!secret] DM Only
> What's really going on.

## Session Zero
- **Safety tools:**
- **House rules:**
- **Character creation:**

## Session Log
- [[Session 1]]
`;

  // When this campaign last changed, for the backup reminder (kept out of IndexedDB so saving stays one write).
  const changed = () => { try { localStorage.setItem('dd.changed.' + cid, Date.now()); } catch { /* storage full or blocked */ } };

  const r = (fn) => async (...a) => { await ready; return fn(...a); };
  const noop = () => {};
  window.dm = {
    isWeb: true,
    // Synchronous image URLs for App.mediaUrl() and note images (made when the campaign loads).
    mediaUrl: (file) => urls.media.get(String(file).split('/').pop()) || '',
    vaultUrl: (rel) => urls.attach.get(String(rel)) || '',
    vault: {
      get: r(async () => (await campaign()).name),
      reveal: noop,
      addSeed: r((part) => ['guide', 'examples'].includes(part) ? seed(cid, part) : 0),
    },
    campaigns: {
      list: r(async () => {
        const list = (await all('campaigns')).sort((a, b) => b.lastOpened - a.lastOpened);
        const cur = list.find(c => c.id === cid);
        return { current: cid, currentName: cur ? cur.name : '', defaultDir: '', campaigns: list.map(c => ({ path: c.id, name: c.name, lastOpened: c.lastOpened, exists: true, current: c.id === cid })) };
      }),
      create: r(async (name, withExamples, withGuide = true) => {
        const clean = fileName(name);
        if (!clean) throw new Error('Give the campaign a name.');
        if ((await all('campaigns')).some(c => c.name.toLowerCase() === clean.toLowerCase())) throw new Error(`A campaign called “${clean}” already exists.`);
        const c = await makeCampaign(clean, { examples: !!withExamples, guide: !!withGuide });
        await useCampaign(c.id);
        return c.id;
      }),
      open: r(async (id) => { if (!await get('campaigns', id)) throw new Error('That campaign no longer exists.'); await useCampaign(id); return id; }),
      browse: async () => null, // no folders to open on a phone: Import a campaign file instead
      // On the phone there's no folder to keep, so forgetting a campaign deletes it.
      forget: r(async (id) => {
        if (id === cid) return false;
        await tx(['campaigns', 'notes', 'blobs', 'history', 'state'], 'readwrite', (c, n, b, h, s) => { c.delete(id); n.delete(inCampaign(id)); b.delete(inCampaign(id)); h.delete(inCampaign(id)); s.delete(id); });
        return true;
      }),
      rename: r(async (id, name) => { const c = await get('campaigns', id); if (c) { c.name = String(name).trim(); await put('campaigns', c); } return true; }),
      reveal: noop,
      exportFile: r((id) => exportCampaign(id || cid)),
      backupInfo: r(async () => { const c = await campaign(); return { created: c.created, exported: c.exported || null, changed: Number(localStorage.getItem('dd.changed.' + cid)) || null }; }),
      importFile: r(async () => {
        const f = await pickFile('.json,application/json');
        if (!f) return null;
        let data; try { data = JSON.parse(await f.text()); } catch { throw new Error('That file couldn\'t be read.'); }
        const id = await importCampaign(data);
        await useCampaign(id);
        return id;
      }),
    },
    tokens: {
      exportFiles: r(async (items) => {
        const used = new Set();
        for (const it of items) {
          const row = await get('blobs', [cid, 'media', String(it.file).split('/').pop()]);
          if (!row) continue;
          const base = (fileName(it.name) || 'token').replace(/\s+/g, '_');
          let name = base + '.png', i = 2;
          while (used.has(name)) name = `${base}_${i++}.png`;
          used.add(name);
          download(row.blob, name);
          await new Promise(res => setTimeout(res, 250)); // browsers drop downloads fired all at once
        }
        return 'your Downloads';
      }),
    },
    history: {
      list: r(async (rel) => { const out = []; for (const ts of await snapshots(rel)) { const v = await get('history', [cid, rel, ts]); out.push({ ts, size: v ? v.content.length : 0 }); } return out; }),
      read: r(async (rel, ts) => { const v = await get('history', [cid, rel, Number(ts)]); if (!v) throw new Error('Version not found'); return v.content; }),
      snapshot: r(async (rel) => { await snapshot(safe(rel), { force: true }); return true; }),
    },
    backup: {
      now: r(() => exportCampaign()),
      info: r(async () => ({ web: true, dir: '', last: null, count: 0, latest: null })),
      reveal: noop,
    },
    attach: {
      save: r(async (dataUrl, name) => {
        const m = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp);base64,/.exec(dataUrl);
        if (!m) throw new Error('That file type is not a supported image.');
        const ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[m[1]] || m[1];
        const base = (String(name || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'image').slice(0, 60);
        let file = `${base}.${ext}`, i = 2;
        while (urls.attach.has('Attachments/' + file)) file = `${base} ${i++}.${ext}`;
        await saveBlob('attach', 'Attachments/' + file, dataUrl);
        return 'Attachments/' + file;
      }),
      list: r(async () => [...urls.attach.keys()]),
    },
    notes: {
      list: r(async () => {
        const rows = await all('notes', inCampaign(cid)), c = await campaign();
        const folders = new Set((c.folders || []).flatMap(f => f.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))));
        const addParents = (p) => { const parts = p.split('/'); parts.slice(0, -1).forEach((_, j) => folders.add(parts.slice(0, j + 1).join('/'))); };
        [...urls.attach.keys()].forEach(addParents);
        const notes = rows.map(n => {
          const i = n.path.lastIndexOf('/'), folder = i < 0 ? '' : n.path.slice(0, i);
          addParents(n.path);
          return { path: n.path, name: n.path.slice(i + 1).replace(/\.md$/i, ''), folder, mtime: n.mtime };
        });
        return { notes, folders: [...folders].sort() };
      }),
      readAll: r(async () => (await all('notes', inCampaign(cid))).map(n => {
        const i = n.path.lastIndexOf('/');
        return { path: n.path, name: n.path.slice(i + 1).replace(/\.md$/i, ''), folder: i < 0 ? '' : n.path.slice(0, i), mtime: n.mtime, content: n.content };
      })),
      read: r(async (rel) => { const n = await get('notes', [cid, safe(rel)]); if (!n) throw new Error('ENOENT: no such note ' + rel); return n.content; }),
      write: r(async (rel, content) => { rel = safe(rel); await snapshot(rel); await put('notes', { cid, path: rel, content: String(content), mtime: Date.now() }); changed(); return true; }),
      exists: r(async (rel) => !!(await get('notes', [cid, safe(rel)]))),
      delete: r(async (rel) => { rel = safe(rel); await snapshot(rel, { force: true }); await del('notes', [cid, rel]); return true; }),
      rename: r(async (from, to) => {
        from = safe(from); to = safe(to);
        if (await get('notes', [cid, to])) throw new Error('A note with that name already exists.');
        const n = await get('notes', [cid, from]);
        if (!n) throw new Error('Note not found');
        const hist = await all('history', IDBKeyRange.bound([cid, from, 0], [cid, from, Infinity]));
        await tx(['notes', 'history'], 'readwrite', (ns, hs) => {
          ns.delete([cid, from]); ns.put({ ...n, path: to, mtime: Date.now() });
          hist.forEach(v => { hs.delete([cid, from, v.ts]); hs.put({ ...v, path: to }); });
        });
        return true;
      }),
      mkdir: r(async (rel) => { rel = safe(rel); const c = await campaign(); c.folders = [...new Set([...(c.folders || []), rel])]; await put('campaigns', c); return true; }),
    },
    state: {
      load: r(async () => { const s = await get('state', cid); return s ? s.data : {}; }),
      save: r(async (state) => { await put('state', { cid, data: JSON.parse(JSON.stringify(state)) }); changed(); return true; }),
    },
    media: {
      save: r(async (dataUrl, hint = 'image') => {
        const m = /^data:image\/(png|jpe?g|gif|webp);base64,/.exec(dataUrl);
        if (!m) throw new Error('Unsupported image');
        const name = `${String(hint).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'img'}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
        await saveBlob('media', name, dataUrl);
        return name;
      }),
    },
    file: { savePng: async (dataUrl, defaultName) => { download(toBlob(dataUrl), defaultName || 'image.png'); return defaultName || 'image.png'; } },
    print: { html: (html, mode) => printHtml(html).then(() => mode === 'pdf' ? null : true) }, // Save as PDF is in the print sheet
    // Players' phones connect to the desktop app's LAN server; the phone app has none.
    server: {
      info: async () => ({ web: true, port: 0, urls: [], qr: null, code: '', players: [] }),
      publish: async () => true,
      openDisplay: noop,
      newCode: async () => '',
      onPlayers: noop,
    },
    openExternal: async (url) => { if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
    web: {
      open5e: async (pathAndQuery) => {
        if (!/^\/v1\/[a-z]+\/(\?[\w=&%.+,-]*)?$/.test(pathAndQuery)) throw new Error('Unsupported request');
        const res = await fetch('https://api.open5e.com' + pathAndQuery, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Open5e returned ${res.status}`);
        return res.json();
      },
    },
    update: {
      info: async () => ({ web: true, version: VERSION, packaged: false, platform: 'phone app', canUpdate: false, status: null, releasesUrl: 'https://github.com/beeftcg-eng/dungeons-desk/releases' }),
      check: noop, download: noop, install: noop, onStatus: noop,
    },
    onPlayerAction: noop,
  };
})();
