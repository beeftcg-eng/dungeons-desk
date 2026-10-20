// Battle map drawing shared by the DM app and the phone/TV page.
// A map: { w, h, image, video?, grid: { size, ox, oy, show, color }, fog: { enabled, ops: [] }, tokens: [{ name, x, y, size, img, color, hidden }] }
// Also: drawings [{ color, w, pts }], templates (AoE) [{ kind: circle|cone|line|cube, x, y, x2, y2, color }],
// rulers [{ x, y, x2, y2, by }] and pings [{ x, y, t, color, by }]. 1 grid square = 5 ft.
// Fog ops are applied in order: { t: 'r' (reveal) | 'h' (hide), s: 'rect', x, y, w, h } | { t, s: 'brush', r, pts: [x, y, ...] } | { t: 'r', s: 'all' }
(function () {
  const fogCache = new WeakMap();

  function fogCanvas(map) {
    const ops = (map.fog && map.fog.ops) || [];
    const key = ops.length + ':' + JSON.stringify(ops[ops.length - 1] || null).length + ':' + map.w + 'x' + map.h;
    const hit = fogCache.get(map.fog);
    if (hit && hit.key === key) return hit.canvas;
    const k = Math.min(1, 2048 / Math.max(map.w, map.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(map.w * k)); c.height = Math.max(1, Math.round(map.h * k));
    const x = c.getContext('2d');
    x.scale(k, k);
    x.fillStyle = '#000'; x.fillRect(0, 0, map.w, map.h);
    for (const op of ops) applyOp(x, op, map);
    if (map.fog) fogCache.set(map.fog, { key, canvas: c });
    return c;
  }

  function applyOp(x, op, map) {
    x.globalCompositeOperation = op.t === 'r' ? 'destination-out' : 'source-over';
    x.fillStyle = '#000'; x.strokeStyle = '#000';
    if (op.s === 'all') { if (op.t === 'r') x.clearRect(0, 0, map.w, map.h); else x.fillRect(0, 0, map.w, map.h); }
    else if (op.s === 'rect') x.fillRect(op.x, op.y, op.w, op.h);
    else if (op.s === 'brush') {
      x.lineWidth = op.r * 2; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath();
      for (let i = 0; i < op.pts.length; i += 2) i ? x.lineTo(op.pts[i], op.pts[i + 1]) : x.moveTo(op.pts[i], op.pts[i + 1]);
      if (op.pts.length === 2) x.lineTo(op.pts[0] + 0.1, op.pts[1]);
      x.stroke();
    }
    x.globalCompositeOperation = 'source-over';
  }

  const FT = 5;
  // Geometry for an AoE template, in map pixels. Sizes snap to 5 ft.
  function templateShape(tp, g) {
    const px = (g && g.size) || 50, ftPx = px / FT;
    const dx = tp.x2 - tp.x, dy = tp.y2 - tp.y;
    const raw = Math.hypot(dx, dy) / ftPx;
    const ft = Math.max(5, Math.round(raw / 5) * 5), len = ft * ftPx;
    const ang = Math.atan2(dy, dx);
    if (tp.kind === 'circle') return { ft, label: `${ft} ft radius`, path: (c) => c.arc(tp.x, tp.y, len, 0, Math.PI * 2), lx: tp.x, ly: tp.y };
    if (tp.kind === 'cone') {
      const ex = tp.x + Math.cos(ang) * len, ey = tp.y + Math.sin(ang) * len, half = len / 2;
      const px1 = ex + Math.cos(ang + Math.PI / 2) * half, py1 = ey + Math.sin(ang + Math.PI / 2) * half;
      const px2 = ex - Math.cos(ang + Math.PI / 2) * half, py2 = ey - Math.sin(ang + Math.PI / 2) * half;
      return { ft, label: `${ft} ft cone`, path: (c) => { c.moveTo(tp.x, tp.y); c.lineTo(px1, py1); c.lineTo(px2, py2); c.closePath(); }, lx: tp.x + Math.cos(ang) * len * 0.6, ly: tp.y + Math.sin(ang) * len * 0.6 };
    }
    if (tp.kind === 'line') {
      const w = ((tp.width || 5) * ftPx) / 2, nx = Math.cos(ang + Math.PI / 2) * w, ny = Math.sin(ang + Math.PI / 2) * w;
      const ex = tp.x + Math.cos(ang) * len, ey = tp.y + Math.sin(ang) * len;
      return { ft, label: `${ft} ft line`, path: (c) => { c.moveTo(tp.x + nx, tp.y + ny); c.lineTo(ex + nx, ey + ny); c.lineTo(ex - nx, ey - ny); c.lineTo(tp.x - nx, tp.y - ny); c.closePath(); }, lx: (tp.x + ex) / 2, ly: (tp.y + ey) / 2 };
    }
    // cube: a square with one side centred on the origin, pointing toward the drag direction
    const side = Math.max(5, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / ftPx / 5) * 5) * ftPx;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const x0 = horiz ? (dx >= 0 ? tp.x : tp.x - side) : tp.x - side / 2;
    const y0 = horiz ? tp.y - side / 2 : (dy >= 0 ? tp.y : tp.y - side);
    return { ft: side / ftPx, label: `${Math.round(side / ftPx)} ft cube`, path: (c) => c.rect(x0, y0, side, side), lx: x0 + side / 2, ly: y0 + side / 2 };
  }
  // Grid distance: every square (including diagonals) is 5 ft, as in the 2024 rules.
  function rulerFeet(r, g) {
    const px = (g && g.size) || 50;
    return Math.round(Math.max(Math.abs(r.x2 - r.x), Math.abs(r.y2 - r.y)) / px) * FT;
  }
  function label(ctx, text, x, y, scale, color = '#fff') {
    ctx.save();
    ctx.font = `bold ${14 / scale}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 12 / scale, hgt = 20 / scale;
    ctx.fillStyle = 'rgba(15,12,22,.85)'; ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
    ctx.fillStyle = color; ctx.fillText(text, x, y + 1 / scale);
    ctx.restore();
  }
  function drawOverlays(ctx, map, scale) {
    const g = map.grid || {};
    for (const d of map.drawings || []) {
      if (!d.pts || d.pts.length < 2) continue;
      ctx.save(); ctx.strokeStyle = d.color || '#ff5252'; ctx.lineWidth = d.w || 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < d.pts.length; i += 2) i ? ctx.lineTo(d.pts[i], d.pts[i + 1]) : ctx.moveTo(d.pts[i], d.pts[i + 1]);
      if (d.pts.length === 2) ctx.lineTo(d.pts[0] + 0.1, d.pts[1]);
      ctx.stroke(); ctx.restore();
    }
    for (const tp of map.templates || []) {
      const sh = templateShape(tp, g), col = tp.color || '#ff7043';
      ctx.save(); ctx.beginPath(); sh.path(ctx);
      ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = col; ctx.lineWidth = 2.5 / scale; ctx.stroke();
      ctx.restore();
      label(ctx, sh.label, sh.lx, sh.ly, scale);
    }
  }
  function drawRulers(ctx, map, scale) {
    for (const r of map.rulers || []) {
      ctx.save();
      ctx.strokeStyle = r.color || '#ffd54f'; ctx.lineWidth = 3 / scale; ctx.setLineDash([10 / scale, 6 / scale]);
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x2, r.y2); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = r.color || '#ffd54f';
      ctx.beginPath(); ctx.arc(r.x, r.y, 5 / scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      label(ctx, `${rulerFeet(r, map.grid)} ft${r.by ? ' · ' + r.by : ''}`, r.x2, r.y2 - 18 / scale, scale, r.color || '#ffd54f');
    }
  }

  function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }

  // ctx must already be transformed so 1 unit = 1 map pixel.
  function draw(ctx, map, { image, tokenImages = {}, fogAlpha = 1, highlight = null, showHidden = false, ping = null, scale = 1 } = {}) {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, map.w, map.h);
    // `image` is an <img>, or a <video> for animated maps (Dungeon Alchemist exports), drawn once it has a frame.
    if (image && (image.tagName === 'VIDEO' ? image.readyState >= 2 : image.complete && image.naturalWidth)) ctx.drawImage(image, 0, 0, map.w, map.h);
    const g = map.grid || {};
    if (g.show && g.size > 4) {
      ctx.strokeStyle = g.color || 'rgba(0,0,0,.35)'; ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (let x = (g.ox || 0) % g.size; x < map.w; x += g.size) { ctx.moveTo(x, 0); ctx.lineTo(x, map.h); }
      for (let y = (g.oy || 0) % g.size; y < map.h; y += g.size) { ctx.moveTo(0, y); ctx.lineTo(map.w, y); }
      ctx.stroke();
    }
    for (const t of map.tokens || []) {
      if (t.hidden && !showHidden) continue;
      const r = ((t.size || 1) * (g.size || 50)) / 2;
      ctx.save();
      ctx.globalAlpha = t.hidden ? 0.45 : 1;
      if (highlight && t.name && t.name.toLowerCase() === highlight.toLowerCase()) {
        ctx.beginPath(); ctx.arc(t.x, t.y, r + 6 / scale + r * 0.08, 0, Math.PI * 2); ctx.fillStyle = 'rgba(224,164,88,.85)'; ctx.fill();
      }
      const img = t.img && tokenImages[t.img];
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, t.x - r, t.y - r, r * 2, r * 2);
      else {
        ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.92, 0, Math.PI * 2);
        ctx.fillStyle = t.color || '#8b1e1e'; ctx.fill();
        ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = '#f2e6c9'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 0.8}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initials(t.name), t.x, t.y + r * 0.04);
      }
      ctx.restore();
    }
    drawOverlays(ctx, map, scale);
    if (map.fog && map.fog.enabled) {
      ctx.save(); ctx.globalAlpha = fogAlpha;
      ctx.drawImage(fogCanvas(map), 0, 0, map.w, map.h);
      ctx.restore();
    }
    drawRulers(ctx, map, scale);
    // Pings. Clocks on phones may differ from the DM's computer, so clamp each ping's age.
    const pings = [...(map.pings || []), ...(ping ? [ping] : [])];
    for (const pg of pings) {
      const age = Math.max(0, (Date.now() - (pg.seen || pg.t)) / 1000);
      if (age > 4) continue;
      const [r, gg, b] = pg.color === 'blue' ? [95, 179, 232] : pg.color === 'green' ? [110, 220, 120] : [255, 200, 80];
      for (let k = 0; k < 3; k++) {
        const p = ((age + k * 0.33) % 1);
        ctx.beginPath(); ctx.arc(pg.x, pg.y, (10 + p * 60) / scale, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${gg},${b},${1 - p})`; ctx.lineWidth = 4 / scale; ctx.stroke();
      }
      if (pg.by) label(ctx, pg.by, pg.x, pg.y - 30 / scale, scale, `rgb(${r},${gg},${b})`);
    }
  }

  window.MapRender = { draw, fogCanvas, applyOp, templateShape, rulerFeet };
})();
