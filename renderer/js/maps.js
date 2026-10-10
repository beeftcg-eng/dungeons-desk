// Battle maps with fog of war, measuring, drawing, AoE templates and pings.
// Players see the map on the TV window and their phones, and can move their own tokens
// (fog clears around player tokens as they move, if the DM turns that on).
window.Maps = (() => {
  const { h, toast } = U;
  let els = {}, tool = 'move', aoeKind = 'circle', color = '#ff5252', brush = 60;
  let view = { s: 1, x: 0, y: 0 }, drag = null, stroke = null, rectPrev = null, ruler = null, aoePrev = null;
  const images = {}; // url -> Image
  const maps = () => (Store.get().maps = Store.get().maps || []);
  const active = () => maps().find(m => m.id === Store.get().activeMap) || null;
  const COLORS = ['#8b1e1e', '#1e5b8b', '#2b7a3d', '#6b2b8b', '#8b6a1e', '#1e7a7a', '#555c66', '#a3461f'];
  const INK = ['#ff5252', '#ffd54f', '#69f0ae', '#40c4ff', '#e040fb', '#ffffff', '#ff7043', '#111111'];

  // Older maps were saved before these fields existed.
  function upgrade(m) {
    m.tokens = m.tokens || []; m.drawings = m.drawings || []; m.templates = m.templates || []; m.pings = m.pings || [];
    if (m.playerMove == null) m.playerMove = true;
    if (m.vision == null) m.vision = 6;
    if (m.shareDrawings == null) m.shareDrawings = true;
    return m;
  }
  function img(url) {
    if (!url) return null;
    if (!images[url]) { const i = new Image(); i.onload = () => render(); i.src = url; images[url] = i; }
    return images[url];
  }
  const save = U.debounce(() => { Store.save(); publishToPlayers(); }, 120);
  const recentPings = (m) => (m.pings || []).filter(p => Date.now() - p.t < 6000);

  // ---------- Player view ----------
  function playerView() {
    const m = active();
    if (!m || !Store.get().mapShown) return null;
    upgrade(m);
    const ini = Store.get().initiative, cur = ini.active && ini.combatants[ini.turn];
    return {
      id: m.id, name: m.name, image: '/media/' + encodeURIComponent(m.image), w: m.w, h: m.h, grid: m.grid,
      fog: m.fog && m.fog.enabled ? m.fog : { enabled: false, ops: [] },
      tokens: m.tokens.filter(t => !t.hidden).map(t => ({ id: t.id, name: t.name, owner: t.owner || null, x: t.x, y: t.y, size: t.size, color: t.color, img: t.file ? '/media/' + encodeURIComponent(t.file) : null })),
      drawings: m.shareDrawings ? m.drawings : [], templates: m.shareDrawings ? m.templates : [],
      rulers: ruler ? [{ ...ruler, by: 'DM' }] : [],
      pings: recentPings(m), playerMove: m.playerMove !== false,
      current: cur && !cur.hidden ? cur.name : null,
    };
  }

  // ---------- Things players do from their phones ----------
  function playerAction(a) {
    const who = a.player.toLowerCase();
    if (a.type === 'token') {
      const p = Store.get().party.find(x => (x.name || '').toLowerCase() === who);
      if (p) p.token = a.file; else (Store.get().playerTokens = Store.get().playerTokens || {})[who] = a.file;
      maps().forEach(m => (m.tokens || []).forEach(t => { if ((t.owner || '').toLowerCase() === who) t.file = a.file; }));
      Store.save(); publishToPlayers(); render(); drawSide();
      toast(`${a.player} set a new token`);
      return;
    }
    const m = active();
    if (!m || !Store.get().mapShown || m.id !== a.map) return;
    upgrade(m);
    if (a.type === 'ping') {
      m.pings = [...recentPings(m), { x: a.x, y: a.y, t: Date.now(), color: 'blue', by: a.player }].slice(-6);
      save(); render();
      return;
    }
    if (a.type === 'move') {
      const tk = m.tokens.find(t => t.id === a.token);
      if (!tk || (tk.owner || '').toLowerCase() !== who || m.playerMove === false || tk.hidden) return;
      const fx = tk.x, fy = tk.y;
      tk.x = U.clamp(a.x, 0, m.w); tk.y = U.clamp(a.y, 0, m.h);
      snap(tk); revealAround(m, tk, fx, fy);
      save(); render();
    }
  }
  const tokenFor = (name) => {
    const n = (name || '').toLowerCase();
    const p = Store.get().party.find(x => (x.name || '').toLowerCase() === n);
    return (p && p.token) || (Store.get().playerTokens || {})[n] || null;
  };
  // Clear fog in a swath along the token's path, `vision` squares wide.
  function revealAround(m, tk, fx = tk.x, fy = tk.y) {
    if (!tk.owner || !m.fog.enabled || !(m.vision > 0)) return;
    m.fog.ops.push({ t: 'r', s: 'brush', r: m.vision * m.grid.size, pts: [Math.round(fx), Math.round(fy), Math.round(tk.x), Math.round(tk.y)] });
  }

  // ---------- UI ----------
  function mount(root) {
    els.list = h('div.map-list');
    els.canvas = h('canvas.map-canvas');
    els.stage = h('div.map-stage', els.canvas);
    els.toolbar = h('div.map-toolbar');
    els.side = h('div.map-side');
    root.append(h('div.page.page-flush', h('div.map-layout',
      h('aside.map-aside', h('div.side-head', h('h2', '🗺 Maps'), h('button.primary.small', { onclick: addMap }, '+ New map')), els.list, els.side),
      h('div.map-main', els.toolbar, els.stage))));
    new ResizeObserver(() => fit(false)).observe(els.stage);
    bindCanvas();
    dm.onPlayerAction(playerAction);
    Store.onLoad(() => { drawAll(); fit(true); });
    drawAll();
    setInterval(() => { const m = active(); if (m && (m.pings || []).some(p => Date.now() - p.t < 4200)) render(); }, 50);
  }
  const onShow = () => { drawAll(); fit(true); };

  function drawAll() { const m = active(); if (m) upgrade(m); drawList(); drawToolbar(); drawSide(); render(); }

  function drawList() {
    els.list.innerHTML = '';
    if (!maps().length) els.list.append(h('p.dim', 'No maps yet. Add a battle map, dungeon or region image.'));
    maps().forEach(m => els.list.append(h('div.ho-item' + (m.id === Store.get().activeMap ? '.active' : ''), { onclick: () => { Store.get().activeMap = m.id; Store.save(); publishToPlayers(); drawAll(); fit(true); } },
      h('div.ho-item-title', m.name), m.id === Store.get().activeMap && Store.get().mapShown ? h('span.chip.live', 'Players see this') : null)));
  }

  function addMap() {
    const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = await U.readFileAsDataUrl(f);
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const name = await U.prompt('Map name', f.name.replace(/\.[^.]+$/, ''));
      if (!name) return;
      const stored = await dm.media.save(url, 'map');
      const m = upgrade({ id: U.uid(), name, image: stored, w: im.naturalWidth, h: im.naturalHeight,
        grid: { size: Math.round(Math.min(im.naturalWidth, im.naturalHeight) / 20), ox: 0, oy: 0, show: true, color: 'rgba(0,0,0,0.35)' },
        fog: { enabled: true, ops: [] } });
      maps().push(m); Store.get().activeMap = m.id; Store.save(); drawAll(); fit(true);
      toast('Map added. The whole map starts hidden: reveal areas, or let player tokens clear the fog as they move.');
    } });
    document.body.append(file); file.click(); setTimeout(() => file.remove(), 60000);
  }

  function setTool(id) { tool = id; drawToolbar(); els.canvas.style.cursor = id === 'move' ? 'grab' : id === 'erase' ? 'not-allowed' : 'crosshair'; }

  function drawToolbar() {
    const m = active();
    els.toolbar.innerHTML = '';
    if (!m) return;
    const t = (id, label, title) => h('button.seg' + (tool === id ? '.on' : ''), { title, onclick: () => setTool(id) }, label);
    const shown = !!Store.get().mapShown;
    const fogTools = ['reveal', 'revealRect', 'hide', 'hideRect'].includes(tool);
    els.toolbar.append(
      h('div.seg-group', t('move', '✋', 'Move tokens / pan (drag), zoom (scroll), right-click a token for options'),
        t('reveal', '👁', 'Reveal fog: paint'), t('revealRect', '👁▭', 'Reveal fog: drag a box'), t('hide', '🌫', 'Hide again: paint'), t('hideRect', '🌫▭', 'Hide again: drag a box')),
      h('div.seg-group', t('measure', '📏 Measure', 'Drag to measure (players see it)'), t('draw', '✏ Draw', 'Freehand drawing'), t('aoe', '💥 AoE', 'Drag from the origin to place an area of effect'),
        t('erase', '🧽', 'Click a drawing or AoE to remove it'), t('ping', '📍 Ping', 'Click to ping')),
      tool === 'aoe' ? h('select', { onchange: (e) => { aoeKind = e.target.value; } }, [['circle', '⭕ Sphere / radius'], ['cone', '🔺 Cone'], ['line', '➖ Line (5 ft wide)'], ['cube', '⬛ Cube']].map(([v, l]) => h('option', { value: v, selected: v === aoeKind }, l))) : null,
      ['draw', 'aoe'].includes(tool) ? h('div.ink', INK.map(c => h('button.swatch' + (c === color ? '.on' : ''), { style: `background:${c}`, onclick: () => { color = c; drawToolbar(); } }))) : null,
      fogTools || tool === 'draw' ? h('label.field.inline', h('span', tool === 'draw' ? 'Width' : 'Brush'), h('input', { type: 'range', min: tool === 'draw' ? 2 : 10, max: tool === 'draw' ? 30 : 300, value: tool === 'draw' ? (m.penWidth || 6) : brush, oninput: (e) => { if (tool === 'draw') m.penWidth = Number(e.target.value); else brush = Number(e.target.value); } })) : null,
      fogTools ? [h('button', { onclick: () => { m.fog.ops = [{ t: 'r', s: 'all' }]; save(); render(); } }, 'Reveal all'),
        h('button', { onclick: () => { m.fog.ops = []; save(); render(); } }, 'Hide all'),
        h('button', { onclick: () => { m.fog.ops.pop(); save(); render(); }, title: 'Undo last fog change' }, '↶')] : null,
      tool === 'draw' || tool === 'erase' ? h('button', { onclick: () => { m.drawings = []; save(); render(); } }, 'Clear drawings') : null,
      tool === 'aoe' || tool === 'erase' ? h('button', { onclick: () => { m.templates = []; save(); render(); } }, 'Clear AoE') : null,
      h('span.grow'),
      h('button' + (shown ? '.danger' : '.primary'), { onclick: () => { Store.get().mapShown = !shown; Store.save(); publishToPlayers(); drawToolbar(); drawList(); toast(shown ? 'Map hidden from players' : 'Players can now see this map'); } }, shown ? '🙈 Hide from players' : '📺 Show to players'));
  }

  function drawSide() {
    const m = active();
    els.side.innerHTML = '';
    if (!m) return;
    upgrade(m);
    const num = (obj, key, label) => h('label.field', h('span', label), h('input', { type: 'number', value: obj[key], oninput: (e) => { obj[key] = Number(e.target.value) || 0; save(); render(); } }));
    const tokens = m.tokens;
    els.side.append(
      h('div.card',
        h('h3', 'Players'),
        h('label.chk', h('input', { type: 'checkbox', checked: m.playerMove, onchange: (e) => { m.playerMove = e.target.checked; save(); } }), ' Players can move their own tokens'),
        h('label.field', h('span', 'Fog clears around player tokens (squares, 0 = off)'), h('input', { type: 'number', min: 0, max: 40, value: m.vision, oninput: (e) => { m.vision = Math.max(0, Number(e.target.value) || 0); save(); } })),
        h('label.chk', h('input', { type: 'checkbox', checked: m.shareDrawings, onchange: (e) => { m.shareDrawings = e.target.checked; save(); } }), ' Players see drawings & AoE')),
      h('div.card',
        h('h3', `Tokens (${tokens.length})`),
        h('div.row',
          h('button.small', { onclick: tokensFromParty, title: 'Adds each character with the token their player chose' }, '🛡 Party'),
          h('button.small', { onclick: tokensFromInitiative }, '⏳ Initiative'),
          h('button.small', { onclick: tokensFromSheet }, '🪙 Sheet'),
          h('button.small', { onclick: async () => { const n = await U.prompt('Marker name', ''); if (n) addToken({ name: n }); } }, '+ Marker')),
        h('div.map-tokens', tokens.map(tk => h('div.map-token-row',
          tk.file ? h('img.tok-thumb', { src: App.mediaUrl(tk.file) }) : h('span.rel-dot', { style: `background:${tk.color || '#888'}` }),
          h('span.grow', tk.name, tk.owner ? h('span.dim.small', ` · ${tk.owner}`) : null),
          h('select.small', { title: 'Size in squares', onchange: (e) => { tk.size = Number(e.target.value); save(); render(); } }, [0.5, 1, 2, 3, 4].map(sz => h('option', { value: sz, selected: (tk.size || 1) === sz }, `${sz}×`))),
          h('button.icon', { title: tk.hidden ? 'Hidden from players' : 'Visible to players', onclick: () => { tk.hidden = !tk.hidden; save(); drawSide(); render(); } }, tk.hidden ? '🙈' : '👁'),
          h('button.icon', { title: 'Remove', onclick: () => { m.tokens = tokens.filter(x => x !== tk); save(); drawSide(); render(); } }, '✕'))))),
      h('div.card',
        h('h3', 'Grid'),
        h('label.chk', h('input', { type: 'checkbox', checked: m.grid.show, onchange: (e) => { m.grid.show = e.target.checked; save(); render(); } }), ' Show grid'),
        h('div.grid3', num(m.grid, 'size', 'Square (px)'), num(m.grid, 'ox', 'Offset X'), num(m.grid, 'oy', 'Offset Y')),
        h('label.chk', h('input', { type: 'checkbox', checked: m.fog.enabled, onchange: (e) => { m.fog.enabled = e.target.checked; save(); render(); } }), ' Fog of war'),
        h('p.hint', 'One square = 5 ft. Match the square size to the map\'s printed grid so tokens snap to it and measurements are right.')),
      h('div.card',
        h('h3', 'Map'),
        h('div.row',
          h('button.small', { onclick: async () => { const n = await U.prompt('Rename map', m.name); if (n) { m.name = n; save(); drawList(); } } }, '✏ Rename'),
          h('button.small', { onclick: () => dm.server.openDisplay() }, '🖥 TV window'),
          h('button.small.danger', { onclick: async () => { if (await U.confirm('Delete map', `Delete “${m.name}”? (The image file is kept.)`)) { Store.get().maps = maps().filter(x => x !== m); Store.get().activeMap = maps()[0] && maps()[0].id; save(); drawAll(); } } }, '🗑 Delete'))));
  }

  function centerOfView() {
    const r = els.canvas.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }
  function snap(t) {
    const m = active(), g = m.grid, n = t.size || 1;
    if (!g.size) return;
    t.x = g.ox + (Math.round((t.x - g.ox) / g.size - n / 2) + n / 2) * g.size;
    t.y = g.oy + (Math.round((t.y - g.oy) / g.size - n / 2) + n / 2) * g.size;
  }
  function addToken(t, at) {
    const m = active(); if (!m) return;
    const p = at || centerOfView();
    const tk = { id: U.uid(), name: t.name, file: t.file || null, color: t.color || U.pick(COLORS), size: t.size || 1, x: p.x, y: p.y, hidden: !!t.hidden, owner: t.owner || null };
    snap(tk);
    m.tokens.push(tk);
    revealAround(m, tk);
    save(); drawSide(); render();
    return tk;
  }
  const spot = (c0, i, g) => ({ x: c0.x + ((i % 6) - 2.5) * g, y: c0.y + (Math.floor(i / 6) - 0.5) * g });
  function tokensFromParty() {
    const m = active(), party = Store.get().party.filter(p => p.name);
    if (!party.length) return toast('Add your party in Settings first', 'err');
    const c0 = centerOfView(); let i = 0;
    party.forEach(p => {
      if (m.tokens.some(t => t.name === p.name)) return;
      addToken({ name: p.name, file: tokenFor(p.name), color: '#1e5b8b', owner: p.name }, spot(c0, i++, m.grid.size));
    });
  }
  function tokensFromInitiative() {
    const m = active(), list = Store.get().initiative.combatants.filter(c => c.kind !== 'lair');
    if (!list.length) return toast('Initiative is empty', 'err');
    const c0 = centerOfView(); let i = 0;
    list.forEach(c => {
      if (m.tokens.some(t => t.name === c.name)) return;
      const sizeCells = c.sb ? ({ Tiny: 0.5, Large: 2, Huge: 3, Gargantuan: 4 }[c.sb.size] || 1) : 1;
      const pc = c.kind === 'pc';
      addToken({ name: c.name, color: pc ? '#1e5b8b' : c.kind === 'ally' ? '#2b7a3d' : '#8b1e1e', size: sizeCells, hidden: c.hidden, owner: pc ? c.name : null, file: pc ? tokenFor(c.name) : null }, spot(c0, i++, m.grid.size));
    });
  }
  function tokensFromSheet() {
    const sheet = Store.get().tokenSheet;
    if (!sheet.length) return toast('Your token sheet is empty. Make tokens in the Token Maker first.', 'err');
    const box = h('div.template-grid', sheet.map(t => h('button.template-card', { onclick: () => { addToken({ name: t.name || 'Token', file: t.file, size: SRD.TOKEN_INCHES[t.size] >= 2 ? SRD.TOKEN_INCHES[t.size] : 1 }); } },
      h('img', { src: App.mediaUrl(t.file), style: 'width:56px;height:56px' }), t.name || 'Token')));
    U.modal('Add tokens from your sheet (click to add)', box);
  }

  // ---------- Canvas ----------
  function fit(reset) {
    const m = active();
    const r = els.stage.getBoundingClientRect();
    els.canvas.width = Math.max(1, r.width * devicePixelRatio); els.canvas.height = Math.max(1, r.height * devicePixelRatio);
    els.canvas.style.width = r.width + 'px'; els.canvas.style.height = r.height + 'px';
    if (m && (reset || !view.init)) {
      const s = Math.min(r.width / m.w, r.height / m.h) * 0.95;
      view = { s, x: (r.width - m.w * s) / 2, y: (r.height - m.h * s) / 2, init: true };
    }
    render();
  }
  const toWorld = (cx, cy) => { const r = els.canvas.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s }; };

  function render() {
    if (!els.canvas) return;
    const ctx = els.canvas.getContext('2d'), m = active();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    if (!m) {
      ctx.fillStyle = '#9d94b3'; ctx.font = `${16 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('Add a map image to get started', els.canvas.width / 2, els.canvas.height / 2); return;
    }
    upgrade(m);
    const d = devicePixelRatio;
    ctx.setTransform(view.s * d, 0, 0, view.s * d, view.x * d, view.y * d);
    const ini = Store.get().initiative, cur = ini.active && ini.combatants[ini.turn];
    const tokenImages = {};
    m.tokens.forEach(t => { if (t.file) tokenImages[t.file] = img(App.mediaUrl(t.file)); });
    const drawn = { ...m, tokens: m.tokens.map(t => ({ ...t, img: t.file })), templates: aoePrev ? [...m.templates, aoePrev] : m.templates,
      drawings: stroke && stroke.pen ? [...m.drawings, stroke] : m.drawings, rulers: ruler ? [ruler] : [], pings: recentPings(m) };
    MapRender.draw(ctx, drawn, { image: img(App.mediaUrl(m.image)), tokenImages, fogAlpha: 0.55, highlight: cur && cur.name, showHidden: true, scale: view.s });
    if (stroke && !stroke.pen) { ctx.save(); ctx.globalAlpha = 0.5; MapRender.applyOp(ctx, stroke.t === 'r' ? { ...stroke, t: 'h' } : stroke, m); ctx.restore(); }
    if (rectPrev) { ctx.save(); ctx.strokeStyle = rectPrev.t === 'r' ? '#8be08f' : '#ff8c84'; ctx.lineWidth = 2 / view.s; ctx.setLineDash([8 / view.s, 6 / view.s]); ctx.strokeRect(rectPrev.x, rectPrev.y, rectPrev.w, rectPrev.h); ctx.restore(); }
  }

  // Which drawing or template is under the pointer (for the eraser / right-click).
  function hitOverlay(p) {
    const m = active(), tol = 12 / view.s;
    const ctx = els.canvas.getContext('2d');
    for (let i = m.templates.length - 1; i >= 0; i--) {
      const sh = MapRender.templateShape(m.templates[i], m.grid);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); sh.path(ctx);
      const inside = ctx.isPointInPath(p.x, p.y); ctx.restore();
      if (inside) return { list: 'templates', i };
    }
    for (let i = m.drawings.length - 1; i >= 0; i--) {
      const pts = m.drawings[i].pts;
      for (let k = 0; k < pts.length; k += 2) if (Math.hypot(pts[k] - p.x, pts[k + 1] - p.y) < tol + (m.drawings[i].w || 4)) return { list: 'drawings', i };
    }
    return null;
  }
  const clearRulerSoon = U.debounce(() => { ruler = null; save(); render(); }, 2500);

  function bindCanvas() {
    const c = els.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      view.x = mx - (mx - view.x) * k; view.y = my - (my - view.y) * k; view.s *= k; render();
    }, { passive: false });
    c.addEventListener('mousedown', (e) => {
      const m = active(); if (!m) return;
      const p = toWorld(e.clientX, e.clientY);
      if (e.button === 2) {
        const tk = hitToken(p); if (tk) return tokenMenu(e, tk);
        const ov = hitOverlay(p); if (ov) { m[ov.list].splice(ov.i, 1); save(); render(); return; }
      }
      if (e.button === 1 || e.button === 2 || (tool === 'move' && !hitToken(p))) { drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
      if (tool === 'move') { const tk = hitToken(p); drag = { tk, dx: p.x - tk.x, dy: p.y - tk.y, fx: tk.x, fy: tk.y }; return; }
      if (tool === 'ping') { m.pings = [...recentPings(m), { x: p.x, y: p.y, t: Date.now(), color: 'gold', by: 'DM' }].slice(-6); save(); render(); return; }
      if (tool === 'erase') { const ov = hitOverlay(p); if (ov) { m[ov.list].splice(ov.i, 1); save(); render(); } return; }
      if (tool === 'measure') { ruler = { x: p.x, y: p.y, x2: p.x, y2: p.y, by: 'DM' }; drag = { ruler: true }; render(); return; }
      if (tool === 'aoe') { aoePrev = { id: U.uid(), kind: aoeKind, x: p.x, y: p.y, x2: p.x + m.grid.size, y2: p.y, color }; snapPoint(aoePrev, 'x', 'y'); drag = { aoe: true }; render(); return; }
      if (tool === 'draw') { stroke = { pen: true, id: U.uid(), color, w: m.penWidth || 6, pts: [Math.round(p.x), Math.round(p.y)] }; render(); return; }
      if (tool === 'reveal' || tool === 'hide') { stroke = { t: tool === 'reveal' ? 'r' : 'h', s: 'brush', r: brush / 2 / view.s, pts: [p.x, p.y] }; render(); return; }
      if (tool === 'revealRect' || tool === 'hideRect') { drag = { rect: true, x0: p.x, y0: p.y }; rectPrev = { t: tool === 'revealRect' ? 'r' : 'h', s: 'rect', x: p.x, y: p.y, w: 0, h: 0 }; }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const m = active(); if (!m) return;
      if (drag && drag.pan) { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; render(); return; }
      const p = toWorld(e.clientX, e.clientY);
      if (drag && drag.tk) { drag.tk.x = p.x - drag.dx; drag.tk.y = p.y - drag.dy; render(); return; }
      if (drag && drag.ruler) { ruler.x2 = p.x; ruler.y2 = p.y; render(); save(); return; }
      if (drag && drag.aoe) { aoePrev.x2 = p.x; aoePrev.y2 = p.y; render(); return; }
      if (stroke) {
        const n = stroke.pts.length, min = stroke.pen ? 3 / view.s : stroke.r / 3;
        if (Math.hypot(p.x - stroke.pts[n - 2], p.y - stroke.pts[n - 1]) > min) { stroke.pts.push(Math.round(p.x), Math.round(p.y)); render(); }
        return;
      }
      if (drag && drag.rect) { Object.assign(rectPrev, { x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) }); render(); }
    });
    window.addEventListener('mouseup', () => {
      const m = active();
      if (drag && drag.tk) { snap(drag.tk); revealAround(m, drag.tk, drag.fx, drag.fy); save(); render(); }
      if (drag && drag.ruler) clearRulerSoon();
      if (drag && drag.aoe && aoePrev && m) { m.templates.push(aoePrev); aoePrev = null; save(); render(); }
      if (stroke && m) { if (stroke.pen) { delete stroke.pen; m.drawings.push(stroke); } else m.fog.ops.push(stroke); stroke = null; save(); render(); }
      if (drag && drag.rect && rectPrev && m) { if (rectPrev.w > 2 && rectPrev.h > 2) m.fog.ops.push({ ...rectPrev }); rectPrev = null; save(); render(); }
      drag = null;
    });
  }
  // AoE origins snap to grid corners/centres for clean placement.
  function snapPoint(o, kx, ky) {
    const g = active().grid, half = g.size / 2;
    o[kx] = g.ox + Math.round((o[kx] - g.ox) / half) * half;
    o[ky] = g.oy + Math.round((o[ky] - g.oy) / half) * half;
  }
  function hitToken(p) {
    const m = active(); if (!m) return null;
    return [...m.tokens].reverse().find(t => Math.hypot(t.x - p.x, t.y - p.y) < (t.size || 1) * m.grid.size / 2);
  }
  function tokenMenu(e, tk) {
    const m = active();
    const party = Store.get().party.filter(p => p.name).map(p => p.name);
    const menu = h('div.ctx-menu', { style: `left:${e.clientX}px;top:${e.clientY}px` },
      h('b', { style: 'padding:4px 10px' }, tk.name),
      h('button', { onclick: () => { tk.hidden = !tk.hidden; save(); drawSide(); render(); } }, tk.hidden ? 'Show to players' : 'Hide from players'),
      h('button', { onclick: async () => { const n = await U.prompt('Rename token', tk.name); if (n) { tk.name = n; save(); drawSide(); render(); } } }, 'Rename'),
      party.length ? h('div.ctx-sub', h('span.dim.small', 'Controlled by'), h('select', { onclick: (ev) => ev.stopPropagation(), onchange: (ev) => { tk.owner = ev.target.value || null; if (tk.owner && !tk.file) tk.file = tokenFor(tk.owner); save(); drawSide(); render(); } },
        h('option', { value: '' }, 'DM only'), party.map(n => h('option', { value: n, selected: (tk.owner || '') === n }, n)))) : null,
      h('button', { onclick: () => { m.tokens = m.tokens.filter(x => x !== tk); save(); drawSide(); render(); } }, 'Remove'));
    document.body.append(menu);
    menu.addEventListener('click', (ev) => { if (ev.target.tagName === 'BUTTON') setTimeout(() => menu.remove(), 0); });
    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', close, true); } };
    document.addEventListener('mousedown', close, true);
  }

  return { mount, onShow, playerView, rerender: render, tokenFor };
})();
