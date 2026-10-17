// Builds the phone app (a PWA for GitHub Pages, https://beeftcg-eng.github.io/dungeons-desk/) into dist-web/:
//   index.html     the start page: "I'm the DM" or "I'm a player"
//   dm/            the DM app: renderer/ as is, with web/dm-bridge.js standing in for preload.js
//   sheet/         the standalone character sheet (web/sheet.html)
//   shared/ vendor/ icons/ web/  what those pages load
//   sw.js          caches all of it so both apps work offline
// No bundler: files are copied, and only dm/index.html is rewritten (paths, CSP, the bridge script).
// `node scripts/build-web.js --serve [port]` also serves dist-web/ on this computer for testing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-web');
const { version } = require(ROOT + '/package.json');
const rel = (...p) => path.join(ROOT, ...p);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const write = (p, text) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), text); };
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error('build-web: expected to find ' + from);
  return text.replace(from, to);
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(rel('renderer'), path.join(OUT, 'dm'));
copyDir(rel('shared'), path.join(OUT, 'shared'));
fs.mkdirSync(path.join(OUT, 'web'), { recursive: true });
for (const f of ['dm-bridge.js', 'sw-register.js', 'sheet.js']) fs.copyFileSync(rel('web', f), path.join(OUT, 'web', f));
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.copyFileSync(rel('node_modules/marked/lib/marked.umd.js'), path.join(OUT, 'vendor/marked.umd.js'));
fs.copyFileSync(rel('node_modules/js-yaml/dist/js-yaml.min.js'), path.join(OUT, 'vendor/js-yaml.min.js'));
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
for (const s of [32, 128, 256, 512]) fs.copyFileSync(rel(`build/icon-${s}.png`), path.join(OUT, `icons/icon-${s}.png`));
fs.copyFileSync(rel('build/icon.svg'), path.join(OUT, 'icons/icon.svg'));
write('.nojekyll', '');

// The how-to guide and example notes, for new campaigns (dm.vault.addSeed and the first run).
const seed = {};
for (const part of ['examples', 'guide']) {
  seed[part] = {};
  const walk = (dir, r) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = r ? r + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), p);
      else if (e.name.endsWith('.md')) seed[part][p] = fs.readFileSync(path.join(dir, e.name), 'utf8');
    }
  };
  if (fs.existsSync(rel('seed', part))) walk(rel('seed', part), '');
}
write('dm/seed.json', JSON.stringify(seed));

// Phone-app head: viewport, manifest, icons. The CSP allows the same things as the desktop one, from this site.
const head = (manifest, title) => `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#17141f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${title}">
<link rel="manifest" href="${manifest}">
<link rel="icon" href="../icons/icon-32.png">
<link rel="apple-touch-icon" href="../icons/icon-256.png">`;
const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://api.open5e.com; frame-src 'self' blob: data:; worker-src 'self'; manifest-src 'self'`;

let dm = fs.readFileSync(rel('renderer/index.html'), 'utf8');
dm = dm.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n${head('manifest.json', 'DM Desk')}`);
dm = replaceOnce(dm, '<html lang="en">', `<html lang="en" data-version="${version}">`);
dm = replaceOnce(dm, '../build/icon-128.png', '../icons/icon-128.png');
dm = replaceOnce(dm, '<script src="../node_modules/marked/lib/marked.umd.js"></script>', '<script src="../web/dm-bridge.js"></script>\n<script src="../web/sw-register.js"></script>\n<script src="../vendor/marked.umd.js"></script>');
dm = replaceOnce(dm, '../node_modules/js-yaml/dist/js-yaml.min.js', '../vendor/js-yaml.min.js');
if (/\.\.\/(node_modules|build)\//.test(dm)) throw new Error('build-web: dm/index.html still points outside the site');
write('dm/index.html', dm);

let sheet = fs.readFileSync(rel('web/sheet.html'), 'utf8');
sheet = sheet.replace('<!--HEAD-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n${head('manifest.json', 'Character Sheet')}`).replace(/__VERSION__/g, version);
write('sheet/index.html', sheet);
write('index.html', fs.readFileSync(rel('web/index.html'), 'utf8').replace(/__VERSION__/g, version));

const manifest = (name, short, desc) => JSON.stringify({
  name, short_name: short, description: desc, start_url: './', scope: './', display: 'standalone', orientation: 'any',
  background_color: '#17141f', theme_color: '#17141f',
  icons: [256, 512].map(s => ({ src: `../icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
}, null, 2);
write('dm/manifest.json', manifest('Dungeons Desk', 'DM Desk', 'Notes, initiative, maps, loot and rules for Dungeon Masters'));
write('sheet/manifest.json', manifest('Dungeons Desk Character Sheet', 'Character', 'A D&D 5e (2024) character sheet that works on its own'));

// Service worker: every file, precached under a name that changes whenever any file does.
const files = [];
const walk = (dir, r) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = r ? r + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), p); else if (!e.name.startsWith('.')) files.push(p); } };
walk(OUT, '');
const hash = crypto.createHash('sha256');
files.sort().forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(OUT, f))); });
// Pages are cached by their folder URL (dm/ rather than dm/index.html), which is how they're opened.
const shell = ['./', 'dm/', 'sheet/', ...files.filter(f => !/(^|\/)index\.html$/.test(f))];
write('sw.js', fs.readFileSync(rel('web/sw.js'), 'utf8')
  .replace('__CACHE__', `dd-${version}-${hash.digest('hex').slice(0, 10)}`)
  .replace('__FILES__', JSON.stringify(shell)));
console.log(`dist-web/: ${files.length + 1} files, Dungeons Desk ${version}`);

if (process.argv.includes('--serve')) {
  const port = Number(process.argv[process.argv.indexOf('--serve') + 1]) || 8077;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  require('http').createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const full = path.join(OUT, p);
    if (!full.startsWith(OUT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  }).listen(port, () => console.log(`Serving http://localhost:${port}/`));
}
