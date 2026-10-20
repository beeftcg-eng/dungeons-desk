// Local network server for players' phones.
// Phones load a small web page and receive live updates over Server-Sent Events.
// Phones can read published state, register a name, keep their own private notes page, and send a few
// small player actions (move one of *their* map tokens, ping the map, upload their character token, save
// their own character sheet, send the DM a roll or a card). The DM app checks every action (token ownership,
// map settings, sheet and roll cleaning) before applying it; phones cannot change anything else in the DM's game.
// All of it needs the DM's join code (see authorized()).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { viewFor } = require('./shared/view-for');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm' };
const VIDEO = /\.(mp4|m4v|webm)$/i;

class PlayerServer {
  constructor({ staticDir, sharedDir, mediaDir, vaultDir }) {
    this.vaultDir = vaultDir; // () => current vault folder
    this.staticDir = staticDir;
    this.sharedDir = sharedDir;
    this.mediaDir = mediaDir;
    this.clients = new Set(); // { res, player, display }
    this.known = new Map();   // lowercased name -> { name, lastSeen }
    this.pub = { initiative: null, handouts: [], party: [], partyCards: [], wiki: [], wikiImages: [], map: null, calendar: null, feed: [], homebrew: { spells: [], items: [] }, recap: null, notices: [] };
    this.onPlayers = () => {};
    this.onAction = () => {}; // (action) => void, handled by the DM app
    this.lastPing = new Map();
    this.code = null;          // join code; phones send it as ?code= on /events and every /api call
    this.fails = new Map();    // ip -> { n, t } wrong join codes, to slow down guessing
  }

  // A new code disconnects every phone; they rejoin by scanning the QR code again or typing the new code.
  setCode(code) {
    this.code = String(code);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
    this.onPlayers(this.playerList());
  }

  // True when the request carries the right join code. Too many wrong codes from one address get refused for a minute.
  authorized(req, url) {
    if (!this.code) return true;
    const ip = req.socket.remoteAddress || '';
    const f = this.fails.get(ip);
    if (f && f.n >= 8 && Date.now() - f.t < 60_000) return false;
    if (url.searchParams.get('code') === this.code) { this.fails.delete(ip); return true; }
    this.fails.set(ip, { n: f && Date.now() - f.t < 60_000 ? f.n + 1 : 1, t: Date.now() });
    return false;
  }

  setMediaDir(dir) { this.mediaDir = dir; }

