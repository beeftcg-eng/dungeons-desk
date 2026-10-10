// Handouts: design notes, letters and posters, then reveal them to the whole party or specific players' phones.
window.Handouts = (() => {
  const { h, toast } = U;
  let selected = null, els = {};

  const PRESETS = {
    'Mysterious note': { style: 'torn', font: 'scrawl', title: '', body: 'They know you\'re coming.\n\nTrust no one at the *Gilded Flagon*. Midnight. Come alone.', signature: '— a friend' },
    'Journal entry': { style: 'journal', font: 'hand', title: 'Day 14', body: 'The scratching in the walls grows louder each night. Brother Aldous insists it is only rats, but rats do not whisper.\n\nI have hidden the key beneath the third step of the bell tower.', signature: '' },
    'Wanted poster': { style: 'wanted', font: 'formal', title: 'WANTED', body: '## Dead or Alive\n\n**"One-Eyed" Garrick Vance**\n\nFor crimes of banditry, arson and the theft of the Duke\'s silver.\n\n## Reward: 500 gp', signature: '' },
    'Royal decree': { style: 'decree', font: 'book', title: 'By Order of the Crown', body: 'Let it be known that all citizens of the realm are hereby forbidden from entering the Thornwood after dusk, on pain of imprisonment.\n\nThe Crown shall reward any who bring word of the beast.', signature: 'Queen Isolde III', seal: 'IR' },
    'Arcane scroll': { style: 'arcane', font: 'book', title: 'Ritual of Binding', body: 'When three moons align above the sunken spire, speak the words in reverse and the seal shall weaken.\n\n> *Vel\'thar ossun, mi\'dra kel.*', signature: '' },
    'Blank parchment': { style: 'parchment', font: 'hand', title: 'Untitled', body: '', signature: '' },
  };

  const all = () => Store.get().handouts;
  const cur = () => all().find(x => x.id === selected);

  function mount(root) {
    els.list = h('div.ho-list');
    els.editor = h('div.ho-editor');
    root.append(h('div.page.page-flush',
      h('div.ho-layout',
        h('aside.ho-side',
          h('div.side-head', h('h2', 'Handouts'), h('button.primary.small', { onclick: newHandout }, '+ New')),
          els.list),
        els.editor)));
    Store.onLoad(() => { selected = null; draw(); });
    dm.server.onPlayers(() => { if (cur()) drawEditor(); });
    draw();
  }

  function draw() { drawList(); drawEditor(); }

  function status(x) {
    if (!x.revealed) return h('span.chip', 'Hidden');
    return h('span.chip.live', x.toAll ? 'Party' : (x.to || []).join(', ') || 'Nobody');
  }

  function drawList() {
    els.list.innerHTML = '';
    if (!all().length) els.list.append(h('p.dim', 'No handouts yet.'));
    [...all()].reverse().forEach(x => els.list.append(h('div.ho-item' + (x.id === selected ? '.active' : ''), { onclick: () => { selected = x.id; draw(); } },
      h('div.ho-item-title', x.title || '(untitled)'), status(x))));
  }

  function newHandout() {
    const m = U.modal('New handout', h('div.template-grid', Object.entries(PRESETS).map(([name, p]) =>
      h('button.template-card', { onclick: () => {
        const x = { id: U.uid(), title: p.title, style: p.style, font: p.font, body: p.body, signature: p.signature || '', seal: p.seal || '', image: null, revealed: false, toAll: true, to: [], created: Date.now() };
        all().push(x); selected = x.id; Store.save(); draw(); m.close();
      } }, h('span', '✉'), name))));
  }

  function recipients() {
    const names = new Map();
    Store.get().party.forEach(p => p.name && names.set(p.name.toLowerCase(), p.name));
    (App.players || []).forEach(p => names.has(p.name.toLowerCase()) || names.set(p.name.toLowerCase(), p.name));
    return [...names.values()];
  }

  function drawEditor() {
    const x = cur();
    els.editor.innerHTML = '';
    if (!x) { els.editor.append(h('div.empty-state', h('div.big', '✉'), h('h2', 'Player handouts'), h('p', 'Write a letter, journal page or wanted poster, then reveal it on your players\' phones.'), h('button.primary', { onclick: newHandout }, '+ New handout'))); return; }

    const preview = h('div.ho-preview');
    const refresh = () => {
      preview.innerHTML = renderHandout({ ...x, bodyHtml: MD.simple(x.body), imageUrl: x.image ? App.mediaUrl(x.image) : null });
      Store.save(); drawList();
      if (x.revealed) publishToPlayers();
    };
    const bind = (key, el) => { el.value = x[key] ?? ''; el.addEventListener('input', () => { x[key] = el.value; refresh(); }); return el; };
    const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      x.image = await dm.media.save(await U.readFileAsDataUrl(f), 'handout'); e.target.value = ''; refresh(); drawEditor();
    } });

    const who = recipients();
    const toSet = new Set((x.to || []).map(n => n.toLowerCase()));
    const allBox = h('input', { type: 'checkbox', checked: x.toAll, onchange: (e) => { x.toAll = e.target.checked; refresh(); drawEditor(); } });
    const online = new Set((App.players || []).filter(p => p.online).map(p => p.name.toLowerCase()));

    els.editor.append(
      h('div.ho-form',
        h('div.grid2',
          h('label.field', h('span', 'Title'), bind('title', h('input'))),
          h('label.field', h('span', 'Signature'), bind('signature', h('input', { placeholder: 'optional' })))),
        h('div.grid3',
          h('label.field', h('span', 'Style'), bind('style', h('select', Object.entries(HANDOUT_STYLES).map(([v, l]) => h('option', { value: v }, l))))),
          h('label.field', h('span', 'Lettering'), bind('font', h('select', Object.entries(HANDOUT_FONTS).map(([v, l]) => h('option', { value: v }, l))))),
          h('label.field', h('span', 'Wax seal initials'), bind('seal', h('input', { placeholder: 'none', maxlength: 2 })))),
        h('label.field', h('span', 'Text (markdown: *italic*, **bold**, ## heading)'), bind('body', h('textarea', { rows: 10 }))),
        h('div.row', file, h('button', { onclick: () => file.click() }, x.image ? '🖼 Change image' : '🖼 Add image'),
          x.image ? h('button', { onclick: () => { x.image = null; refresh(); drawEditor(); } }, 'Remove image') : null),
        h('div.card.recipients',
          h('h3', 'Who gets it?'),
          h('label.chk', allBox, ' The whole party'),
          !x.toAll ? h('div.recipient-list',
            who.length ? who.map(n => h('label.chk', h('input', { type: 'checkbox', checked: toSet.has(n.toLowerCase()), onchange: (e) => {
              x.to = e.target.checked ? [...(x.to || []), n] : (x.to || []).filter(t => t.toLowerCase() !== n.toLowerCase()); refresh();
            } }), ' ', n, online.has(n.toLowerCase()) ? h('span.dot.on', { title: 'Connected' }) : h('span.dot', { title: 'Not connected' })))
              : h('p.dim', 'Add party members in Settings, or have players connect from their phones.')) : null,
          h('div.row',
            x.revealed
              ? h('button.danger', { onclick: () => { x.revealed = false; refresh(); drawEditor(); toast('Handout hidden'); } }, '🙈 Hide from players')
              : h('button.primary.big', { onclick: () => { x.revealed = true; x.revealedAt = Date.now(); refresh(); drawEditor(); toast('Handout revealed!'); } }, '📨 Reveal to players'),
            h('span.dim', x.revealed ? 'Visible on phones now. Edits update live.' : 'Players can\'t see this yet.'))),
        h('div.row',
          h('button', { onclick: () => printIt('print') }, '🖨 Print'),
          h('button', { onclick: () => printIt('pdf') }, '📄 Save PDF'),
          h('button', { onclick: () => { const c = { ...x, id: U.uid(), title: x.title + ' (copy)', revealed: false }; all().push(c); selected = c.id; Store.save(); draw(); } }, '⧉ Duplicate'),
          h('button.danger', { onclick: async () => { if (!await U.confirm('Delete handout', `Delete “${x.title || 'untitled'}”?`)) return; Store.get().handouts = all().filter(y => y.id !== x.id); selected = null; Store.save(); publishToPlayers(); draw(); } }, '🗑 Delete'))),
      h('div.ho-preview-wrap', h('div.dim.center', 'Preview — what players will see'), preview));
    refresh();
  }

  async function printIt(mode) {
    const x = cur(); if (!x) return;
    const base = location.href.replace(/renderer\/index\.html.*$/, '');
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Libre+Baskerville&family=IM+Fell+English:ital@0;1&family=Caveat:wght@500&family=Homemade+Apple&family=Special+Elite&family=UnifrakturMaguntia&display=swap">
      <link rel="stylesheet" href="${base}shared/handout.css">
      <style>@page{size:letter;margin:.5in} body{margin:0;padding:30px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact} .handout{box-shadow:none}</style></head>
      <body>${renderHandout({ ...x, bodyHtml: MD.simple(x.body), imageUrl: x.image ? App.mediaUrl(x.image) : null })}</body></html>`;
    await new Promise(r => setTimeout(r, 0));
    const r = await dm.print.html(html, mode, (x.title || 'handout') + '.pdf');
    if (r && mode === 'pdf') toast('Saved ' + r);
  }

  return { mount };
})();
