// Token maker: crop an image into a round/square token with a border, export PNGs for a VTT, or lay them out on a printable sheet.
window.Tokens = (() => {
  const { h, $, toast } = U;
  const METALS = {
    gold: ['#7a5a12', '#f7e08a', '#b8862b', '#fff4c2', '#8a6416'],
    silver: ['#5d6166', '#f2f4f7', '#9ea3a9', '#ffffff', '#6b7076'],
    bronze: ['#5a2f12', '#e0a26b', '#8f5426', '#f6c99a', '#62351a'],
  };
  const PALETTE = ['#8b1e1e', '#1e5b8b', '#2b7a3d', '#6b2b8b', '#8b6a1e', '#1e7a7a', '#555c66', '#a3461f'];
  let d = defaults();
  let img = null, canvas, ctx, controls = {};

  function defaults() {
    return { src: null, zoom: 1, ox: 0, oy: 0, shape: 'circle', border: 'gold', color: '#8b1e1e', width: 7, bg: '#3a3346', fill: false, label: '', showLabel: false, number: '', size: 'Medium' };
  }

  // Draw a token at any resolution.
  function draw(c, S, des, image) {
    c.clearRect(0, 0, S, S);
    const bw = des.border === 'none' ? 0 : (des.width / 100) * S;
    const pad = S * 0.01;
    const R = S / 2 - pad;
    const path = (r) => { c.beginPath(); if (des.shape === 'circle') c.arc(S / 2, S / 2, r, 0, Math.PI * 2); else { const o = S / 2 - r; c.roundRect(o, o, S - 2 * o, S - 2 * o, S * 0.04); } };

    // Image (clipped)
    c.save(); path(R - bw * 0.5); c.clip();
    // Only fill behind the picture if asked; otherwise transparent parts of the image stay transparent.
    if (!image || des.fill) { c.fillStyle = des.bg; c.fillRect(0, 0, S, S); }
    if (image) {
      const base = Math.max(S / image.width, S / image.height) * des.zoom;
      const w = image.width * base, hgt = image.height * base;
      c.drawImage(image, S / 2 - w / 2 + des.ox * S, S / 2 - hgt / 2 + des.oy * S, w, hgt);
    } else {
      // Initials placeholder
      const initials = (des.label || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
      c.fillStyle = 'rgba(255,255,255,.92)'; c.font = `bold ${S * (initials.length > 1 ? 0.34 : 0.44)}px Cinzel, Georgia, serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(initials, S / 2, S / 2 + S * 0.02);
    }
    c.restore();

    // Border
    if (bw > 0) {
      c.save(); c.lineWidth = bw;
      if (METALS[des.border]) {
        const g = c.createLinearGradient(0, 0, S, S); METALS[des.border].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
        c.strokeStyle = g; path(R - bw / 2); c.stroke();
        c.lineWidth = Math.max(1, S / 256); c.strokeStyle = 'rgba(0,0,0,.45)';
        path(R - bw); c.stroke(); path(R); c.stroke();
      } else if (des.border === 'double') {
        c.strokeStyle = des.color; c.lineWidth = bw * 0.4; path(R - bw * 0.2); c.stroke(); path(R - bw * 0.8); c.stroke();
      } else { c.strokeStyle = des.color; path(R - bw / 2); c.stroke(); }
      c.restore();
    }

    // Name banner
    if (des.showLabel && des.label) {
      const fh = S * 0.085, y = S * 0.8;
      c.save(); c.font = `bold ${fh}px Cinzel, Georgia, serif`;
      const tw = Math.min(c.measureText(des.label).width + fh * 1.2, S * 0.9);
      c.fillStyle = 'rgba(20,16,26,.85)'; c.strokeStyle = METALS[des.border] ? METALS[des.border][1] : des.color; c.lineWidth = S / 160;
      c.beginPath(); c.roundRect(S / 2 - tw / 2, y - fh * 0.75, tw, fh * 1.5, fh * 0.4); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(des.label, S / 2, y + fh * 0.05, S * 0.85);
      c.restore();
    }

    // Number badge
    if (des.number !== '' && des.number != null) {
      const r = S * 0.12, x = S * 0.82, y = S * 0.18;
      c.save(); c.fillStyle = '#c62828'; c.strokeStyle = '#fff'; c.lineWidth = S / 80;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = `bold ${r * 1.2}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(des.number), x, y + r * 0.06);
      c.restore();
    }
  }

  const render = () => { if (canvas) draw(ctx, canvas.width, d, img); };
  function toDataUrl(size, over = {}) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size, { ...d, ...over }, img);
    return c.toDataURL('image/png');
  }

  async function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function setImage(src) {
    img = await loadImage(src); d.src = src; d.zoom = 1; d.ox = 0; d.oy = 0;
    controls.zoom.value = 1; render();
  }

  function mount(root) {
    canvas = h('canvas.token-canvas', { width: 512, height: 512, title: 'Drag to move the image · scroll to zoom' });
    ctx = canvas.getContext('2d');
    let drag = null;
    canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: d.ox, oy: d.oy }; });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const k = 1 / canvas.clientWidth;
      d.ox = drag.ox + (e.clientX - drag.x) * k; d.oy = drag.oy + (e.clientY - drag.y) * k; render();
    });
    window.addEventListener('mouseup', () => (drag = null));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); d.zoom = U.clamp(d.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.2, 8); controls.zoom.value = d.zoom; render(); }, { passive: false });
    const dropZone = h('div.token-stage', canvas);
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drop'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault(); dropZone.classList.remove('drop');
      const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
      if (f) setImage(await U.readFileAsDataUrl(f));
    });
    document.addEventListener('paste', async (e) => {
      if (!$('#view-tokens').classList.contains('active')) return;
      const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
      if (item) setImage(await U.readFileAsDataUrl(item.getAsFile()));
    });

    const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => { const f = e.target.files[0]; if (f) setImage(await U.readFileAsDataUrl(f)); e.target.value = ''; } });
    const bind = (key, el, conv = (v) => v) => { controls[key] = el; el.value = d[key]; el.addEventListener('input', () => { d[key] = el.type === 'checkbox' ? el.checked : conv(el.value); render(); }); return el; };
    const showLabel = h('input', { type: 'checkbox' }); controls.showLabel = showLabel;
    const fill = h('input', { type: 'checkbox' }); controls.fill = fill;
    fill.addEventListener('change', () => { d.fill = fill.checked; render(); });
    showLabel.addEventListener('change', () => { d.showLabel = showLabel.checked; render(); });

    const swatches = h('div.swatches', PALETTE.map(c => h('button.swatch', { style: `background:${c}`, onclick: () => { d.color = c; d.bg = shade(c); controls.color.value = c; controls.bg.value = d.bg; render(); } })));
    const exportSize = h('select', [256, 512, 1024].map(s => h('option', { value: s, selected: s === 512 }, `${s} px`)));
    const qty = h('input', { type: 'number', min: 1, max: 50, value: 1, style: 'width:70px' });
    const numbered = h('input', { type: 'checkbox' });
    const sheetEl = h('div.sheet-list');
    const paper = h('select', h('option', { value: 'letter' }, 'US Letter'), h('option', { value: 'A4' }, 'A4'));
    const cutLines = h('input', { type: 'checkbox', checked: true });

    const drawSheet = () => {
      const sheet = Store.get().tokenSheet;
      sheetEl.innerHTML = '';
      if (!sheet.length) sheetEl.append(h('p.dim', 'Nothing on the token sheet yet. Design a token and press “Add to token sheet”.'));
      sheet.forEach((t, i) => sheetEl.append(h('div.sheet-item',
        h('img', { src: App.mediaUrl(t.file) }),
        h('div', h('b', t.name || 'Token'), h('div.dim', `${t.size} · ${SRD.TOKEN_INCHES[t.size]}"`)),
        h('select', { onchange: (e) => { t.size = e.target.value; Store.save(); drawSheet(); } }, SRD.SIZES.map(s => h('option', { selected: s === t.size }, s))),
        h('button.icon', { title: 'Remove', onclick: () => { sheet.splice(i, 1); Store.save(); drawSheet(); } }, '✕'))));
    };

    const addToSheet = async () => {
      const n = Math.max(1, Math.min(50, Number(qty.value) || 1));
      for (let i = 1; i <= n; i++) {
        const url = toDataUrl(512, numbered.checked ? { number: i } : {});
        const fileName = await dm.media.save(url, 'token');
        Store.get().tokenSheet.push({ id: U.uid(), file: fileName, name: d.label + (numbered.checked ? ` ${i}` : ''), size: d.size });
      }
      Store.save(); drawSheet(); toast(`Added ${n} token${n > 1 ? 's' : ''} to the token sheet`);
    };

    const exportSheet = async () => {
      const sheet = Store.get().tokenSheet;
      if (!sheet.length) return toast('The token sheet is empty', 'err');
      const dir = await dm.tokens.exportFiles(sheet.map(t => ({ file: t.file, name: t.name || 'token' })));
      if (dir) toast(`Saved ${sheet.length} PNG${sheet.length > 1 ? 's' : ''} to ${dir}`);
    };

    const printSheet = async (mode) => {
      const sheet = Store.get().tokenSheet;
      if (!sheet.length) return toast('The token sheet is empty', 'err');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        @page { size: ${paper.value}; margin: 0.4in; }
        body { margin: 0; font-family: sans-serif; }
        .wrap { display: flex; flex-wrap: wrap; gap: 0.08in; align-content: flex-start; }
        .t { position: relative; break-inside: avoid; }
        .t img { width: 100%; height: 100%; display: block; }
        .t.cut::after { content: ''; position: absolute; inset: -0.02in; border: 0.5px dashed #999; border-radius: ${d.shape === 'circle' ? '50%' : '4%'}; }
      </style></head><body><div class="wrap">${sheet.map(t => { const s = SRD.TOKEN_INCHES[t.size]; return `<div class="t${cutLines.checked ? ' cut' : ''}" style="width:${s}in;height:${s}in"><img src="${App.mediaUrl(t.file)}"></div>`; }).join('')}</div></body></html>`;
      const r = await dm.print.html(html, mode, 'tokens.pdf');
      if (r && mode === 'pdf') toast('Saved ' + r);
    };

    root.append(h('div.page',
      h('header.page-head', h('h1', 'Token Maker'), h('p.dim', 'Drop, paste (Ctrl+V) or open an image. Drag to position, scroll to zoom.')),
      h('div.token-layout',
        h('div.card.token-left',
          dropZone,
          h('div.row', file, h('button.primary', { onclick: () => file.click() }, '🖼 Open image'),
            h('button', { onclick: () => { img = null; d.src = null; render(); } }, 'Use initials'),
            h('button', { onclick: () => { d = { ...defaults(), label: d.label }; img = null; syncControls(); render(); } }, 'Reset')),
          h('label.field', h('span', 'Zoom'), bind('zoom', h('input', { type: 'range', min: 0.2, max: 6, step: 0.01 }), Number))),
        h('div.card.token-right',
          h('h3', 'Style'),
          h('div.grid2',
            h('label.field', h('span', 'Shape'), bind('shape', h('select', h('option', { value: 'circle' }, 'Circle'), h('option', { value: 'square' }, 'Square')))),
            h('label.field', h('span', 'Border'), bind('border', h('select', ['gold', 'silver', 'bronze', 'solid', 'double', 'none'].map(b => h('option', { value: b }, U.cap(b))))))),
          h('div.grid3',
            h('label.field', h('span', 'Border color'), bind('color', h('input', { type: 'color' }))),
            h('label.field', h('span', 'Fill color'), bind('bg', h('input', { type: 'color' }))),
            h('label.field', h('span', 'Thickness'), bind('width', h('input', { type: 'range', min: 2, max: 16, step: 0.5 }), Number))),
          swatches,
          h('label.chk', fill, ' Fill behind the image (leave off to keep it see-through)'),
          h('div.grid2',
            h('label.field', h('span', 'Name'), bind('label', h('input', { placeholder: 'e.g. Goblin Boss' }))),
            h('label.field', h('span', 'Number badge'), bind('number', h('input', { placeholder: 'none', style: 'width:100%' })))),
          h('label.chk', showLabel, ' Show name banner on token'),
          h('h3', 'Export for virtual tabletop'),
          h('div.row', exportSize, h('button.primary', { onclick: async () => { const p = await dm.file.savePng(toDataUrl(Number(exportSize.value)), (d.label || 'token').replace(/\s+/g, '_') + '.png'); if (p) toast('Saved ' + p); } }, '⬇ Save PNG')),
          h('p.hint', 'PNGs have a transparent background outside the token, ready for Roll20, Foundry, Owlbear Rodeo and other virtual tabletops.'),
          h('h3', 'Token sheet'),
          h('div.row', h('label.field.inline', h('span', 'Size'), bind('size', h('select', SRD.SIZES.map(s => h('option', { value: s }, `${s} (${SRD.TOKEN_INCHES[s]}")`))))),
            h('label.field.inline', h('span', 'Qty'), qty), h('label.chk', numbered, ' Number them')),
          h('button', { onclick: addToSheet }, '➕ Add to token sheet'),
          sheetEl,
          h('div.row', paper, h('label.chk', cutLines, ' Cut lines'),
            h('button', { onclick: () => printSheet('print') }, '🖨 Print'),
            h('button.primary', { onclick: exportSheet }, '💾 Save all as PNGs'),
            h('button.danger.small', { onclick: async () => { if (await U.confirm('Clear sheet', 'Remove every token from the token sheet?')) { Store.get().tokenSheet = []; Store.save(); drawSheet(); } } }, 'Clear'))),
      )));
    Store.onLoad(drawSheet);
    drawSheet(); render();
    document.fonts && document.fonts.ready.then(render);
  }

  function syncControls() { for (const [k, el] of Object.entries(controls)) { if (el.type === 'checkbox') el.checked = !!d[k]; else el.value = d[k]; } }
  function shade(hex) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * 0.45).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); }

  // Called from generators / initiative to jump here with a name filled in.
  function quick(name) {
    App.show('tokens');
    d.label = name; d.showLabel = true; img = null; d.src = null;
    const c = U.pick(PALETTE); d.color = c; d.bg = shade(c); d.border = 'solid';
    syncControls(); render();
  }

  return { mount, quick };
})();
