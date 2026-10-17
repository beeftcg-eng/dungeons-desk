// Dungeons Desk — Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { PlayerServer } = require('./server');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
// Use the OS "Documents" folder (on Windows it may be redirected, e.g. to OneDrive).
const docsDir = () => {
  let d = null;
  try { d = app.getPath('documents'); } catch { /* not available yet */ }
  // Some Linux setups have no Documents folder configured and report the home folder itself.
  return d && path.resolve(d) !== path.resolve(os.homedir()) ? d : path.join(os.homedir(), 'Documents');
};
const CAMPAIGNS_DIR = path.join(docsDir(), 'Dungeons Desk Campaigns');
const BACKUPS_DIR = path.join(docsDir(), 'Dungeons Desk Backups');
const REPO = { owner: 'beeftcg-eng', repo: 'dungeons-desk' };
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
let config = { vault: path.join(docsDir(), 'Dungeons Desk Vault'), port: 7777, campaigns: [] };
let win = null;
let server = null;

const newJoinCode = () => String(require('crypto').randomInt(0, 1_000_000)).padStart(6, '0');
function loadConfig() {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')) }; } catch { /* first run */ }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2));
}

// ---------- Vault helpers ----------
const metaDir = () => path.join(config.vault, '.dmtools');
const mediaDir = () => path.join(metaDir(), 'media');
const statePath = () => path.join(metaDir(), 'state.json');

// Create the vault's hidden folder. Sample notes (seed/examples) and the how-to guide (seed/guide) are
// only added to a brand-new folder on first run, or when a new campaign asks for them; never to an
// existing folder the user opens.
function ensureVault({ examples = false, guide = false } = {}) {
  const isNew = !fs.existsSync(config.vault);
  fs.mkdirSync(mediaDir(), { recursive: true });
  const firstRun = isNew && !config.campaigns.length;
  if (examples || firstRun) seedVault('examples');
  if (guide || firstRun) seedVault('guide');
  rememberCampaign(config.vault);
}

// ---------- Note version history (.dmtools/history/<encoded note path>/<timestamp>.md) ----------
const SNAPSHOT_EVERY = 10 * 60 * 1000; // at most one snapshot per note every 10 minutes while typing
const SNAPSHOTS_KEPT = 60;
const historyDir = (rel) => path.join(metaDir(), 'history', encodeURIComponent(rel));
function snapshots(rel) {
  try { return fs.readdirSync(historyDir(rel)).filter(f => f.endsWith('.md')).map(f => Number(f.slice(0, -3))).filter(Boolean).sort((a, b) => b - a); }
  catch { return []; }
}
// Save the note's current on-disk content as a version before it is overwritten or deleted.
function snapshot(rel, { force = false } = {}) {
  const full = safe(rel);
  if (!fs.existsSync(full)) return;
  const list = snapshots(rel);
  if (!force && list[0] && Date.now() - list[0] < SNAPSHOT_EVERY) return;
  const old = fs.readFileSync(full, 'utf8');
  if (!old.trim()) return;
  if (list[0]) { try { if (fs.readFileSync(path.join(historyDir(rel), list[0] + '.md'), 'utf8') === old) return; } catch { /* unreadable, write anew */ } }
  fs.mkdirSync(historyDir(rel), { recursive: true });
  fs.writeFileSync(path.join(historyDir(rel), Date.now() + '.md'), old);
  list.slice(SNAPSHOTS_KEPT - 1).forEach(ts => fs.rm(path.join(historyDir(rel), ts + '.md'), () => {}));
}

