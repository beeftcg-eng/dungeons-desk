// The standalone character sheet (dist-web/sheet/): shared/charsheet.js in 'solo' mode, with no DM involved.
// Characters are kept in this browser's localStorage. A character file (CharSheet.toFile) takes one to a DM's
// game: they add it in Settings → ⇩ Add from a file or PDF, or the player imports it in the game's 👤 Me tab.
(() => {
  const KEY = 'dd.sheet.chars', CUR = 'dd.sheet.current';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let chars = [], sheet = null, notesUi = null, saveTimer = null;

  function load() {
    try { chars = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { chars = []; }
    if (!Array.isArray(chars)) chars = [];
  }
  function save() {
    scheduleSync();
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
  const needsBackup = (c) => !(Cloud.user() && c.cloudRev != null && c.updated <= (c.pushed || 0)) && c.updated > (c.exported || 0) && Date.now() - (c.exported || c.created || c.updated) > 7 * DAY;
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
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: CharSheet.FILE_TYPES });
      inp.onchange = () => res(inp.files[0] || null);
      inp.click();
    });
  }
  async function importFile() {
    const f = await pickFile();
    if (!f) return;
    let c;
    try { c = await CharSheet.readFile(f); } catch (e) { return toast(e.message, true); }
    const ch = { id: uid(), name: c.name || 'Adventurer', model: c.model, created: Date.now(), updated: Date.now(), exported: Date.now() };
    chars.unshift(ch);
    if (save()) { toast(`Imported ${ch.name}${c.from === 'form' ? '. Check its gear and spells: a PDF doesn\'t hold everything' : ''}`); openChar(ch.id); }
  }
  function newChar() {
    const name = prompt('Character name', '');
    if (name == null) return;
    const ch = { id: uid(), name: name.trim().slice(0, 60) || 'Adventurer', model: CharSheet.prepare({ level: 1 }), created: Date.now(), updated: Date.now() };
    chars.unshift(ch);
    save();
    openChar(ch.id);
    // A new character starts with the guide's welcome page, which also lets them fill it in by hand.
    sheet.guide();
  }

  // ---------- The list of characters ----------
  let listDraws = 0;
  // After an update, what's new (shared/whats-new.js) sits on top of the list until dismissed. Not for a first visit.
  let news = [];
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* none */ }
  if (window.WhatsNew) { if (Array.isArray(stored) && stored.length) news = WhatsNew.take('player'); else WhatsNew.skip('player'); }
  function showList() {
    if (notesUi) { notesUi.destroy(); notesUi = null; }
    if (sheet) { sheet.destroy(); sheet = null; }
    document.querySelectorAll('.cs-rollpop').forEach(x => x.remove());
    localStorage.removeItem(CUR);
    $('#title').textContent = 'My Characters';
    $('#list-btn').hidden = true;
    const main = $('#main');
    const stale = chars.filter(needsBackup), snoozed = Number(localStorage.getItem('dd.sheet.snooze') || 0) > Date.now();
    const stats = (c) => { try { const D = CharSheet.derive(CharSheet.prepare(c.model)); return `<span class="chips"><i>AC ${D.ac}</i><i>HP ${D.hp ?? '—'}/${D.maxHp ?? '—'}</i><i>Init ${D.init >= 0 ? '+' : ''}${D.init}</i><i>PP ${D.passive}</i></span>`; } catch { return ''; } };
    const av = (c) => c.model.sheet && c.model.sheet.portrait ? `<img class="av" src="${esc(c.model.sheet.portrait)}" alt="">` : `<span class="av">${esc((c.name || '?')[0].toUpperCase())}</span>`;
    main.innerHTML = `${news.length ? `<div class="card wn">${WhatsNew.html(news, 'player')}<div class="row"><button class="btn" data-a="news">Got it</button></div></div>` : ''}${stale.length && !snoozed ? `<div class="card backup"><h3>💾 Keep a copy</h3><p class="hint">${esc(stale.map(c => c.name).join(', '))} ${stale.length === 1 ? 'hasn\'t' : 'haven\'t'} been saved to a file for a while. Phones sometimes clear app data, so a file or link keeps your character safe.</p>
        <div class="row"><button class="btn primary" data-a="backup">⬇ Download ${stale.length === 1 ? 'it' : 'them'}</button><button class="btn" data-a="later">Later</button></div></div>` : ''}${chars.length ? '' : `<div class="empty"><div class="big">📜</div><p class="hint">A D&amp;D character sheet (2024 rules) that does the math for you: build a character, tap to roll, level up and track HP, spell slots and gear. Everything is saved on this phone.</p></div>`}
      <div class="chars">${chars.map(c => `<button class="char" data-id="${esc(c.id)}">${av(c)}<span><b>${esc(c.name)}</b><small>${esc(summary(c))}</small>${stats(c)}</span></button>`).join('')}</div>
      <div class="row"><button class="btn primary" data-a="new">＋ New character</button><button class="btn" data-a="import">⇩ Import a file or PDF</button></div>
      <div style="margin-top:18px">${syncCard()}</div>
      <div class="card"><h3>🎲 Playing at a Dungeons Desk table?</h3>
        <p class="hint">Open your character, go to its 💾 File tab and send the file to your DM. They add it from Settings → ⇩ Add from a file or PDF. A PDF printed from 💾 File → 🖨 Print works too. If the DM already has you in the party, open their game on your phone (scan their QR code) and use 👤 Me → ⇩ Import my sheet.</p></div>`;
    const drawn = ++listDraws;
    Install.card({ app: 'sheet', short: 'Character', what: 'your characters' }).then(el => { if (el && drawn === listDraws && !sheet) main.prepend(el); });
    main.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.id) openChar(b.dataset.id);
      else if (b.dataset.a === 'new') newChar();
      else if (b.dataset.a === 'import') importFile();
      else if (['signin', 'signup', 'sync', 'signout', 'keep', 'drop'].includes(b.dataset.a)) cloudAction(b.dataset.a);
      else if (b.dataset.a === 'news') { news = []; showList(); }
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
      <div class="card"><h3>🖨 Print</h3><p class="hint">A printable sheet. Your phone's print screen can also save it as a PDF, and that PDF can be imported again here or added to a DM's campaign with nothing lost.</p><button class="btn" data-a="print">🖨 Print or save as PDF</button></div>
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
        if (c.cloudRev != null) addTomb(c);
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
  async function printSheet(c) {
    const f = Object.assign(document.createElement('iframe'), { style: 'position:fixed;width:0;height:0;border:0' });
    f.srcdoc = await CharSheet.printable({ ...c.model, name: c.name });
    f.onload = () => setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 300);
    document.body.append(f);
  }
  function openChar(id) {
    const c = byId(id);
    if (!c) return showList();
    if (notesUi) { notesUi.destroy(); notesUi = null; }
    if (sheet) sheet.destroy();
    localStorage.setItem(CUR, id);
    $('#title').textContent = c.name;
    $('#list-btn').hidden = false;
    const main = $('#main');
    main.onclick = null;
    main.innerHTML = '<div id="sheet"></div>';
    const rolls = rollsTab(c), notes = document.createElement('div');
    // Session notes are kept with the character (c.notes), so they sync with it but never go into its character file.
    notesUi = SessionNotes.mount(notes, { load: () => c.notes || '', save: (t) => { if (t === (c.notes || '')) return; c.notes = t; c.updated = Date.now(); saveSoon(); },
      where: Cloud.user() ? 'They\'re kept with this character and sync with it.' : 'They\'re kept with this character on this phone.', fileName: () => `${c.name.replace(/[\\/:*?"<>|]/g, '')} notes.md` });
    sheet = CharSheet.mount($('#sheet'), {
      model: { ...c.model, name: c.name }, mode: 'solo', toast: (t) => toast(t),
      onChange: (m) => { c.model = CharSheet.clean(m); c.updated = Date.now(); saveSoon(); },
      onRoll: (e) => { c.rolls = [e, ...(c.rolls || [])].slice(0, 60); saveSoon(); rolls.redraw(); },
      extraTabs: [{ id: 'notes', label: '📝 Notes', el: notes }, { id: 'rolls', label: '🎲 Rolls', el: rolls }, { id: 'file', label: '💾 File', el: fileTab(c) }],
    });
    window.scrollTo(0, 0);
  }

  // ---------- Cloud sync (shared/cloud.js; dmdesk_* functions in Pawmodoro's schema) ----------
  // Local-first: every character stays in localStorage. A character needs pushing when it changed since the stamp
  // it was last pushed at (c.updated > c.pushed); c.cloudRev is the server revision it's based on. Edited on two
  // phones at once, both versions are kept. Deleted characters wait in TOMB until the cloud has heard.
  const TOMB = 'dd.sheet.tomb', SINCE = 'dd.sheet.since', OWNER = 'dd.sheet.cloudUser';
  let syncing = false, syncTimer = null, again = false, lastSync = null, syncError = null;
  const tombs = () => { try { return JSON.parse(localStorage.getItem(TOMB) || '[]'); } catch { return []; } };
  const setTombs = (t) => localStorage.setItem(TOMB, JSON.stringify(t));
  function addTomb(c) { setTombs([...tombs().filter(t => t.id !== c.id), { id: c.id, rev: c.cloudRev }]); }
  function scheduleSync(ms = 2000) { clearTimeout(syncTimer); if (Cloud.user()) syncTimer = setTimeout(sync, ms); }
  const payload = (c) => ({ model: c.model, created: c.created || null, notes: c.notes || '' });
  const notesOf = (d) => typeof d.notes === 'string' ? d.notes.slice(0, 200000) : '';

  // Signed in as someone else than last time. Characters that came from the other account's cloud wait for a
  // choice (syncCard): add them to this account too, or take them off this phone (they stay in the other account).
  // Characters that never synced just go up to this account. Returns false while the choice is waiting.
  const OWNER_EMAIL = 'dd.sheet.cloudEmail';
  const fromOther = () => { const u = Cloud.user(), o = localStorage.getItem(OWNER); return u && o && o !== u.id ? chars.filter(c => c.cloudRev != null) : []; };
  function adoptAccount(keep) {
    const u = Cloud.user();
    if (!u || localStorage.getItem(OWNER) === u.id) return true;
    const other = fromOther();
    if (other.length && keep === undefined) return false;
    if (keep === false) chars = chars.filter(c => !other.includes(c));
    chars.forEach(c => { delete c.cloudRev; delete c.pushed; });
    localStorage.setItem(OWNER, u.id); localStorage.setItem(OWNER_EMAIL, u.email); localStorage.removeItem(SINCE); setTombs([]);
    try { localStorage.setItem(KEY, JSON.stringify(chars)); } catch { /* full; the next save says so */ }
    return true;
  }

  function applyRemote(row, changed) {
    const local = byId(row.id), mine = local && local.cloudRev != null && local.updated > (local.pushed || 0);
    if (local && local.cloudRev === row.rev) return;          // our own save coming back
    if (row.deleted) {
      if (!local) return;
      if (mine) { local.cloudRev = row.rev; return; }           // changed here since: keep it, it goes up again
      chars = chars.filter(c => c !== local); changed.add(row.id); return;
    }
    const m = row.data && row.data.model ? CharSheet.applyAuto(CharSheet.clean(row.data.model)) : null;
    if (!m) return;
    if (!local) { chars.push({ id: row.id, name: row.name || 'Adventurer', model: m, notes: notesOf(row.data), created: row.data.created || Date.now(), updated: Date.now(), pushed: Date.now(), cloudRev: row.rev }); changed.add(row.id); return; }
    if (mine) return;                                           // both changed: the push below finds out and keeps both
    Object.assign(local, { name: row.name || local.name, model: m, notes: notesOf(row.data), cloudRev: row.rev });
    local.pushed = local.updated = Date.now();
    changed.add(row.id);
  }

  async function sync() {
    if (!Cloud.user() || document.hidden) return;
    if (syncing) { again = true; return; }
    syncing = true; again = false;
    const changed = new Set();
    try {
      if (!adoptAccount()) return;
      const r = await Cloud.rpc('dmdesk_pull_characters', { p_since: Number(localStorage.getItem(SINCE) || 0) });
      r.rows.forEach(row => applyRemote(row, changed));
      localStorage.setItem(SINCE, r.since);
      for (const t of tombs()) {
        const res = await Cloud.rpc('dmdesk_delete_character', { p_id: t.id, p_base_rev: t.rev });
        // Changed on another phone after it was deleted here: it comes back rather than losing those changes.
        if (!res.ok && !byId(t.id)) { chars.push({ id: t.id, name: res.name || 'Adventurer', model: CharSheet.applyAuto(CharSheet.clean(res.data.model || {})), notes: notesOf(res.data), created: Date.now(), updated: Date.now(), pushed: Date.now(), cloudRev: res.rev }); changed.add(t.id); toast(`${res.name} was changed on another phone, so it was kept`); }
        setTombs(tombs().filter(x => x.id !== t.id));
      }
      for (const c of [...chars]) {
        if (c.cloudRev != null && c.updated <= (c.pushed || 0)) continue;
        const stamp = c.updated;
        let res = await Cloud.rpc('dmdesk_put_character', { p_id: c.id, p_name: c.name, p_data: payload(c), p_base_rev: c.cloudRev ?? 0 });
        if (!res.ok && res.deleted) res = await Cloud.rpc('dmdesk_put_character', { p_id: c.id, p_name: c.name, p_data: payload(c), p_base_rev: res.rev });
        if (res.ok) { c.cloudRev = res.rev; c.pushed = stamp; continue; }
        // Changed here and on another phone: this phone's version becomes a copy, the other one takes its place.
        const copy = { ...c, id: uid(), name: `${c.name} (this phone)`, cloudRev: undefined, pushed: 0, updated: Date.now(), rolls: [] };
        Object.assign(c, { name: res.name || c.name, model: CharSheet.applyAuto(CharSheet.clean(res.data.model || {})), notes: notesOf(res.data), cloudRev: res.rev });
        c.pushed = c.updated = Date.now();
        chars.push(copy); changed.add(c.id); changed.add(copy.id);
        toast(`${c.name} was changed on two phones: both versions are kept`);
        again = true;
      }
      try { localStorage.setItem(KEY, JSON.stringify(chars)); } catch { toast('Couldn\'t save: this phone\'s storage for the app is full', true); }
      lastSync = Date.now(); syncError = null;
    } catch (e) {
      syncError = e.message || String(e);
    } finally {
      syncing = false;
    }
    const cur = localStorage.getItem(CUR);
    if (sheet && cur && changed.has(cur)) {
      const c = byId(cur);
      if (c) {
        $('#title').textContent = c.name; sheet.set({ ...c.model, name: c.name });
        // Notes changed on another phone: show them, unless they're being typed in here.
        if (notesUi && !(document.activeElement && document.activeElement.classList.contains('sn-text'))) notesUi.reload();
      } else showList();
    }
    else if (!sheet) showList();
    if (again) scheduleSync(500);
  }

  function syncCard() {
    const u = Cloud.user();
    if (!u) return `<div class="card"><h3>☁ Sync your characters</h3><p class="hint">Sign in and your characters follow you to every phone, and stay safe if this one is lost. It uses a Pawmodoro account (the same as Beef's Brewhouse), so make one here if you don't have one.</p>
      <div class="signin"><input type="email" id="cl-email" placeholder="Email" autocomplete="username"><input type="password" id="cl-pass" placeholder="Password" autocomplete="current-password">
      <div class="row"><button class="btn primary" data-a="signin">Sign in</button><button class="btn" data-a="signup">Create account</button></div></div></div>`;
    const other = fromOther();
    if (other.length) {
      const was = localStorage.getItem(OWNER_EMAIL);
      return `<div class="card backup"><h3>☁ A different account</h3><p class="hint">${other.length === 1 ? `${esc(other[0].name)} syncs` : `${other.length} characters on this phone sync`} with ${was ? `<b>${esc(was)}</b>` : 'another account'}, and you're signed in as <b>${esc(u.email)}</b>. Nothing syncs until you choose.</p>
        <div class="row"><button class="btn primary" data-a="keep">Add ${other.length === 1 ? 'it' : 'them'} to this account</button><button class="btn" data-a="drop">Remove ${other.length === 1 ? 'it' : 'them'} from this phone</button><button class="btn" data-a="signout">Sign out</button></div>
        <p class="hint">Removing only clears this phone: ${other.length === 1 ? 'it stays' : 'they stay'} in the other account's cloud.</p></div>`;
    }
    const when = lastSync ? new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    return `<div class="card"><h3>☁ Synced</h3><p class="hint">Signed in as <b>${esc(u.email)}</b>. ${syncError ? `<span class="err">${esc(syncError)}</span>` : when ? `Last synced at ${when}.` : 'Syncing…'}</p>
      <div class="row"><button class="btn" data-a="sync">↻ Sync now</button><button class="btn" data-a="signout">Sign out</button></div></div>`;
  }
  async function cloudAction(a) {
    if (a === 'sync') { await sync(); return showList(); }
    if (a === 'keep' || a === 'drop') {
      if (a === 'drop' && !confirm('Remove these characters from this phone? They stay in the other account\'s cloud.')) return;
      adoptAccount(a === 'keep'); await sync(); return showList();
    }
    if (a === 'signout') { if (confirm('Sign out? Your characters stay on this phone, but stop syncing.')) { Cloud.signOut(); showList(); } return; }
    const email = $('#cl-email').value.trim(), pass = $('#cl-pass').value;
    if (!email || !pass) return toast('Enter your email and a password', true);
    try { await (a === 'signup' ? Cloud.signUp(email, pass) : Cloud.signIn(email, pass)); } catch (e) { return toast(e.message, true); }
    toast('Signed in. Syncing…');
    await sync();
    showList();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(300); });
  Cloud.onChange(() => { scheduleSync(300); if (!sheet) showList(); });
  setInterval(() => scheduleSync(0), 30000);

  $('#list-btn').addEventListener('click', showList);
  load();
  const cur = localStorage.getItem(CUR);
  if (cur && byId(cur)) openChar(cur); else showList();
  openLink();
  window.addEventListener('hashchange', openLink);
  scheduleSync(500);
})();
