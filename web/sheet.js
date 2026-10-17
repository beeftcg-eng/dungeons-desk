// The standalone character sheet (dist-web/sheet/): shared/charsheet.js in 'solo' mode, with no DM involved.
// Characters are kept in this browser's localStorage. A character file (CharSheet.toFile) takes one to a DM's
// game: they add it in Settings → ⇩ Add from a character file, or the player imports it in the game's 👤 Me tab.
(() => {
  const KEY = 'dd.sheet.chars', CUR = 'dd.sheet.current';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let chars = [], sheet = null, saveTimer = null;

  function load() {
    try { chars = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { chars = []; }
    if (!Array.isArray(chars)) chars = [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(chars)); return true; }
    catch { toast('Couldn\'t save: this phone\'s storage for the app is full', true); return false; }
  }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
  window.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); save(); } });

  function toast(text, err) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = Object.assign(document.createElement('div'), { className: 'toast' + (err ? ' err' : ''), textContent: text });
    document.body.append(t);
    setTimeout(() => t.remove(), 2800);
  }
  const summary = (c) => {
    const m = c.model || {}, s = m.sheet || {};
    return [m.cls ? `Level ${m.level || 1} ${m.cls}` : 'No class yet', s.species, s.background].filter(Boolean).join(' · ');
  };
  const byId = (id) => chars.find(c => c.id === id);
  const fileOf = (c) => new File([JSON.stringify(CharSheet.toFile({ ...c.model, name: c.name }))], CharSheet.fileName(c.name), { type: 'application/json' });

  function download(file) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  // The phone's share sheet when it can send files (Messages, Discord, email…), otherwise a download.
  async function share(c) {
    const f = fileOf(c);
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: c.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(f);
  }
  function pickFile() {
    return new Promise((res) => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
      inp.onchange = () => res(inp.files[0] || null);
      inp.click();
    });
  }
  async function importFile() {
    const f = await pickFile();
    if (!f) return;
    let c;
    try { c = CharSheet.fromFile(await f.text()); } catch (e) { return toast(e.message, true); }
    const ch = { id: uid(), name: c.name || 'Adventurer', model: c.model, updated: Date.now() };
    chars.unshift(ch);
    if (save()) { toast(`Imported ${ch.name}`); openChar(ch.id); }
  }
  function newChar() {
    const name = prompt('Character name', '');
    if (name == null) return;
    const ch = { id: uid(), name: name.trim().slice(0, 60) || 'Adventurer', model: CharSheet.prepare({ level: 1 }), updated: Date.now() };
    chars.unshift(ch);
    save();
    openChar(ch.id);
  }

  // ---------- The list of characters ----------
  function showList() {
    if (sheet) { sheet.destroy(); sheet = null; }
    document.querySelectorAll('.cs-rollpop').forEach(x => x.remove());
    localStorage.removeItem(CUR);
    $('#title').textContent = 'My Characters';
    $('#list-btn').hidden = true;
    const main = $('#main');
    main.innerHTML = `${chars.length ? '' : `<div class="empty"><div class="big">📜</div><p class="hint">A D&amp;D character sheet (2024 rules) that does the math for you: build a character, tap to roll, level up and track HP, spell slots and gear. Everything is saved on this phone.</p></div>`}
      <div class="chars">${chars.map(c => `<button class="char" data-id="${esc(c.id)}"><span class="av">${esc((c.name || '?')[0].toUpperCase())}</span><span><b>${esc(c.name)}</b><small>${esc(summary(c))}</small></span></button>`).join('')}</div>
      <div class="row"><button class="btn primary" data-a="new">＋ New character</button><button class="btn" data-a="import">⇩ Import a character file</button></div>
      <div class="card" style="margin-top:18px"><h3>🎲 Playing at a Dungeons Desk table?</h3>
        <p class="hint">Open your character, go to its 💾 File tab and send the file to your DM. They add it from Settings → ⇩ Add from a character file. If the DM already has you in the party, open their game on your phone (scan their QR code) and use 👤 Me → ⇩ Import my sheet.</p></div>`;
    main.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.id) openChar(b.dataset.id);
      else if (b.dataset.a === 'new') newChar();
      else if (b.dataset.a === 'import') importFile();
    };
  }

  // ---------- One character ----------
  function fileTab(c) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="card"><h3>💾 Character file</h3>
        <p class="hint">Send this to your DM, keep it as a backup, or open it on another phone. It holds the whole sheet.</p>
        <div class="row"><button class="btn primary" data-a="share">📤 Share file</button><button class="btn" data-a="download">⬇ Download</button></div></div>
      <div class="card"><h3>🖨 Print</h3><p class="hint">A printable sheet. Your phone's print screen can also save it as a PDF.</p><button class="btn" data-a="print">🖨 Print or save as PDF</button></div>
      <div class="card"><h3>✏ This character</h3><div class="row"><button class="btn" data-a="rename">Rename</button><button class="btn" data-a="copy">Duplicate</button><button class="btn danger" data-a="delete">Delete</button></div></div>`;
    el.addEventListener('click', (e) => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'share') share(c);
      else if (a === 'download') download(fileOf(c));
      else if (a === 'print') printSheet(c);
      else if (a === 'rename') {
        const n = prompt('Rename character', c.name);
        if (n && n.trim()) { c.name = n.trim().slice(0, 60); c.updated = Date.now(); save(); $('#title').textContent = c.name; sheet.set({ ...sheet.get(), name: c.name }); }
      } else if (a === 'copy') {
        const d = { id: uid(), name: c.name + ' (copy)', model: JSON.parse(JSON.stringify(c.model)), updated: Date.now() };
        chars.unshift(d); save(); openChar(d.id); toast('Duplicated');
      } else if (a === 'delete') {
        if (!confirm(`Delete ${c.name}? This can't be undone. Download the file first if you want to keep a copy.`)) return;
        chars = chars.filter(x => x !== c); save(); showList();
      }
    });
    return el;
  }
  function printSheet(c) {
    const f = Object.assign(document.createElement('iframe'), { style: 'position:fixed;width:0;height:0;border:0' });
    f.srcdoc = CharSheet.printHtml({ ...c.model, name: c.name });
    f.onload = () => setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 300);
    document.body.append(f);
  }
  function openChar(id) {
    const c = byId(id);
    if (!c) return showList();
    if (sheet) sheet.destroy();
    localStorage.setItem(CUR, id);
    $('#title').textContent = c.name;
    $('#list-btn').hidden = false;
    const main = $('#main');
    main.onclick = null;
    main.innerHTML = '<div id="sheet"></div>';
    sheet = CharSheet.mount($('#sheet'), {
      model: { ...c.model, name: c.name }, mode: 'solo', toast: (t) => toast(t),
      onChange: (m) => { c.model = CharSheet.clean(m); c.updated = Date.now(); saveSoon(); },
      extraTabs: [{ id: 'file', label: '💾 File', el: fileTab(c) }],
    });
    window.scrollTo(0, 0);
  }

  $('#list-btn').addEventListener('click', showList);
  load();
  const cur = localStorage.getItem(CUR);
  if (cur && byId(cur)) openChar(cur); else showList();
})();