// ---------- Backups (~/Documents/Dungeons Desk Backups/<campaign>/<date>/) ----------
const BACKUPS_KEPT = 14;
const backupRoot = () => path.join(BACKUPS_DIR, campaignName(config.vault).replace(/[\\/:*?"<>|]/g, '') || 'Campaign');
function backupNow() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const dest = path.join(backupRoot(), stamp);
  fs.mkdirSync(dest, { recursive: true });
  const vault = path.resolve(config.vault);
  // History snapshots are already a kind of backup; leave them out to keep backups small.
  fs.cpSync(vault, dest, { recursive: true, filter: (src) => !path.resolve(src).startsWith(path.join(vault, '.dmtools', 'history')) });
  config.backups = { ...(config.backups || {}), [vault]: Date.now() };
  saveConfig();
  const all = fs.readdirSync(backupRoot()).filter(d => /^\d{4}-/.test(d)).sort().reverse();
  all.slice(BACKUPS_KEPT).forEach(d => fs.rm(path.join(backupRoot(), d), { recursive: true, force: true }, () => {}));
  return dest;
}
function autoBackup() {
  const last = (config.backups || {})[path.resolve(config.vault)] || 0;
  if (Date.now() - last > 24 * 3600 * 1000) { try { backupNow(); } catch (e) { console.error('Backup failed', e); } }
}

// ---------- Campaign list ----------
const campaignName = (dir) => {
  try { const st = JSON.parse(fs.readFileSync(path.join(dir, '.dmtools', 'campaign.json'), 'utf8')); if (st.name) return st.name; } catch { /* no name file */ }
  return path.basename(dir);
};
function rememberCampaign(dir) {
  config.campaigns = (config.campaigns || []).filter(c => path.resolve(c.path) !== path.resolve(dir));
  config.campaigns.unshift({ path: dir, lastOpened: Date.now() });
  saveConfig();
}
function campaignList() {
  return (config.campaigns || []).map(c => ({
    path: c.path, name: campaignName(c.path), lastOpened: c.lastOpened,
    exists: fs.existsSync(c.path), current: path.resolve(c.path) === path.resolve(config.vault),
  }));
}
function switchVault(dir, opts) {
  config.vault = dir;
  saveConfig();
  ensureVault(opts);
  autoBackup();
  server.setMediaDir(mediaDir());
  if (win) win.setTitle(`Dungeons Desk — ${campaignName(dir)}`);
}

const CAMPAIGN_FOLDERS = ['NPCs', 'Party', 'Bestiary', 'Encounters', 'Locations', 'Lore', 'Factions', 'Sessions'];
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

// Keep every path inside the vault.
function safe(rel) {
  const full = path.resolve(config.vault, rel);
  if (full !== path.resolve(config.vault) && !full.startsWith(path.resolve(config.vault) + path.sep)) {
    throw new Error('Path escapes vault: ' + rel);
  }
  return full;
}

function listNotes() {
  const out = [];
  const folders = [];
  const walk = (dir, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { folders.push(r); walk(path.join(dir, e.name), r); }
      else if (e.name.toLowerCase().endsWith('.md')) {
        const st = fs.statSync(path.join(dir, e.name));
        out.push({ path: r, name: e.name.replace(/\.md$/i, ''), folder: rel, mtime: st.mtimeMs });
      }
    }
  };
  walk(config.vault, '');
  listNotes.folders = folders;
  return out;
}

// Copy seed/<part> into the vault without overwriting anything. Returns how many files were added.
function seedVault(part) {
  const seed = path.join(__dirname, 'seed', part);
  let added = 0;
  const copy = (src, dst) => {
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); }
      else if (!fs.existsSync(d)) { fs.copyFileSync(s, d); added++; }
    }
  };
  if (fs.existsSync(seed)) copy(seed, config.vault);
  return added;
}

