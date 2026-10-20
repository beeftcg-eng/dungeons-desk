// Online tables: players join over the internet with a link instead of the same Wi-Fi. Works in the desktop app
// and the phone app, signed in with the cloud sync account. The cloud side is Pawmodoro's dmdesk_table_* functions.
// - publish(pub) gets what publishToPlayers() sends the LAN server. Each player's view is made by the same
//   shared/view-for.js the LAN server uses, so an online phone gets exactly what a phone at the table would.
//   Image URLs (/media/…, /wiki-img/…) are pointed at the public `dmdesk-table` bucket, and the images go up there.
// - A poll every 1.5 seconds reads who's there and the players' actions, which are checked like server.js does
//   and handed to Maps.playerAction / Sheets.playerAction, the same as LAN ones.
// The table's code is kept on this device (dd.table), so the table reopens with the same link when the app starts
// again. Closing it deletes it, with its images.
window.Online = (() => {
  const { h, toast } = U;
  const KEY = 'dd.table', PLAY = 'https://beeftcg-eng.github.io/dungeons-desk/play/', MAX_IMAGE = 10 * 1024 * 1024;
  let code = null, pub = null, members = [], since = 0, lastError = null, pushTimer = null, pollTimer = null, pushing = null, pushAgain = false;
  const sent = new Map(), uploaded = new Set(), tooBig = new Set(), lastAct = new Map();
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch { /* a listener's problem */ } });
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const link = () => code ? `${PLAY}?t=${code}` : null;
  const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function dataUrlToBlob(u) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(u), raw = atob(m[2]), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }

  async function init() {
    const s = saved(), u = Cloud.user();
    if (s && u && s.user === u.id && s.campaign === (await dm.campaigns.list()).currentName) open(s.code).catch(e => { lastError = e.message; changed(); });
    Cloud.onChange((user) => { if (!user && code) { stopLoops(); code = null; changed(); } });
  }

  // ---------- Opening and closing ----------
  async function open(reuse) {
    const name = (await dm.campaigns.list()).currentName;
    const c = await Cloud.rpc('dmdesk_table_open', { p_code: reuse || null, p_name: name });
    if (c !== code) { sent.clear(); uploaded.clear(); since = 0; }
    code = c;
    localStorage.setItem(KEY, JSON.stringify({ code, campaign: name, user: Cloud.user().id }));
    lastError = null;
    changed();
    tidy().catch(() => {});
    publishToPlayers();
    poll();
  }
  async function close() {
    if (!code) return;
    const c = code;
    stopLoops();
    code = null;
    localStorage.removeItem(KEY);
    changed();
    try { await removeImages(c); await Cloud.rpc('dmdesk_table_close', { p_code: c }); } catch (e) { toast(e.message, 'err'); }
  }
  async function newLink() {
    const old = code;
    stopLoops();
    code = null;
    await open(null);
    if (old) { removeImages(old).catch(() => {}); Cloud.rpc('dmdesk_table_close', { p_code: old }).catch(() => {}); }
  }
  function stopLoops() { clearTimeout(pollTimer); clearTimeout(pushTimer); members = []; }
  async function removeImages(c) {
    const names = [];
    for (const dir of ['m', 'w']) (await Cloud.tableStorage.list(`${c}/${dir}`)).forEach(n => names.push(`${c}/${dir}/${n}`));
    if (names.length) await Cloud.tableStorage.remove(names);
  }
  // Images of tables that are gone (closed elsewhere, or the oldest of more than three).
  async function tidy() {
    const open = new Set(await Cloud.rpc('dmdesk_table_list'));
    for (const c of await Cloud.tableStorage.list('', { folders: true })) if (!open.has(c)) await removeImages(c);
  }

  // ---------- Publishing ----------
  function publish(p) {
    pub = p;
    if (!code) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 300);
  }
  function push() {
    if (pushing) { pushAgain = true; return pushing; }
    pushing = pushNow().catch(e => { lastError = e.message; if (e.code !== 'offline') console.warn('Online table:', e); changed(); clearTimeout(pushTimer); pushTimer = setTimeout(push, 5000); })
      .finally(() => { pushing = null; if (pushAgain) { pushAgain = false; push(); } });
    return pushing;
  }
  async function pushNow() {
    if (!code || !pub) return;
    const c = code, need = new Map();
    // One view per party member and per player who joined with another name, plus '' for choosing a character.
    const names = new Map([['', null]]);
    (pub.party || []).forEach(n => names.set(n.toLowerCase(), n));
    members.forEach(m => { if (!names.has(m.player)) names.set(m.player, m.name); });
    const views = {};
    // Animated maps stay on the LAN: online phones get the map's still picture (videos are far over the bucket's limit).
    const still = pub.map && pub.map.video ? { ...pub, map: { ...pub.map, video: null } } : pub;
    for (const [key, name] of names) {
      const json = JSON.stringify(viewFor(still, { player: name }))
        .replace(/"\/media\/([^"\\]+)"/g, (_, enc) => {
          const file = decodeURIComponent(enc), rest = `${c}/m/${file}`;
          need.set(rest, () => dm.media.read(file));
          return JSON.stringify(Cloud.tableStorage.publicUrl(rest));
        })
        .replace(/\/wiki-img\/([^"\\]+)/g, (_, enc) => {
          const rel = enc.split('/').map(decodeURIComponent).join('/'), rest = `${c}/w/${b64url(rel)}${(/\.[a-z0-9]+$/i.exec(rel) || [''])[0].toLowerCase()}`;
          need.set(rest, () => dm.attach.read(rel));
          return Cloud.tableStorage.publicUrl(rest);
        });
      if (sent.get(key) !== json) views[key] = json;
    }
    // Images first, so a phone never gets a view whose pictures aren't there yet.
    for (const [rest, read] of need) {
      if (uploaded.has(rest) || tooBig.has(rest)) continue;
      const data = await read().catch(() => null);
      if (!data) continue;
      const blob = dataUrlToBlob(data);
      if (blob.size > MAX_IMAGE) { tooBig.add(rest); toast(`${rest.split('/').pop()} is too big for an online table (over 10 MB), so players don't see it`, 'err'); continue; }
      await Cloud.tableStorage.upload(rest, blob);
      uploaded.add(rest);
    }
    const keep = [...names.keys()];
    if (!Object.keys(views).length && keep.length === sent.size) return;
    await Cloud.rpc('dmdesk_table_publish', { p_code: c, p_views: Object.fromEntries(Object.entries(views).map(([k, j]) => [k, JSON.parse(j)])), p_keep: keep });
    if (c !== code) return;
    for (const k of [...sent.keys()]) if (!names.has(k)) sent.delete(k);
    Object.entries(views).forEach(([k, j]) => sent.set(k, j));
    if (lastError) { lastError = null; changed(); }
  }

  // ---------- Who's there, and what they did ----------
  async function poll() {
    clearTimeout(pollTimer);
    if (!code) return;
    const c = code;
    try {
      const r = await Cloud.rpc('dmdesk_table_poll', { p_code: c, p_since: since });
      if (c !== code) return;
      if (!r.exists) { code = null; localStorage.removeItem(KEY); toast('The online table was closed', 'err'); changed(); return; }
      const before = members.map(m => m.player).join();
      members = r.members.map(m => ({ player: m.player, name: m.name, online: m.seen < 40 }));
      if (members.map(m => m.player).join() !== before) push();
      for (const a of r.actions) { since = a.id; await handle(a).catch(e => console.warn('Online table action:', e)); }
      if (lastError) { lastError = null; }
      changed();
    } catch (e) {
      if (lastError !== e.message) { lastError = e.message; changed(); }
    }
    if (code === c) pollTimer = setTimeout(poll, lastError ? 5000 : 1500);
  }
  // The same checks server.js makes on LAN actions; the handlers then check the rest (token owners, sheets…).
  async function handle(a) {
    const d = a.data || {}, player = String(a.player || '').trim().slice(0, 40), num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
    const tooSoon = (k, ms) => { const t = lastAct.get(k + player.toLowerCase()) || 0; if (Date.now() - t < ms) return true; lastAct.set(k + player.toLowerCase(), Date.now()); return false; };
    let x = null;
    if (!player) return;
    if (a.type === 'sheet' && d.model && typeof d.model === 'object') x = { type: 'sheet', player, model: d.model };
    else if (a.type === 'offer' && d.model && typeof d.model === 'object' && !tooSoon('offer:', 5000)) x = { type: 'offer', player, name: String(d.name || '').slice(0, 60), model: d.model };
    else if (a.type === 'share' && d.share && typeof d.share === 'object' && !tooSoon('share:', 400)) x = { type: 'share', player, share: d.share };
    else if (a.type === 'move' && num(d.x) != null && num(d.y) != null) x = { type: 'move', player, map: String(d.map || ''), token: String(d.token || ''), x: num(d.x), y: num(d.y) };
    else if (a.type === 'ping' && num(d.x) != null && num(d.y) != null && !tooSoon('ping:', 1000)) x = { type: 'ping', player, map: String(d.map || ''), x: num(d.x), y: num(d.y) };
    else if (a.type === 'token' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(d.dataUrl || ''))) {
      x = { type: 'token', player, file: await dm.media.save(d.dataUrl, 'pctoken-' + player.toLowerCase().replace(/[^a-z0-9]+/g, '-')) };
    }
    if (!x) return;
    Maps.playerAction(x);
    Sheets.playerAction(x);
  }

  // ---------- The panel (Initiative → 📱 Players' phones) ----------
  let panelEl = null;
  function panel() {
    if (!panelEl) { panelEl = h('div.online-panel'); listeners.add(drawPanel); Cloud.onChange(drawPanel); }
    drawPanel();
    return panelEl;
  }
  async function drawPanel() {
    if (!panelEl) return;
    const el = panelEl, u = Cloud.user();
    el.innerHTML = '';
    el.append(h('h4', '🌐 Online table'));
    if (!u) return el.append(h('p.dim', 'Players anywhere join with a link, no shared Wi-Fi needed. Sign in under ⚙ Settings → ☁ Cloud sync to use it.'),
      h('button', { onclick: () => App.show('settings') }, '⚙ Open Settings'));
    if (!code) return el.append(h('p.dim', 'Players anywhere join with a link, no shared Wi-Fi needed. They see what phones at the table see.'),
      lastError ? h('p.err-text', '⚠ ', lastError) : null,
      h('button.primary', { onclick: () => open(saved() && saved().user === u.id ? saved().code : null).catch(e => { lastError = e.message; changed(); }) }, '🌐 Open an online table'));
    const url = link(), here = members.filter(m => m.online);
    const qr = dm.server.qr ? await dm.server.qr(url).catch(() => null) : null;
    if (el !== panelEl || url !== link()) return;
    el.append(h('p', 'Players open this link (or scan it):'),
      qr ? h('img.qr', { src: qr }) : null,
      h('div.url-list', h('code', { onclick: () => U.copy(url), title: 'Click to copy' }, url)),
      h('div.row', h('button', { onclick: () => U.copy(url) }, '📋 Copy link'),
        navigator.share && dm.isWeb ? h('button', { onclick: () => navigator.share({ title: 'Join the game', url }).catch(() => {}) }, '📤 Share') : null,
        h('button.small', { title: 'A new link: the old one stops working', onclick: async () => { if (await U.confirm('New link?', 'The old link stops working, and players have to open the new one.')) newLink().catch(e => toast(e.message, 'err')); } }, 'New link'),
        h('button.small.danger', { onclick: async () => { if (await U.confirm('Close the online table?', 'Players\' phones stop updating and the link stops working. Opening a table again makes a new link.')) close(); } }, 'Close')),
      lastError ? h('p.err-text', '⚠ ', lastError) : null,
      h('h4', `Online (${here.length})`),
      members.length ? h('div.player-list', members.map(m => h('div', h('span.dot' + (m.online ? '.on' : '')), ' ', m.name))) : h('p.dim', 'Nobody yet.'),
      h('p.hint', 'The link is the key: share it only with your players. Images players see are uploaded while the table is open, and removed when you close it.'));
  }

  return { init, publish, panel, isOpen: () => !!code, link, open, close };
})();