  listen(port) {
    this.http = http.createServer((req, res) => this.handle(req, res));
    return new Promise((resolve) => {
      const tryPort = (p, attempts) => {
        this.http.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && attempts > 0) tryPort(p + 1, attempts - 1);
          else throw err;
        });
        this.http.listen(p, '0.0.0.0', () => { this.port = p; resolve(p); });
      };
      tryPort(port, 20);
    });
  }

  playerList() {
    const online = new Set([...this.clients].filter(c => c.player).map(c => c.player.toLowerCase()));
    return [...this.known.values()].map(p => ({ name: p.name, online: online.has(p.name.toLowerCase()) }));
  }

  // What a specific phone is allowed to see (shared/view-for.js, also used by online tables).
  viewFor(client) { return viewFor(this.pub, client); }

  send(client) {
    client.res.write(`data: ${JSON.stringify(this.viewFor(client))}\n\n`);
  }

  publish(pub) {
    this.pub = { ...this.pub, ...pub };
    for (const c of this.clients) this.send(c);
  }

  serveFile(res, file, req) {
    // Animated maps are videos, often hundreds of MB: streamed, with Range requests so players can loop and seek.
    if (VIDEO.test(file)) return this.serveVideo(res, file, req);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }

  serveVideo(res, file, req) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
      const head = { 'Content-Type': MIME[path.extname(file).toLowerCase()], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
      const m = /^bytes=(\d*)-(\d*)$/.exec((req && req.headers.range) || '');
      if (!m || (!m[1] && !m[2])) { res.writeHead(200, { ...head, 'Content-Length': st.size }); return fs.createReadStream(file).pipe(res); }
      let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    });
  }

  handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);

    // Everything live (state, notes, player actions) needs the join code. The page itself, shared code and media don't.
    if (p === '/events' || p.startsWith('/api/')) {
      if (!this.authorized(req, url)) { res.writeHead(401, { 'Content-Type': 'text/plain' }); return res.end('Wrong join code'); }
      if (p === '/api/join') { res.writeHead(204); return res.end(); }
    }

    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const name = (url.searchParams.get('player') || '').trim().slice(0, 40);
      const client = { res, player: name || null, display: url.searchParams.get('display') === '1' };
      if (name) this.known.set(name.toLowerCase(), { name, lastSeen: Date.now() });
      this.clients.add(client);
      this.send(client);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); this.clients.delete(client); this.onPlayers(this.playerList()); });
      this.onPlayers(this.playerList());
      return;
    }

    // Player actions: POST /api/move {map, token, x, y}, /api/ping {map, x, y}, /api/token {dataUrl},
    // /api/sheet {model} (the player's own character sheet), /api/share {share} (a roll or a card for the DM),
    // /api/offer {name, model} (a character file for the DM to add to the party; nothing changes until they accept).
    if (req.method === 'POST' && ['/api/move', '/api/ping', '/api/token', '/api/sheet', '/api/share', '/api/offer'].includes(p)) {
      const player = (url.searchParams.get('player') || '').trim().slice(0, 40);
      if (!player) { res.writeHead(400); return res.end(); }
      const limit = p === '/api/token' ? 3_000_000 : p === '/api/sheet' || p === '/api/offer' ? 400_000 : p === '/api/share' ? 10_000 : 2000;
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > limit) { res.writeHead(413); res.end(); req.destroy(); } });
      req.on('end', () => {
        let data;
        try { data = JSON.parse(body || '{}'); } catch { res.writeHead(400); return res.end(); }
        const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
        if (p === '/api/sheet') {
          if (!data || typeof data.model !== 'object') { res.writeHead(400); return res.end(); }
          this.onAction({ type: 'sheet', player, model: data.model });
        } else if (p === '/api/offer') {
          const last = this.lastPing.get('offer:' + player.toLowerCase()) || 0;
          if (Date.now() - last < 5000) { res.writeHead(429); return res.end(); }
          if (!data || typeof data.model !== 'object' || !data.model) { res.writeHead(400); return res.end(); }
          this.lastPing.set('offer:' + player.toLowerCase(), Date.now());
          this.onAction({ type: 'offer', player, name: String(data.name || '').slice(0, 60), model: data.model });
        } else if (p === '/api/share') {
          const last = this.lastPing.get('share:' + player.toLowerCase()) || 0;
          if (Date.now() - last < 400 || !data || typeof data.share !== 'object') { res.writeHead(429); return res.end(); }
          this.lastPing.set('share:' + player.toLowerCase(), Date.now());
          this.onAction({ type: 'share', player, share: data.share });
        } else if (p === '/api/move') {
          if (num(data.x) == null || num(data.y) == null) { res.writeHead(400); return res.end(); }
          this.onAction({ type: 'move', player, map: String(data.map || ''), token: String(data.token || ''), x: num(data.x), y: num(data.y) });
        } else if (p === '/api/ping') {
          const last = this.lastPing.get(player.toLowerCase()) || 0;
          if (Date.now() - last < 1000 || num(data.x) == null) { res.writeHead(429); return res.end(); }
          this.lastPing.set(player.toLowerCase(), Date.now());
          this.onAction({ type: 'ping', player, map: String(data.map || ''), x: num(data.x), y: num(data.y) });
        } else {
          const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data.dataUrl || ''));
          if (!m) { res.writeHead(400); return res.end(); }
          const file = `pctoken-${player.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
          fs.writeFileSync(path.join(this.mediaDir, file), Buffer.from(m[2], 'base64'));
          this.onAction({ type: 'token', player, file });
        }
        res.writeHead(204); res.end();
      });
      return;
    }

    // Each player's private notes (a section per session): one text file per player name, up to 500 kB.
    if (p === '/api/notes') {
      const name = (url.searchParams.get('player') || '').trim().toLowerCase().slice(0, 40);
      if (!name) { res.writeHead(400); return res.end(); }
      const dir = path.join(this.vaultDir(), '.dmtools', 'players');
      const file = path.join(dir, encodeURIComponent(name) + '.txt');
      if (req.method === 'GET') {
        fs.readFile(file, 'utf8', (err, text) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(err ? '' : text); });
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 500000) req.destroy(); });
        req.on('end', () => {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFile(file, body, () => { res.writeHead(204); res.end(); });
        });
        return;
      }
      res.writeHead(405); return res.end();
    }

    // Images used by wiki pages the DM has shared (and only those).
    if (p.startsWith('/wiki-img/')) {
      const rel = p.slice(10);
      if (!(this.pub.wikiImages || []).includes(rel)) { res.writeHead(404); return res.end(); }
      const base = path.resolve(this.vaultDir());
      const full = path.resolve(base, rel);
      if (!full.startsWith(base + path.sep)) { res.writeHead(404); return res.end(); }
      return this.serveFile(res, full, req);
    }

    if (p === '/' || p === '/index.html') return this.serveFile(res, path.join(this.staticDir, 'index.html'), req);

    const pick = (base, rel) => {
      const full = path.resolve(base, rel);
      return full.startsWith(path.resolve(base) + path.sep) ? full : null;
    };
    let file = null;
    if (p.startsWith('/media/')) file = pick(this.mediaDir, p.slice(7));
    else if (p.startsWith('/shared/')) file = pick(this.sharedDir, p.slice(8));
    else file = pick(this.staticDir, p.slice(1));
    if (!file) { res.writeHead(404); return res.end(); }
    this.serveFile(res, file, req);
  }
}

module.exports = { PlayerServer };