function getLanUrls() {
  const urls = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|lo)|vEthernet|VirtualBox|VMware|Hyper-V|Loopback|WSL|Tailscale|ZeroTier/i.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${server.port}/`);
    }
  }
  return urls;
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('vault:get', () => config.vault);
  ipcMain.handle('vault:addSeed', (_e, part) => (['guide', 'examples'].includes(part) ? seedVault(part) : 0));
  ipcMain.handle('campaigns:list', () => ({ current: config.vault, currentName: campaignName(config.vault), campaigns: campaignList(), defaultDir: CAMPAIGNS_DIR }));
  ipcMain.handle('campaigns:create', (_e, name, withExamples, withGuide = true) => {
    const clean = String(name || '').replace(/[\\/:*?"<>|]/g, '').trim();
    if (!clean) throw new Error('Give the campaign a name.');
    const dir = path.join(CAMPAIGNS_DIR, clean);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`A campaign folder called “${clean}” already exists.`);
    fs.mkdirSync(path.join(dir, '.dmtools', 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.dmtools', 'campaign.json'), JSON.stringify({ name: clean, created: Date.now() }, null, 2));
    CAMPAIGN_FOLDERS.forEach(f => fs.mkdirSync(path.join(dir, f), { recursive: true }));
    fs.writeFileSync(path.join(dir, `${clean}.md`), overviewNote(clean));
    switchVault(dir, { examples: !!withExamples, guide: !!withGuide });
    return dir;
  });
  ipcMain.handle('campaigns:open', (_e, dir) => {
    if (!fs.existsSync(dir)) throw new Error('That campaign folder no longer exists.');
    switchVault(dir);
    return dir;
  });
  ipcMain.handle('campaigns:browse', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open a campaign folder', defaultPath: fs.existsSync(CAMPAIGNS_DIR) ? CAMPAIGNS_DIR : os.homedir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    switchVault(r.filePaths[0]);
    return r.filePaths[0];
  });
  ipcMain.handle('campaigns:forget', (_e, dir) => {
    config.campaigns = config.campaigns.filter(c => path.resolve(c.path) !== path.resolve(dir));
    saveConfig();
    return true;
  });
  ipcMain.handle('campaigns:rename', (_e, dir, name) => {
    const meta = path.join(dir, '.dmtools');
    fs.mkdirSync(meta, { recursive: true });
    let st = {}; try { st = JSON.parse(fs.readFileSync(path.join(meta, 'campaign.json'), 'utf8')); } catch { /* new file */ }
    fs.writeFileSync(path.join(meta, 'campaign.json'), JSON.stringify({ ...st, name: String(name).trim() }, null, 2));
    if (path.resolve(dir) === path.resolve(config.vault) && win) win.setTitle(`Dungeons Desk — ${String(name).trim()}`);
    return true;
  });
  // One-file campaign export/import (.ddcampaign.json), the way campaigns move to and from the phone app.
  ipcMain.handle('campaigns:exportFile', async (_e, dir) => {
    dir = dir || config.vault;
    const name = campaignName(dir);
    const r = await dialog.showSaveDialog(win, { title: 'Export campaign', defaultPath: path.join(app.getPath('downloads'), `${name.replace(/[\\/:*?"<>|]/g, '') || 'Campaign'}.ddcampaign.json`), filters: [{ name: 'Dungeons Desk campaign', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    const data = { format: 'dungeons-desk-campaign', version: 1, name, exported: new Date().toISOString(), folders: [], notes: {}, state: {}, media: {}, attachments: {} };
    const mime = (f) => ({ jpg: 'jpeg', svg: 'svg+xml' }[path.extname(f).slice(1).toLowerCase()] || path.extname(f).slice(1).toLowerCase());
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const r2 = rel ? rel + '/' + e.name : e.name, full = path.join(d, e.name);
        if (e.isDirectory()) { data.folders.push(r2); walk(full, r2); }
        else if (/\.md$/i.test(e.name)) data.notes[r2] = fs.readFileSync(full, 'utf8');
        else if (IMAGE_EXT.test(e.name)) data.attachments[r2] = `data:image/${mime(e.name)};base64,${fs.readFileSync(full).toString('base64')}`;
      }
    };
    walk(dir, '');
    try { data.state = JSON.parse(fs.readFileSync(path.join(dir, '.dmtools', 'state.json'), 'utf8')); } catch { /* no state yet */ }
    const media = path.join(dir, '.dmtools', 'media');
    if (fs.existsSync(media)) for (const f of fs.readdirSync(media)) if (/\.(png|jpe?g|gif|webp)$/i.test(f)) data.media[f] = `data:image/${mime(f)};base64,${fs.readFileSync(path.join(media, f)).toString('base64')}`;
    fs.writeFileSync(r.filePath, JSON.stringify(data));
    return r.filePath;
  });
  ipcMain.handle('campaigns:importFile', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import a campaign file', properties: ['openFile'], filters: [{ name: 'Dungeons Desk campaign', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    let data;
    try { data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { throw new Error('That file couldn\'t be read.'); }
    if (!data || data.format !== 'dungeons-desk-campaign') throw new Error('That isn\'t a Dungeons Desk campaign file.');
    const base = String(data.name || '').replace(/[\\/:*?"<>|]/g, '').trim() || 'Imported campaign';
    let clean = base, i = 2;
    while (fs.existsSync(path.join(CAMPAIGNS_DIR, clean)) && fs.readdirSync(path.join(CAMPAIGNS_DIR, clean)).length) clean = `${base} ${i++}`;
    const dir = path.join(CAMPAIGNS_DIR, clean);
    // Every path stays inside the new folder, the same check safe() makes for the open vault.
    const inside = (rel) => { const full = path.resolve(dir, String(rel)); if (!full.startsWith(path.resolve(dir) + path.sep)) throw new Error('Bad path in campaign file: ' + rel); return full; };
    const dataUrl = (u) => { const m = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(String(u)); return m ? Buffer.from(m[1], 'base64') : null; };
    fs.mkdirSync(path.join(dir, '.dmtools', 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.dmtools', 'campaign.json'), JSON.stringify({ name: clean, created: Date.now() }, null, 2));
    for (const f of data.folders || []) fs.mkdirSync(inside(f), { recursive: true });
    for (const [rel, text] of Object.entries(data.notes || {})) { if (!/\.md$/i.test(rel)) continue; const full = inside(rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, String(text)); }
    for (const [rel, u] of Object.entries(data.attachments || {})) { const buf = dataUrl(u); if (!buf || !IMAGE_EXT.test(rel)) continue; const full = inside(rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, buf); }
    for (const [f, u] of Object.entries(data.media || {})) { const buf = dataUrl(u); if (buf && /\.(png|jpe?g|gif|webp)$/i.test(f)) fs.writeFileSync(path.join(dir, '.dmtools', 'media', path.basename(f)), buf); }
    if (data.state && typeof data.state === 'object') fs.writeFileSync(path.join(dir, '.dmtools', 'state.json'), JSON.stringify(data.state, null, 2));
    switchVault(dir);
    return dir;
  });
  ipcMain.handle('campaigns:reveal', (_e, dir) => shell.openPath(dir || config.vault));
  ipcMain.handle('vault:reveal', () => shell.openPath(config.vault));

  ipcMain.handle('notes:list', () => ({ notes: listNotes(), folders: listNotes.folders || [] }));
  ipcMain.handle('notes:readAll', () => listNotes().map(n => ({ ...n, content: fs.readFileSync(safe(n.path), 'utf8') })));
  ipcMain.handle('notes:read', (_e, rel) => fs.readFileSync(safe(rel), 'utf8'));
  ipcMain.handle('notes:write', (_e, rel, content) => {
    const full = safe(rel);
    snapshot(rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    return true;
  });
  ipcMain.handle('notes:exists', (_e, rel) => fs.existsSync(safe(rel)));
  ipcMain.handle('notes:delete', async (_e, rel) => {
    const full = safe(rel);
    snapshot(rel, { force: true });
    await shell.trashItem(full).catch(() => fs.rmSync(full, { recursive: true, force: true }));
    return true;
  });
  ipcMain.handle('notes:rename', (_e, from, to) => {
    const dst = safe(to);
    if (fs.existsSync(dst)) throw new Error('A note with that name already exists.');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(safe(from), dst);
    // Keep the note's version history with it.
    if (fs.existsSync(historyDir(from)) && !fs.existsSync(historyDir(to))) fs.renameSync(historyDir(from), historyDir(to));
    return true;
  });
  ipcMain.handle('history:list', (_e, rel) => snapshots(rel).map(ts => ({ ts, size: fs.statSync(path.join(historyDir(rel), ts + '.md')).size })));
  ipcMain.handle('history:read', (_e, rel, ts) => fs.readFileSync(path.join(historyDir(rel), Number(ts) + '.md'), 'utf8'));
  ipcMain.handle('history:snapshot', (_e, rel) => { snapshot(rel, { force: true }); return true; });

  ipcMain.handle('backup:now', () => backupNow());
  ipcMain.handle('backup:info', () => {
    let list = [];
    try { list = fs.readdirSync(backupRoot()).filter(d => /^\d{4}-/.test(d)).sort().reverse(); } catch { /* none yet */ }
    return { dir: backupRoot(), last: (config.backups || {})[path.resolve(config.vault)] || null, count: list.length, latest: list[0] || null };
  });
  ipcMain.handle('backup:reveal', () => { fs.mkdirSync(backupRoot(), { recursive: true }); return shell.openPath(backupRoot()); });

  // Images pasted/dropped into notes go into <vault>/Attachments, like Obsidian.
  ipcMain.handle('attach:save', (_e, dataUrl, name) => {
    const m = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error('That file type is not a supported image.');
    const ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[m[1]] || m[1];
    const base = (String(name || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'image').slice(0, 60);
    const dir = path.join(config.vault, 'Attachments');
    fs.mkdirSync(dir, { recursive: true });
    let file = `${base}.${ext}`, i = 2;
    while (fs.existsSync(path.join(dir, file))) file = `${base} ${i++}.${ext}`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(m[2], 'base64'));
    return 'Attachments/' + file;
  });
  ipcMain.handle('attach:list', () => {
    const out = [];
    const walk = (dir, rel) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (IMAGE_EXT.test(e.name)) out.push(r); } };
    walk(config.vault, '');
    return out;
  });
  ipcMain.handle('notes:mkdir', (_e, rel) => { fs.mkdirSync(safe(rel), { recursive: true }); return true; });

  // Cloud sync (renderer/js/cloud-sync.js) keeps what it last synced in .dmtools/cloud.json, and reads and writes
  // images by name.
  const cloudPath = () => path.join(metaDir(), 'cloud.json');
  ipcMain.handle('cloud:load', () => { try { return JSON.parse(fs.readFileSync(cloudPath(), 'utf8')); } catch { return null; } });
  ipcMain.handle('cloud:save', (_e, data) => {
    fs.mkdirSync(metaDir(), { recursive: true });
    if (data == null) { fs.rmSync(cloudPath(), { force: true }); return true; }
    fs.writeFileSync(cloudPath() + '.tmp', JSON.stringify(data)); fs.renameSync(cloudPath() + '.tmp', cloudPath());
    return true;
  });
  const imgMime = (f) => ({ jpg: 'jpeg', svg: 'svg+xml' }[path.extname(f).slice(1).toLowerCase()] || path.extname(f).slice(1).toLowerCase());
  const readImage = (full) => `data:image/${imgMime(full)};base64,${fs.readFileSync(full).toString('base64')}`;
  const writeImage = (full, dataUrl) => {
    const m = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(String(dataUrl));
    if (!m) throw new Error('Not an image');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from(m[1], 'base64'));
    return true;
  };
  ipcMain.handle('media:list', () => { try { return fs.readdirSync(mediaDir()).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f)); } catch { return []; } });
  ipcMain.handle('media:read', (_e, name) => readImage(path.join(mediaDir(), path.basename(String(name)))));
  ipcMain.handle('media:write', (_e, name, dataUrl) => {
    if (!/\.(png|jpe?g|gif|webp)$/i.test(String(name))) throw new Error('Unsupported image');
    return writeImage(path.join(mediaDir(), path.basename(String(name))), dataUrl);
  });
  ipcMain.handle('attach:read', (_e, rel) => { const full = safe(rel); if (!IMAGE_EXT.test(full)) throw new Error('Not an image'); return readImage(full); });
  ipcMain.handle('attach:write', (_e, rel, dataUrl) => { const full = safe(rel); if (!IMAGE_EXT.test(full)) throw new Error('Not an image'); return writeImage(full, dataUrl); });

  ipcMain.handle('state:load', () => {
    try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; }
  });
  ipcMain.handle('state:save', (_e, state) => {
    fs.mkdirSync(metaDir(), { recursive: true });
    const tmp = statePath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, statePath());
    return true;
  });

  ipcMain.handle('media:save', (_e, dataUrl, hint = 'image') => {
    const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error('Unsupported image');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const name = `${hint.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'img'}-${Date.now().toString(36)}.${ext}`;
    fs.writeFileSync(path.join(mediaDir(), name), Buffer.from(m[2], 'base64'));
    return name;
  });

  // Copy token PNGs from the media folder into a folder the user picks (for a virtual tabletop).
  ipcMain.handle('tokens:exportFiles', async (_e, items) => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the token PNGs', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const used = new Set();
    for (const it of items) {
      const base = (String(it.name || 'token').replace(/[\\/:*?"<>|]/g, '').trim() || 'token').replace(/\s+/g, '_');
      let name = base + '.png', i = 2;
      while (used.has(name) || fs.existsSync(path.join(r.filePaths[0], name))) name = `${base}_${i++}.png`;
      used.add(name);
      fs.copyFileSync(path.join(mediaDir(), path.basename(it.file)), path.join(r.filePaths[0], name));
    }
    return r.filePaths[0];
  });
  ipcMain.handle('file:savePng', async (_e, dataUrl, defaultName) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return r.filePath;
  });

  // Render an HTML document in a hidden window, then print it or save as PDF.
  ipcMain.handle('print:html', async (_e, html, mode, defaultName) => {
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    const tmp = path.join(app.getPath('temp'), `dmtools-print-${Date.now()}.html`);
    fs.writeFileSync(tmp, html);
    await pw.loadFile(tmp);
    await new Promise(r => setTimeout(r, 400)); // let images/fonts settle
    try {
      if (mode === 'pdf') {
        const r = await dialog.showSaveDialog(win, { defaultPath: defaultName || 'print.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (r.canceled || !r.filePath) return null;
        const pdf = await pw.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
        fs.writeFileSync(r.filePath, pdf);
        return r.filePath;
      }
      await new Promise(res => pw.webContents.print({ printBackground: true }, () => res()));
      return true;
    } finally {
      pw.destroy();
      fs.rm(tmp, () => {});
    }
  });

  ipcMain.handle('server:info', async () => {
    const urls = getLanUrls();
    // The QR code carries the join code, so scanning it is all a player needs to do.
    const qr = urls[0] ? await QRCode.toDataURL(`${urls[0]}?code=${server.code}`, { margin: 1, width: 260 }) : null;
    return { port: server.port, urls, qr, code: server.code, players: server.playerList() };
  });
  ipcMain.handle('server:newCode', () => { config.joinCode = newJoinCode(); saveConfig(); server.setCode(config.joinCode); return config.joinCode; });
  ipcMain.handle('server:publish', (_e, pub) => { server.publish(pub); return true; });
  ipcMain.handle('server:openDisplay', () => {
    const dw = new BrowserWindow({ width: 900, height: 700, title: 'Player Display', autoHideMenuBar: true });
    dw.loadURL(`http://127.0.0.1:${server.port}/?display=1&code=${server.code}`);
  });
  // Read-only lookups in the Open5e library (open-licensed 5e content), done here so the renderer CSP stays strict.
  ipcMain.handle('web:open5e', async (_e, pathAndQuery) => {
    if (!/^\/v1\/[a-z]+\/(\?[\w=&%.+,-]*)?$/.test(pathAndQuery)) throw new Error('Unsupported request');
    const r = await net.fetch('https://api.open5e.com' + pathAndQuery, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Open5e returned ${r.status}`);
    return r.json();
  });
  ipcMain.handle('update:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, platform: `${process.platform} ${process.arch}`,
    canUpdate: !!autoUpdater, status: updateStatus, releasesUrl: `https://github.com/${REPO.owner}/${REPO.repo}/releases` }));
  ipcMain.handle('update:check', () => autoUpdater && autoUpdater.checkForUpdates().catch(e => sendUpdate({ state: 'error', message: e.message })));
  ipcMain.handle('update:download', () => autoUpdater && autoUpdater.downloadUpdate().catch(e => sendUpdate({ state: 'error', message: e.message })));
  ipcMain.handle('update:install', () => autoUpdater && autoUpdater.quitAndInstall());
  ipcMain.handle('shell:open', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
}

// ---------- Auto-update from GitHub Releases ----------
// Works for the Windows installer and the Linux AppImage; downloads are differential (only changed blocks).
let autoUpdater = null, updateStatus = null;
function sendUpdate(st) { updateStatus = st; if (win && !win.isDestroyed()) win.webContents.send('update:status', st); }
function setupUpdater() {
  const supported = app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && process.env.APPIMAGE));
  if (!supported) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  const notes = (n) => Array.isArray(n) ? n.map(x => x.note).join('<hr>') : (n || '');
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'available', version: i.version, notes: notes(i.releaseNotes) }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ ...updateStatus, state: 'downloading', progress: p.percent }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version, notes: notes(i.releaseNotes) }));
  autoUpdater.on('error', (e) => sendUpdate({ state: 'error', message: String((e && e.message) || e).split('\n')[0] }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600 * 1000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 650,
    title: `Dungeons Desk — ${campaignName(config.vault)}`, icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#17141f', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Links in notes open in the system browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

// vault://local/<path> serves images from the current vault to the DM window only (never to the network).
// Packaged Linux builds (AppImage) can't use Chromium's setuid sandbox helper on many distros.
if (process.platform === 'linux' && app.isPackaged) app.commandLine.appendSwitch('no-sandbox');
if (process.platform === 'win32') app.setAppUserModelId('com.beeftcg.dungeonsdesk');

protocol.registerSchemesAsPrivileged([{ scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.setName('Dungeons Desk');
if (process.platform === 'linux') app.setDesktopName('dungeons-desk.desktop'); // match the launcher so the dock shows our icon

// Only one copy may run: two would fight over the same campaign files and player port.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  loadConfig();
  saveConfig();
  ensureVault();
  protocol.handle('vault', (req) => {
    try {
      const rel = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
      const full = safe(rel);
      if (!IMAGE_EXT.test(full) || !fs.existsSync(full)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(full).toString());
    } catch { return new Response('Not found', { status: 404 }); }
  });
  autoBackup();
  setInterval(autoBackup, 3 * 3600 * 1000);
  server = new PlayerServer({ staticDir: path.join(__dirname, 'player'), sharedDir: path.join(__dirname, 'shared'), mediaDir: mediaDir(), vaultDir: () => config.vault });
  server.onPlayers = list => win && win.webContents.send('server:players', list);
  server.onAction = action => win && win.webContents.send('player:action', action);
  // The join code stays the same between sessions so phones that joined before can reconnect.
  if (!/^\d{6}$/.test(String(config.joinCode || ''))) { config.joinCode = newJoinCode(); saveConfig(); }
  server.code = config.joinCode;
  config.port = await server.listen(config.port);
  registerIpc();
  createWindow();
  setupUpdater();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (server && server.http) server.http.closeAllConnections(); });
