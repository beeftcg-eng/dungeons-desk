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
  const DAY = 86400000;
  const markSaved = (c) => { c.exported = Date.now(); save(); };
  // Phones can clear a site's storage, so a character changed since its last file or link gets a reminder after a week.
  const needsBackup = (c) => c.updated > (c.exported || 0) && Date.now() - (c.exported || c.created || c.updated) > 7 * DAY;
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
      try { await navigator.share({ files: [f], title: c.name }); markSaved(c); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(f); markSaved(c);
  }
  // A link with the whole sheet in it (CharSheet.toLink): tap it on another phone to open the character there.
  async function shareLink(c) {
    let url;
    try { url = await CharSheet.toLink({ ...c.model, name: c.name }, location.href); } catch { return toast('This browser can\'t make links. Share the file instead.', true); }
    if (url.length > 60000) return toast('This character is too big for a link. Share the file instead.', true);
    if (navigator.share) {
      try { await navigator.share({ title: `${c.name}: character sheet`, url }); markSaved(c); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); markSaved(c); toast('Link copied'); } catch { prompt('Copy this link', url); }
  }
  // Opened from a share link: offer to add the character, then tidy the address bar.
  async function openLink() {
    if (!/[#&]c=/.test(location.hash)) return false;
    let c;
    try { c = await CharSheet.fromLink(location.hash); } catch (e) { toast(e.message, true); }
    history.replaceState(null, '', location.pathname + location.search);
    if (!c) return false;
    if (!confirm(`Add ${c.name || 'this character'} to your characters?`)) return false;
    const ch = { id: uid(), name: c.name || 'Adventurer', model: c.model, created: Date.now(), updated: Date.now(), exported: Date.now() };
    chars.unshift(ch);
    if (save()) { toast(`Added ${ch.name}`); openChar(ch.id); return true; }
    return false;
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
    const ch = { id: uid(), name: c.name || 'Adventurer', model: c.model, created: Date.now(), updated: Date.now(), exported: Date.now() };
    chars.unshift(ch);
    if (save()) { toast(`Imported ${ch.name}`); openChar(ch.id); }
  }
  function newChar() {
    const name = prompt('Character name', '');
    if (name == null) return;
    const ch = { id: uid(), name: name.trim().slice(0, 60) || 'Adventurer', model: CharSheet.prepare({ level: 1 }), created: Date.now(), updated: Date.now() };
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
    const stale = chars.filter(needsBackup), snoozed = Number(localStorage.getItem('dd.sheet.snooze') || 0) > Date.now();
    const stats = (c) => { try { const D = CharSheet.derive(CharSheet.prepare(c.model)); return `<span class="chips"><i>AC ${D.ac}</i><i>HP ${D.hp ?? '—'}/${D.maxHp ?? '—'}</i><i>Init ${D.init >= 0 ? '+' : ''}${D.init}</i><i>PP ${D.passive}</i></span>`; } catch { return ''; } };
    const av = (c) => c.model.sheet && c.model.sheet.portrait ? `<img class="av" src="${esc(c.model.sheet.portrait)}" alt="">` : `<span class="av">${esc((c.name || '?')[0].toUpperCase())}</span>`;
    main.innerHTML = `${stale.length && !snoozed ? `<div class="card backup"><h3>💾 Keep a copy</h3><p class="hint">${esc(stale.map(c => c.name).join(', '))} ${stale.length === 1 ? 'hasn\'t' : 'haven\'t'} been saved to a file for a while. Phones sometimes clear app data, so a file or link keeps your character safe.</p>
        <div class="row"><button class="btn primary" data-a="backup">⬇ Download ${stale.length === 1 ? 'it' : 'them'}</button><button class="btn" data-a="later">Later</button></div></div>` : ''}${chars.length ? '' : `<div class="empty"><div class="big">📜</div><p class="hint">A D&amp;D character sheet (2024 rules) that does the math for you: build a character, tap to roll, level up and track HP, spell slots and gear. Everything is saved on this phone.</p></div>`}
      <div class="chars">${chars.map(c => `<button class="char" data-id="${esc(c.id)}">${av(c)}<span><b>${esc(c.name)}</b><small>${esc(summary(c))}</small>${stats(c)}</span></button>`).join('')}</div>
      <div class="row"><button class="btn primary" data-a="new">＋ New character</button><button class="btn" data-a="import">⇩ Import a character file</button></div>
      <div class="card" style="margin-top:18px"><h3>🎲 Playing at a Dungeons Desk table?</h3>
        <p class="hint">Open your character, go to its 💾 File tab and send the file to your DM. They add it from Settings → ⇩ Add from a character file. If the DM already has you in the party, open their game on your phone (scan their QR code) and use 👤 Me → ⇩ Import my sheet.</p></div>`;
    main.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.id) openChar(b.dataset.id);
      else if (b.dataset.a === 'new') newChar();
      else if (b.dataset.a === 'import') importFile();
      else if (b.dataset.a === 'later') { localStorage.setItem('dd.sheet.snooze', Date.now() + 3 * DAY); showList(); }
      else if (b.dataset.a === 'backup') { stale.forEach((c, i) => setTimeout(() => { download(fileOf(c)); markSaved(c); if (i === stale.length - 1) showList(); }, i * 300)); }
    };
  }

  // ---------- One character ----------
  function fileTab(c) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="card"><h3>💾 Character file</h3>
        <p class="hint">Send this to your DM, keep it as a backup, or open it on another phone. It holds the whole sheet.</p>
        <div class="row"><button class="btn primary" data-a="share">📤 Share file</button><button class="btn" data-a="download">⬇ Download</button></div></div>
      <div class="card"><h3>🔗 Share link</h3><p class="hint">A link with the whole character inside. Tapping it opens the character in this app on any phone, which is handy for sending to yourself or a friend. Nothing is uploaded.</p>
        <button class="btn" data-a="link">🔗 Share link</button></div>
      <div class="card"><h3>🖨 Print</h3><p class="hint">A printable sheet. Your phone's print screen can also save it as a PDF.</p><button class="btn" data-a="print">🖨 Print or save as PDF</button></div>
      <div class="card"><h3>✏ This character</h3><div class="row"><button class="btn" data-a="rename">Rename</button><button class="btn" data-a="copy">Duplicate</button><button class="btn danger" data-a="delete">Delete</button></div></div>`;
    el.addEventListener('click', (e) => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'share') share(c);
      else if (a === 'download') { download(fileOf(c)); markSaved(c); }
      else if (a === 'link') shareLink(c);
      else if (a === 'print') printSheet(c);
      else if (a === 'rename') {
        const n = prompt('Rename character', c.name);
        if (n && n.trim()) { c.name = n.trim().slice(0, 60); c.updated = Date.now(); save(); $('#title').textContent = c.name; sheet.set({ ...sheet.get(), name: c.name }); }
      } else if (a === 'copy') {
        const d = { id: uid(), name: c.name + ' (copy)', model: JSON.parse(JSON.stringify(c.model)), created: Date.now(), updated: Date.now() };
        chars.unshift(d); save(); openChar(d.id); toast('Duplicated');
      } else if (a === 'delete') {
        if (!confirm(`Delete ${c.name}? This can't be undone. Download the file first if you want to keep a copy.`)) return;
        chars = chars.filter(x => x !== c); save(); showList();
      }
    });
    return el;
  }
  // Every roll made on this sheet, newest first (the last 60 are kept with the character).
  function rollsTab(c) {
    const el = document.createElement('div');
    const draw = () => {
      const list = c.rolls || [];
      el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h3>🎲 Roll log</h3>${list.length ? '<button class="btn" data-a="clear">Clear</button>' : ''}</div>
        ${list.length ? list.map(e => `<div class="roll-row"><div>${CharSheet.feedHtml(e)}</div><small>${new Date(e.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') : '<p class="hint">Rolls you make from this sheet show up here.</p>'}</div>`;
    };
    el.addEventListener('click', (e) => { if (e.target.dataset.a === 'clear') { c.rolls = []; save(); draw(); } });
    el.redraw = draw;
    draw();
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
    const rolls = rollsTab(c);
    sheet = CharSheet.mount($('#sheet'), {
      model: { ...c.model, name: c.name }, mode: 'solo', toast: (t) => toast(t),
      onChange: (m) => { c.model = CharSheet.clean(m); c.updated = Date.now(); saveSoon(); },
      onRoll: (e) => { c.rolls = [e, ...(c.rolls || [])].slice(0, 60); saveSoon(); rolls.redraw(); },
      extraTabs: [{ id: 'rolls', label: '🎲 Rolls', el: rolls }, { id: 'file', label: '💾 File', el: fileTab(c) }],
    });
    window.scrollTo(0, 0);
  }

  $('#list-btn').addEventListener('click', showList);
  load();
  const cur = localStorage.getItem(CUR);
  if (cur && byId(cur)) openChar(cur); else showList();
  openLink();
  window.addEventListener('hashchange', openLink);
})();
