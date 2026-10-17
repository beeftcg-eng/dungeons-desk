// Notes: an Obsidian-style vault of markdown files with wikilinks, backlinks, tags and templates.
window.Notes = (() => {
  const { h, $, $$, esc, toast } = U;
  let notes = [], folders = [], cache = new Map(); // path -> content
  let current = null, dirty = false, mode = localStorage.getItem('notes.mode') || 'split';
  let history = [], collapsed = new Set(JSON.parse(localStorage.getItem('notes.collapsed') || '[]'));
  let selectedFolder = '';
  let els = {};

  const byName = () => { const m = new Map(); notes.forEach(n => m.set(n.name.toLowerCase(), n)); return m; };
  function resolve(target) {
    const t = target.split('#')[0].trim().toLowerCase().replace(/\.md$/, '');
    if (!t) return null;
    if (t.includes('/')) return notes.find(n => n.path.toLowerCase().replace(/\.md$/, '') === t) || null;
    return byName().get(t) || null;
  }
  const stripCode = (s) => (s || '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const linksIn = (content) => [...stripCode(content).matchAll(/\[\[([^\]|\n]+?)(?:\|[^\]\n]+)?\]\]/g)].map(m => m[1].trim());
  const tagsIn = (content) => {
    const { meta, body } = MD.splitFrontmatter(content || '');
    const tags = new Set();
    const mt = meta && meta.tags; (Array.isArray(mt) ? mt : mt ? String(mt).split(/[,\s]+/) : []).forEach(t => t && tags.add(String(t)));
    body.replace(/```[\s\S]*?```/g, '').replace(/(^|\s)#([A-Za-z][\w/-]*)/g, (_, __, t) => tags.add(t));
    return [...tags];
  };

  async function refresh() {
    const r = await dm.notes.list();
    notes = r.notes.sort((a, b) => a.name.localeCompare(b.name)); folders = r.folders;
    const all = await dm.notes.readAll();
    cache = new Map(all.map(n => [n.path, n.content]));
    MD.setAttachments(await dm.attach.list());
    wikiDirty = true;
    renderTree();
    publishToPlayers();
  }

  // ---------- Player wiki: notes with `share: players` (or a list of names) in their properties ----------
  let wikiDirty = true, wikiCache = { wiki: [], wikiImages: [] };
  const shareOf = (content) => {
    const { meta } = MD.splitFrontmatter(content || '');
    const v = meta && meta.share;
    if (!v) return null;
    if (Array.isArray(v)) return v.map(String);
    return /^(players|all|party|true|yes)$/i.test(String(v)) ? 'all' : null;
  };
  function playerWiki() {
    if (!wikiDirty) return wikiCache;
    const shared = new Map();
    for (const n of notes) { const to = shareOf(cache.get(n.path)); if (to) shared.set(n.path, { n, to }); }
    const images = new Set();
    const wiki = [...shared.values()].map(({ n, to }) => {
      const div = MD.render(cache.get(n.path), { forPlayers: { linkable: (t) => { const r = resolve(t); return r && shared.has(r.path) ? r.path : null; } } });
      JSON.parse(div.dataset.images || '[]').forEach(i => images.add(i));
      const { meta } = MD.splitFrontmatter(cache.get(n.path));
      return { id: n.path, title: n.name, folder: n.folder, type: (meta && meta.type) || 'note', to, html: div.innerHTML, mtime: n.mtime };
    });
    wikiCache = { wiki, wikiImages: [...images] };
    wikiDirty = false;
    return wikiCache;
  }
  // Set or remove one frontmatter key, keeping the rest of the note untouched.
  function setProp(content, key, value) {
    const m = /^---\s*\n([\s\S]*?)\n---\s*(\n|$)/.exec(content);
    const line = value == null ? null : `${key}: ${Array.isArray(value) ? '[' + value.join(', ') + ']' : value}`;
    const re = new RegExp(`^${key}:.*$`, 'm');
    if (!m) return line ? `---\n${line}\n---\n${content}` : content;
    let fm = m[1];
    if (re.test(fm)) fm = line ? fm.replace(re, line) : fm.replace(re, '').replace(/\n{2,}/g, '\n').replace(/^\n|\n$/g, '');
    else if (line) fm = fm + '\n' + line;
    return `---\n${fm}\n---${m[2]}` + content.slice(m[0].length);
  }
  function shareDialog() {
    if (!current) return;
    const cur = shareOf(els.editor.value);
    const names = [...new Set([...Store.get().party.map(p => p.name).filter(Boolean), ...(Array.isArray(cur) ? cur : [])])];
    const allBox = h('input', { type: 'checkbox', checked: cur === 'all' });
    const picks = names.map(n => ({ n, box: h('input', { type: 'checkbox', checked: Array.isArray(cur) && cur.some(x => x.toLowerCase() === n.toLowerCase()) }) }));
    const apply = (value) => { els.editor.value = setProp(els.editor.value, 'share', value); dirty = true; saveNow(); renderPreview(); renderInfo(); updateShareBtn(); m.close(); };
    const m = U.modal('Share with players', [
      h('p', 'Shared notes appear in the 📚 Wiki tab on players\' phones. ', h('b', 'DM secret boxes'), ' and ', h('code', '%% comments %%'), ' are always removed, and links to notes you haven\'t shared show as plain text.'),
      h('label.chk', allBox, ' The whole party'),
      names.length ? h('div.recipient-list', picks.map(p => h('label.chk', p.box, ' ', p.n))) : h('p.dim', 'Add party members in Settings to share with individual players.'),
      h('div.row.end',
        cur ? h('button.danger', { onclick: () => apply(null) }, 'Stop sharing') : null,
        h('button', { onclick: () => m.close() }, 'Cancel'),
        h('button.primary', { onclick: () => { const chosen = picks.filter(p => p.box.checked).map(p => p.n); apply(allBox.checked ? 'players' : chosen.length ? chosen : null); } }, 'Save')),
    ]);
  }
  function updateShareBtn() {
    if (!els.shareBtn) return;
    const cur = current && shareOf(els.editor.value);
    els.shareBtn.classList.toggle('on', !!cur);
    els.shareBtn.textContent = cur ? (cur === 'all' ? '👥 Shared' : `👥 ${cur.length} player${cur.length > 1 ? 's' : ''}`) : '👥 Share';
  }

  // ---------- Images in notes ----------
  async function insertImages(files) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return false;
    for (const f of imgs) {
      try {
        const rel = await dm.attach.save(await U.readFileAsDataUrl(f), f.name || 'pasted image');
        insert(`![[${rel}]]\n`);
      } catch (e) { toast(String(e.message).replace(/^.*Error: /, ''), 'err'); }
    }
    MD.setAttachments(await dm.attach.list());
    renderPreview();
    return true;
  }

  // ---------- Version history ----------
  async function showHistory() {
    if (!current) return;
    await saveNow();
    const list = await dm.history.list(current);
    const preview = h('div.preview.md.hist-preview');
    let picked = null;
    const items = h('div.hist-list', list.length ? list.map(v => h('div.hist-item', { onclick: async (e) => {
      U.$$('.hist-item', items).forEach(x => x.classList.remove('active')); e.currentTarget.classList.add('active');
      picked = await dm.history.read(current, v.ts);
      preview.innerHTML = ''; preview.append(MD.render(picked, { resolve: (t) => !!resolve(t) }));
      restore.disabled = false;
    } }, h('b', new Date(v.ts).toLocaleString()), h('span.dim.small', ` ${(v.size / 1024).toFixed(1)} KB`))) : h('p.dim', 'No earlier versions yet. A version is saved automatically every 10 minutes while you edit, and before a note is deleted.'));
    const restore = h('button.primary', { disabled: true, onclick: async () => {
      if (!picked) return;
      await dm.history.snapshot(current); // keep what's there now as a version too
      els.editor.value = picked; dirty = true; await saveNow(); renderPreview(); m.close(); toast('Version restored');
    } }, '↶ Restore this version');
    const m = U.modal(`History — ${els.title.value}`, [h('div.hist-layout', items, preview), h('div.row.end', h('button', { onclick: () => m.close() }, 'Close'), restore)], { wide: true });
  }

  // ---------- Layout ----------
  function mount(root) {
    els.search = h('input.search', { placeholder: 'Search notes, #tags…', oninput: renderTree });
    els.tree = h('div.tree');
    els.title = h('input.note-title', { placeholder: 'Note title', onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); }, onchange: renameCurrent });
    els.editor = h('textarea.editor', { spellcheck: 'true', placeholder: 'Start writing… Type / at the start of a line for D&D formats (NPC, character, lore…). Use [[Note Name]] to link notes and #tags to tag them.' });
    els.preview = h('div.preview.md', { onclick: onPreviewClick });
    els.wrap = h('div.editor-wrap', els.editor, els.preview);
    els.info = h('aside.notes-info');
    els.ac = h('div.autocomplete.hidden');
    els.empty = h('div.empty-state', h('div.big', '📜'), h('h2', 'Your campaign wiki'), h('p', 'Create a note from a template or pick one from the left.'),
      h('div.template-grid', Object.entries(Templates).map(([k, t]) => h('button.template-card', { onclick: () => newNote(k) }, h('span', t.icon), t.label))));

    const modeBtn = (m, label, title) => h('button.seg' + (mode === m ? '.on' : ''), { 'data-mode': m, title, onclick: () => setMode(m) }, label);
    const fmt = (label, title, fn) => h('button.fmt', { title, onclick: () => { fn(); els.editor.focus(); } }, label);

    els.layout = h('div.notes-layout');
    els.toolbar = h('div.note-toolbar',
      U.mBack(els.layout),
      h('button.icon', { title: 'Back', onclick: back }, '←'),
      els.title,
      h('button.small.insert-btn', { title: 'Insert a format, block or random content (or type / at the start of a line)', onmousedown: (e) => e.preventDefault(),
        onclick: () => { els.editor.focus(); els.ac.classList.contains('hidden') ? showMacros('', 0) : els.ac.classList.add('hidden'); } }, '＋ Insert'),
      h('div.fmt-group',
        fmt('B', 'Bold (Ctrl+B)', () => wrapSel('**', '**')),
        fmt('I', 'Italic (Ctrl+I)', () => wrapSel('*', '*')),
        fmt('H2', 'Heading', () => prefixLine('## ')),
        fmt('H3', 'Subheading', () => prefixLine('### ')),
        fmt('•', 'Bullet list', () => prefixLine('- ')),
        fmt('☐', 'Checklist', () => prefixLine('- [ ] ')),
        fmt('[[ ]]', 'Link to note', () => wrapSel('[[', ']]')),
        fmt('▦', 'Table', () => insert('\n| Column | Column |\n|---|---|\n|  |  |\n')),
        fmt('📖', 'Read-aloud box', () => insert('\n> [!read-aloud]\n> \n')),
        fmt('🔒', 'DM secret', () => insert('\n> [!secret] DM Only\n> \n')),
        fmt('🐉', 'Stat block builder', openStatblockBuilder),
        fmt('🖼', 'Insert image (or paste / drag an image into the editor)', () => els.imgFile.click()),
      ),
      h('div.seg-group', modeBtn('edit', 'Edit', 'Editor only'), modeBtn('split', 'Split', 'Editor + preview'), modeBtn('read', 'Read', 'Reading view')),
      els.pinBtn = h('button.icon', { title: 'Pin to the Session screen', onclick: () => { if (current) { const on = Session.togglePin(current); els.pinBtn.classList.toggle('on', on); toast(on ? 'Pinned to Session' : 'Unpinned'); } } }, '📌'),
      els.shareBtn = h('button.small.share-btn', { title: 'Share this note with players (Wiki tab on their phones)', onclick: shareDialog }, '👥 Share'),
      h('button.icon', { title: 'Version history', onclick: showHistory }, '🕘'),
      h('button.icon', { title: 'Delete note', onclick: deleteCurrent }, '🗑'),
    );

    els.layout.append(
      h('aside.notes-side',
        h('div.side-head',
          h('button.primary.small', { onclick: () => pickTemplate() }, '+ New note'),
          h('button.icon', { title: 'New folder', onclick: newFolder }, '📁'),
          h('button.icon', { title: 'Graph view', onclick: () => Graph.open(notes, cache, resolve, open) }, '🕸'),
          h('button.icon', { title: 'Quick switcher (Ctrl+O)', onclick: quickSwitch }, '🔍')),
        els.search, els.tree),
      h('div.notes-main', els.toolbar, h('div.editor-area', els.wrap, els.ac, els.empty)),
      els.info);
    root.append(els.layout);

    els.editor.addEventListener('input', () => { dirty = true; renderPreviewSoon(); saveSoon(); autocomplete(); });
    els.imgFile = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none', onchange: async (e) => { await insertImages(e.target.files); e.target.value = ''; } });
    document.body.append(els.imgFile);
    els.editor.addEventListener('paste', async (e) => { const files = [...e.clipboardData.files]; if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); await insertImages(files); } });
    els.editor.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    els.editor.addEventListener('drop', async (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); els.editor.focus(); await insertImages(e.dataTransfer.files); } });
    els.editor.addEventListener('keydown', onEditorKey);
    els.editor.addEventListener('blur', () => setTimeout(() => els.ac.classList.add('hidden'), 150));
    document.addEventListener('keydown', (e) => {
      if (!$('#view-notes').classList.contains('active')) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); quickSwitch(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); pickTemplate(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setMode(mode === 'read' ? 'split' : 'read'); }
    });
    setMode(mode);
    showEditor(false);
    refresh().then(() => {
      const last = localStorage.getItem('notes.last');
      const w = last && cache.has(last) ? last : (notes.find(n => /start here/i.test(n.name)) || notes.find(n => /welcome/i.test(n.name)) || {}).path;
      // On a phone the app starts on the list of notes, with the last one a tap away.
      if (w) open(w, { push: false, reveal: false }).then(() => els.layout.classList.remove('m-detail'));
    });
  }

  function showEditor(on) {
    els.wrap.style.display = on ? '' : 'none';
    els.toolbar.style.visibility = on ? '' : 'hidden';
    els.empty.style.display = on ? 'none' : '';
    els.info.style.display = on ? '' : 'none';
    els.layout.classList.toggle('m-detail', on);
  }

  function setMode(m) {
    mode = m; localStorage.setItem('notes.mode', m);
    els.wrap.className = 'editor-wrap mode-' + m;
    $$('.seg', els.toolbar).forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    renderPreview();
  }

  // ---------- Tree ----------
  function renderTree() {
    const q = els.search.value.trim().toLowerCase();
    els.tree.innerHTML = '';
    if (q) {
      const tag = q.startsWith('#') ? q.slice(1) : null;
      const hits = notes.filter(n => {
        const c = cache.get(n.path) || '';
        return tag ? tagsIn(c).some(t => t.toLowerCase().startsWith(tag)) : (n.name.toLowerCase().includes(q) || c.toLowerCase().includes(q));
      });
      els.tree.append(h('div.tree-label', `${hits.length} result${hits.length === 1 ? '' : 's'}`));
      hits.forEach(n => {
        const c = cache.get(n.path) || '';
        const i = tag ? -1 : c.toLowerCase().indexOf(q);
        els.tree.append(h('div.tree-note' + (n.path === current ? '.active' : ''), { onclick: () => open(n.path) },
          h('div', icon(n), ' ', n.name),
          i >= 0 && !n.name.toLowerCase().includes(q) ? h('div.snippet', '…' + c.slice(Math.max(0, i - 30), i + 50).replace(/\n/g, ' ') + '…') : null));
      });
      return;
    }
    // Build folder tree
    const rootNode = { name: '', path: '', children: new Map(), notes: [] };
    const ensure = (p) => {
      let node = rootNode;
      if (!p) return node;
      let acc = '';
      for (const part of p.split('/')) {
        acc = acc ? acc + '/' + part : part;
        if (!node.children.has(part)) node.children.set(part, { name: part, path: acc, children: new Map(), notes: [] });
        node = node.children.get(part);
      }
      return node;
    };
    folders.forEach(ensure);
    notes.forEach(n => ensure(n.folder).notes.push(n));
    const draw = (node, depth) => {
      const frag = [];
      [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(ch => {
        const isCol = collapsed.has(ch.path);
        const row = h('div.tree-folder' + (selectedFolder === ch.path ? '.selected' : ''), { style: `padding-left:${8 + depth * 14}px`,
          onclick: () => { isCol ? collapsed.delete(ch.path) : collapsed.add(ch.path); selectedFolder = ch.path; localStorage.setItem('notes.collapsed', JSON.stringify([...collapsed])); renderTree(); } },
          h('span.caret', isCol ? '▸' : '▾'), ' ', ch.name, h('span.count', String(countNotes(ch))));
        dropTarget(row, ch.path);
        frag.push(row);
        if (!isCol) frag.push(...draw(ch, depth + 1));
      });
      node.notes.forEach(n => {
        frag.push(h('div.tree-note' + (n.path === current ? '.active' : ''), { style: `padding-left:${12 + depth * 14}px`, draggable: 'true',
          ondragstart: (e) => e.dataTransfer.setData('text/note', n.path), onclick: () => open(n.path),
          oncontextmenu: (e) => { e.preventDefault(); noteMenu(e, n); } }, icon(n), ' ', n.name));
      });
      return frag;
    };
    const rootRow = h('div.tree-label', { onclick: () => { selectedFolder = ''; renderTree(); } }, 'VAULT');
    dropTarget(rootRow, '');
    els.tree.append(rootRow, ...draw(rootNode, 0));
  }
  const countNotes = (node) => { let c = node.notes.length; node.children.forEach(ch => (c += countNotes(ch))); return c; };
  const icon = (n) => {
    const { meta } = MD.splitFrontmatter(cache.get(n.path) || '');
    const t = meta && meta.type;
    const map = { npc: '🧑', character: '🛡', monster: '🐉', encounter: '⚔', location: '🏰', lore: '📚', faction: '🏴', session: '🗓', campaign: '🗺', spell: '✨', item: '💎' };
    return map[t] || '📄';
  };
  function dropTarget(el, folder) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); el.classList.remove('drop');
      const p = e.dataTransfer.getData('text/note'); if (!p) return;
      const n = notes.find(x => x.path === p); if (!n || n.folder === folder) return;
      await moveNote(p, (folder ? folder + '/' : '') + n.name + '.md');
    });
  }
  function noteMenu(e, n) {
    const menu = h('div.ctx-menu', { style: `left:${e.clientX}px;top:${e.clientY}px` },
      h('button', { onclick: () => { open(n.path); setTimeout(() => els.title.select(), 50); } }, 'Rename'),
      h('button', { onclick: async () => { const f = await U.prompt('Move to folder (blank = vault root)', n.folder); if (f !== null) moveNote(n.path, (f ? f.replace(/^\/|\/$/g, '') + '/' : '') + n.name + '.md'); } }, 'Move…'),
      h('button', { onclick: () => { open(n.path).then(deleteCurrent); } }, 'Delete'));
    document.body.append(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  // ---------- Open / save ----------
  async function open(path, { push = true, reveal = true } = {}) {
    if (dirty) await saveNow();
    if (!cache.has(path)) { try { cache.set(path, await dm.notes.read(path)); } catch { toast('Note not found', 'err'); return; } }
    if (push && current && current !== path) history.push(current);
    current = path;
    localStorage.setItem('notes.last', path);
    const n = notes.find(x => x.path === path);
    els.title.value = n ? n.name : path.replace(/\.md$/, '');
    els.pinBtn.classList.toggle('on', Session.isPinned(path));
    els.editor.value = cache.get(path);
    dirty = false;
    showEditor(true);
    renderPreview(); renderInfo(); renderTree();
    if (reveal) App.show('notes');
  }
  function back() { const p = history.pop(); if (p && cache.has(p)) open(p, { push: false }); }

  async function saveNow() {
    if (!current || !dirty) return;
    const content = els.editor.value;
    await dm.notes.write(current, content);
    cache.set(current, content);
    dirty = false;
    renderInfo();
    if (shareOf(content) || wikiCache.wiki.some(w => w.id === current)) { wikiDirty = true; publishToPlayers(); }
  }
  const saveSoon = U.debounce(saveNow, 700);
  const renderPreviewSoon = U.debounce(() => renderPreview(), 200);

  function renderPreview() {
    if (!current || mode === 'edit') return;
    const scroll = els.preview.scrollTop;
    els.preview.innerHTML = '';
    els.preview.append(MD.render(els.editor.value, { resolve: (t) => !!resolve(t) }));
    els.preview.scrollTop = scroll;
  }

  function renderInfo() {
    if (!current) return;
    const name = (notes.find(n => n.path === current) || {}).name || '';
    const back = notes.filter(n => n.path !== current && linksIn(cache.get(n.path)).some(t => { const r = resolve(t); return r && r.path === current; }));
    const out = [...new Set(linksIn(els.editor.value))];
    const tags = tagsIn(els.editor.value);
    const sb = Statblock.fromNote(els.editor.value);
    const { meta } = MD.splitFrontmatter(els.editor.value);
    const isEncounter = meta && meta.type === 'encounter';
    updateShareBtn();
    els.info.innerHTML = '';
    els.info.append(
      h('h4', `Backlinks (${back.length})`),
      back.length ? back.map(n => h('a.info-link', { onclick: () => open(n.path) }, icon(n), ' ', n.name)) : h('p.dim', `No notes link to “${name}” yet.`),
      h('h4', `Links (${out.length})`),
      out.map(t => { const r = resolve(t); return h('a.info-link' + (r ? '' : '.missing'), { onclick: () => followLink(t) }, r ? icon(r) : '＋', ' ', t); }),
      h('h4', 'Tags'),
      tags.length ? h('div.tag-list', tags.map(t => h('a.tag', { onclick: () => searchTag(t) }, '#' + t))) : h('p.dim', 'No tags'),
      sb || isEncounter ? h('div', h('h4', 'Quick actions'),
        isEncounter ? h('button.small', { onclick: () => Initiative.loadEncounterNote(els.editor.value) }, '⚔ Open in encounter builder') : null,
        sb && !isEncounter ? h('button.small', { onclick: () => Initiative.addFromStatblock(sb) }, '⏳ Add to initiative') : null,
        sb && !isEncounter ? h('button.small', { onclick: () => Initiative.addToEncounter({ ...sb, name: sb.name || els.title.value, _note: els.title.value }) }, '⚔ Add to encounter') : null,
        sb && !isEncounter ? h('button.small', { onclick: openStatblockBuilder }, '🐉 Edit stat block') : null) : null,
      relationsIn(els.editor.value).length ? h('div', h('h4', 'Relationships'), relationsIn(els.editor.value).map(r => h('a.info-link', { onclick: () => followLink(r.target) }, h('span.rel-dot', { style: `background:${relColor(r.label)}` }), ' ', r.target, h('span.dim', ` — ${r.label}`)))) : null,
    );
  }

  function searchTag(t) { els.search.value = '#' + t; renderTree(); }

  async function followLink(target) {
    const r = resolve(target);
    if (r) return open(r.path);
    const name = target.split('#')[0].trim();
    const path = (selectedFolderFor(current) ? selectedFolderFor(current) + '/' : '') + sanitize(name) + '.md';
    await create(name, `# ${name}\n\n`, path);
  }
  const selectedFolderFor = (p) => (notes.find(n => n.path === p) || {}).folder || '';

  function onPreviewClick(e) {
    const a = e.target.closest('a');
    if (a && a.classList.contains('wikilink')) { e.preventDefault(); followLink(a.dataset.target); return; }
    if (a && a.classList.contains('tag')) { e.preventDefault(); searchTag(a.dataset.tag); return; }
    if (e.target.matches('input[type=checkbox]')) {
      // Toggle the matching "- [ ]" in the source.
      const idx = $$('input[type=checkbox]', els.preview).indexOf(e.target);
      let i = -1;
      els.editor.value = els.editor.value.replace(/^(\s*[-*+]\s+\[)([ xX])(\])/gm, (m, a1, x, b) => (++i === idx ? a1 + (x === ' ' ? 'x' : ' ') + b : m));
      dirty = true; saveSoon(); renderPreview();
    }
  }

  // ---------- Create / rename / delete ----------
  const sanitize = (s) => s.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Untitled';

  async function uniquePath(folder, name) {
    let base = (folder ? folder + '/' : '') + sanitize(name), p = base + '.md', i = 2;
    while (cache.has(p) || await dm.notes.exists(p)) p = `${base} ${i++}.md`;
    return p;
  }

  async function create(name, content, path, folder = '') {
    path = path || await uniquePath(folder, name);
    await dm.notes.write(path, content);
    await refresh();
    await open(path);
    return path;
  }

  function pickTemplate() {
    const m = U.modal('New note', h('div.template-grid', Object.entries(Templates).map(([k, t]) =>
      h('button.template-card', { onclick: () => { m.close(); newNote(k); } }, h('span', t.icon), t.label))));
  }

  async function newNote(type) {
    const t = Templates[type];
    const name = await U.prompt(`New ${t.label}`, '', 'Name');
    if (!name) return;
    const folder = type === 'blank' ? selectedFolder : t.folder;
    const path = await uniquePath(folder, name);
    await create(name, t.body(path.split('/').pop().replace(/\.md$/, '')), path);
    setTimeout(() => els.editor.focus(), 50);
  }

  async function newFolder() {
    const name = await U.prompt('New folder', selectedFolder ? selectedFolder + '/' : '', 'Folder name');
    if (!name) return;
    await dm.notes.mkdir(name.replace(/^\/|\/$/g, ''));
    await refresh();
  }

  async function moveNote(from, to) {
    if (dirty) await saveNow();
    try { await dm.notes.rename(from, to); } catch (e) { toast(e.message.replace(/^.*Error: /, ''), 'err'); return false; }
    const content = cache.get(from); cache.delete(from); cache.set(to, content);
    if (current === from) { current = to; localStorage.setItem('notes.last', to); }
    if (window.Session && Session.isPinned(from)) { Session.togglePin(from); Session.togglePin(to); }
    await refresh();
    return true;
  }

  async function renameCurrent() {
    if (!current) return;
    const n = notes.find(x => x.path === current);
    const newName = sanitize(els.title.value);
    if (!n || newName === n.name) { els.title.value = n ? n.name : ''; return; }
    const to = (n.folder ? n.folder + '/' : '') + newName + '.md';
    const oldName = n.name;
    if (!await moveNote(current, to)) { els.title.value = oldName; return; }
    // Update [[links]] that pointed at the old name.
    const re = new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]*)?\\]\\]`, 'gi');
    let changed = 0;
    for (const [p, c] of cache) {
      if (!re.test(c)) continue;
      re.lastIndex = 0;
      const nc = c.replace(re, (_, alias) => `[[${newName}${alias || ''}]]`);
      await dm.notes.write(p, nc); cache.set(p, nc); changed++;
    }
    if (changed) { els.editor.value = cache.get(current); toast(`Renamed and updated links in ${changed} note${changed > 1 ? 's' : ''}`); }
    renderPreview(); renderInfo();
  }

  async function deleteCurrent() {
    if (!current) return;
    const n = notes.find(x => x.path === current);
    if (!await U.confirm('Delete note', `Move “${n ? n.name : current}” to the trash?`)) return;
    await dm.notes.delete(current);
    cache.delete(current);
    current = null; dirty = false;
    showEditor(false);
    await refresh();
  }

  // ---------- Editor helpers ----------
  function wrapSel(a, b) {
    const ta = els.editor, s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(a + ta.value.slice(s, e) + b, s, e, 'end');
    if (s === e) ta.selectionStart = ta.selectionEnd = s + a.length;
    ta.dispatchEvent(new Event('input'));
  }
  function prefixLine(p) {
    const ta = els.editor, s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    ta.setRangeText(p, s, s, 'end'); ta.dispatchEvent(new Event('input'));
  }
  function insert(text) { const ta = els.editor; ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }

  function onEditorKey(e) {
    if (!els.ac.classList.contains('hidden')) {
      const items = $$('.ac-item', els.ac), cur = items.findIndex(i => i.classList.contains('on'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((it, i) => it.classList.toggle('on', i === next)); return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && items[cur]) { e.preventDefault(); items[cur].click(); return; }
      if (e.key === 'Escape') { els.ac.classList.add('hidden'); return; }
    }
    if (e.altKey && /^[1-8]$/.test(e.key)) { e.preventDefault(); const m = Macros.hotkey(e.key); if (m) runMacro(m); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(() => toast('Saved')); }
    if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSel('**', '**'); }
    if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSel('*', '*'); }
    if (e.key === 'Tab' && !e.ctrlKey) { e.preventDefault(); insert('  '); }
    if (e.key === 'Enter') {
      // Continue lists
      const ta = els.editor, s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const line = ta.value.slice(lineStart, s);
      const m = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+\. |> )(.*)$/.exec(line);
      if (m) {
        e.preventDefault();
        if (!m[3].trim()) { ta.setRangeText('', lineStart, s, 'end'); ta.dispatchEvent(new Event('input')); return; }
        let bullet = m[2].replace(/\[[xX]\]/, '[ ]');
        if (/^\d+\./.test(bullet)) bullet = (parseInt(bullet) + 1) + '. ';
        insert('\n' + m[1] + bullet);
      }
    }
  }

  // ---------- Macros ("/" menu, Alt+1…8, ＋ Insert) ----------
  function showMacros(q, eraseLen) {
    const items = Macros.filter(q);
    if (!items.length) { els.ac.classList.add('hidden'); return; }
    els.ac.innerHTML = '';
    let group = null;
    items.forEach((m, i) => {
      if (m.group !== group) { group = m.group; els.ac.append(h('div.ac-group', group)); }
      els.ac.append(h('div.ac-item' + (i === 0 ? '.on' : ''), { onmousedown: (e) => e.preventDefault(), onclick: () => runMacro(m, eraseLen) },
        m.icon, ' ', m.label, m.hotkey ? h('span.ac-key', m.hotkey) : null));
    });
    els.ac.classList.remove('hidden');
  }

  async function runMacro(m, eraseLen = 0) {
    els.ac.classList.add('hidden');
    const ta = els.editor;
    if (eraseLen) ta.setRangeText('', ta.selectionStart - eraseLen, ta.selectionStart, 'end');
    const start = ta.selectionStart, end = ta.selectionEnd;
    const rest = ta.value.trim();
    const ctx = { selection: ta.value.slice(start, end).trim(), noteTitle: els.title.value, isEmpty: !rest || rest === `# ${els.title.value}` };
    const r = await m.run(ctx);
    if (!r) { ta.focus(); return; }
    if (r.replaceAll != null) { ta.value = r.replaceAll; ta.selectionStart = ta.selectionEnd = ta.value.length; }
    else ta.setRangeText(r.text, start, end, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  function autocomplete() {
    const ta = els.editor, before = ta.value.slice(0, ta.selectionStart);
    const slash = /(^|\n)\/([\w-]*)$/.exec(before);
    if (slash) { showMacros(slash[2], slash[2].length + 1); return; }
    const m = /\[\[([^\]\n|]*)$/.exec(before);
    if (!m) { els.ac.classList.add('hidden'); return; }
    const q = m[1].toLowerCase();
    const hits = notes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8);
    els.ac.innerHTML = '';
    hits.forEach((n, i) => els.ac.append(h('div.ac-item' + (i === 0 ? '.on' : ''), {
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        const start = ta.selectionStart - m[1].length;
        const after = ta.value.slice(ta.selectionStart, ta.selectionStart + 2) === ']]' ? '' : ']]';
        ta.setRangeText(n.name + after, start, ta.selectionStart, 'end');
        if (!after) ta.selectionStart = ta.selectionEnd = ta.selectionStart + 2;
        els.ac.classList.add('hidden'); ta.dispatchEvent(new Event('input'));
      } }, icon(n), ' ', n.name, n.folder ? h('span.dim', '  ' + n.folder) : null)));
    if (q && !hits.some(n => n.name.toLowerCase() === q)) els.ac.append(h('div.ac-hint', `Enter ]] to link to new note “${m[1]}”`));
    els.ac.classList.toggle('hidden', !hits.length && !q);
  }

  function quickSwitch() {
    const input = h('input', { placeholder: 'Jump to note…' });
    const list = h('div.qs-list');
    const draw = () => {
      const q = input.value.toLowerCase();
      list.innerHTML = '';
      notes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 12).forEach((n, i) =>
        list.append(h('div.qs-item' + (i === 0 ? '.on' : ''), { onclick: () => { m.close(); open(n.path); } }, icon(n), ' ', n.name, h('span.dim', '  ' + (n.folder || '')))));
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => {
      const items = $$('.qs-item', list), cur = items.findIndex(i => i.classList.contains('on'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const nx = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((it, i) => it.classList.toggle('on', i === nx)); }
      if (e.key === 'Enter' && items[cur]) items[cur].click();
    });
    const m = U.modal('Quick switcher', [input, list]);
    draw();
  }

  function openStatblockBuilder() {
    if (!current) return;
    const existing = Statblock.fromNote(els.editor.value) || { name: els.title.value };
    Statblock.openBuilder(existing, (sb) => {
      els.editor.value = Statblock.replaceInNote(els.editor.value, sb);
      dirty = true; saveNow(); renderPreview(); renderInfo();
    });
  }

  // Notes containing a stat block, for the initiative tracker.
  const withStatblocks = () => notes.map(n => ({ note: n, sb: Statblock.fromNote(cache.get(n.path)) })).filter(x => x.sb);
  const list = () => notes;

  // Relationship lines: "- [[Target]] — label" (or "label: [[Target]]") inside a "Relationships" section.
  function relationsIn(content) {
    const m = /^#{1,6}\s*Relationships?\s*$([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/m.exec(stripCode(content || ''));
    if (!m) return [];
    const out = [];
    for (const line of m[1].split('\n')) {
      const a = /^\s*[-*]\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*[—–:-]+\s*(.+)$/.exec(line);
      const b = /^\s*[-*]\s*([^[\]]+?)\s*[:—–-]+\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(line);
      if (a && a[1].trim()) out.push({ target: a[1].trim(), label: a[2].trim().replace(/\.$/, '') });
      else if (b && b[2].trim()) out.push({ target: b[2].trim(), label: b[1].trim() });
    }
    return out;
  }
  const relColor = (label) => /ally|friend|family|love|sibling|brother|sister|mother|father|parent|child|spouse|wife|husband|mentor|protect/i.test(label) ? '#4caf50'
    : /enemy|rival|hate|hunt|nemesis|betray|feud|kill|owes/i.test(label) ? '#d9443a'
    : /work|serve|member|leader|lead|boss|employ|agent|spy|sworn|loyal|follower/i.test(label) ? '#5fb3e8' : '#b9b2c9';

  return { mount, open, create, refresh, flush: saveNow, playerWiki, shareOf, relationsIn, relColor, notesCache: () => cache, withStatblocks, list, resolve, uniquePath };
})();
