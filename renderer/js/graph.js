// Graph view: notes as nodes, [[links]] as edges, simple force-directed layout on a canvas.
window.Graph = (() => {
  const COLORS = { npc: '#e0a458', character: '#5fb3e8', monster: '#e05858', encounter: '#d06bd1', location: '#6bd18a', lore: '#c9b27a', faction: '#9a8cff', session: '#8fa3b8' };

  // mode 'links' = every [[link]]; mode 'relations' = labelled relationships from "Relationships" sections.
  function open(notes, cache, resolve, onOpen, mode = 'links') {
    const canvas = U.h('canvas.graph-canvas');
    const switchTo = (md) => { m.close(); open(notes, cache, resolve, onOpen, md); };
    const modes = U.h('div.seg-group', U.h('button.seg' + (mode === 'links' ? '.on' : ''), { onclick: () => switchTo('links') }, 'All links'),
      U.h('button.seg' + (mode === 'relations' ? '.on' : ''), { onclick: () => switchTo('relations') }, 'Relationship web'));
    const legend = U.h('div.graph-legend', modes, mode === 'relations'
      ? [['#4caf50', 'ally / family'], ['#d9443a', 'enemy / rival'], ['#5fb3e8', 'works for / member'], ['#b9b2c9', 'other']].map(([c, k]) => U.h('span', U.h('i', { style: `background:${c}` }), k))
      : Object.entries(COLORS).map(([k, c]) => U.h('span', U.h('i', { style: `background:${c}` }), k)),
      mode === 'relations' ? U.h('span.dim', 'Add lines like “- [[Mira]] — ally” under a ## Relationships heading.') : null);
    let raf;
    const m = U.modal(mode === 'relations' ? 'Relationship web' : 'Graph view', [canvas, legend], { wide: true, onClose: () => cancelAnimationFrame(raf) });
    const W = canvas.width = canvas.clientWidth * devicePixelRatio, H = canvas.height = canvas.clientHeight * devicePixelRatio;
    const ctx = canvas.getContext('2d');

    let nodes = notes.map(n => {
      const { meta } = MD.splitFrontmatter(cache.get(n.path) || '');
      return { n, type: meta && meta.type, x: W / 2 + (Math.random() - .5) * W * .6, y: H / 2 + (Math.random() - .5) * H * .6, vx: 0, vy: 0, deg: 0 };
    });
    let idx = new Map(nodes.map((d, i) => [d.n.path, i]));
    let edges = [];
    if (mode === 'relations') {
      const rel = [];
      nodes.forEach(d => Notes.relationsIn(cache.get(d.n.path)).forEach(r => { const t = resolve(r.target); if (t && t.path !== d.n.path) rel.push([d.n.path, t.path, r.label]); }));
      const used = new Set(rel.flatMap(r => [r[0], r[1]]));
      nodes = nodes.filter(d => used.has(d.n.path));
      idx = new Map(nodes.map((d, i) => [d.n.path, i]));
      rel.forEach(([a, b, label]) => { const i = idx.get(a), j = idx.get(b); edges.push([i, j, label, Notes.relColor(label)]); nodes[i].deg++; nodes[j].deg++; });
      if (!nodes.length) legend.append(U.h('b', '  No relationships yet.'));
    } else nodes.forEach((d, i) => {
      const seen = new Set();
      for (const m of (cache.get(d.n.path) || '').matchAll(/\[\[([^\]|\n]+?)(?:\|[^\]\n]+)?\]\]/g)) {
        const r = resolve(m[1]); if (!r) continue;
        const j = idx.get(r.path); if (j == null || j === i || seen.has(j)) continue;
        seen.add(j); edges.push([i, j]); d.deg++; nodes[j].deg++;
      }
    });

    let scale = 1, ox = 0, oy = 0, drag = null, hover = null, alpha = 1;
    const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * devicePixelRatio - ox) / scale, y: ((e.clientY - r.top) * devicePixelRatio - oy) / scale }; };
    const radius = (d) => (5 + Math.min(d.deg, 12) * 1.4) * devicePixelRatio;
    const hit = (p) => nodes.find(d => (d.x - p.x) ** 2 + (d.y - p.y) ** 2 < (radius(d) + 4) ** 2);

    function step() {
      if (alpha > 0.02) {
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 0.01;
          const f = 9000 * devicePixelRatio / d2; dx *= f; dy *= f; a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
        }
        for (const [i, j] of edges) {
          const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (d - 90 * devicePixelRatio) * 0.02; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
        }
        for (const d of nodes) {
          d.vx += (W / 2 - d.x) * 0.002; d.vy += (H / 2 - d.y) * 0.002;
          if (d !== drag) { d.x += d.vx * alpha; d.y += d.vy * alpha; }
          d.vx *= 0.6; d.vy *= 0.6;
        }
        alpha *= 0.995;
      }
      draw(); raf = requestAnimationFrame(step);
    }
    function draw() {
      const style = getComputedStyle(document.body);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      const hi = hover ? nodes.indexOf(hover) : -1;
      const near = hover ? new Set(edges.filter(e => e[0] === hi || e[1] === hi).flatMap(e => [e[0], e[1]])) : null;
      ctx.lineWidth = 1 * devicePixelRatio;
      for (const [i, j, label, color] of edges) {
        const a = nodes[i], b = nodes[j];
        const lit = near && near.has(i) && near.has(j);
        if (color) {
          // Relationship: coloured arrow with its label.
          ctx.globalAlpha = near && !lit ? 0.2 : 1;
          ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2 * devicePixelRatio;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const ang = Math.atan2(b.y - a.y, b.x - a.x), r = radius(b) + 3 * devicePixelRatio, tx = b.x - Math.cos(ang) * r, ty = b.y - Math.sin(ang) * r, k = 9 * devicePixelRatio;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - Math.cos(ang - 0.4) * k, ty - Math.sin(ang - 0.4) * k); ctx.lineTo(tx - Math.cos(ang + 0.4) * k, ty - Math.sin(ang + 0.4) * k); ctx.fill();
          ctx.font = `${10 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color;
          ctx.fillText(label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 4 * devicePixelRatio);
          ctx.globalAlpha = 1; ctx.lineWidth = 1 * devicePixelRatio;
        } else {
          ctx.strokeStyle = lit ? 'rgba(230,180,90,.9)' : 'rgba(160,150,180,.25)';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.font = `${11 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'center';
      nodes.forEach((d, i) => {
        const dim = near && !near.has(i) && d !== hover;
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.fillStyle = COLORS[d.type] || '#b9b2c9';
        ctx.beginPath(); ctx.arc(d.x, d.y, radius(d), 0, Math.PI * 2); ctx.fill();
        if (scale > 0.6 || d === hover || d.deg > 3) { ctx.fillStyle = style.getPropertyValue('--text') || '#ddd'; ctx.fillText(d.n.name, d.x, d.y + radius(d) + 13 * devicePixelRatio); }
      });
      ctx.globalAlpha = 1;
    }
    canvas.addEventListener('mousedown', (e) => { const p = toWorld(e); drag = hit(p); if (!drag) drag = { pan: true, sx: e.clientX, sy: e.clientY, ox, oy }; drag.moved = false; });
    canvas.addEventListener('mousemove', (e) => {
      const p = toWorld(e);
      if (drag && drag.pan) { ox = drag.ox + (e.clientX - drag.sx) * devicePixelRatio; oy = drag.oy + (e.clientY - drag.sy) * devicePixelRatio; return; }
      if (drag) { drag.x = p.x; drag.y = p.y; drag.moved = true; alpha = Math.max(alpha, 0.3); return; }
      hover = hit(p); canvas.style.cursor = hover ? 'pointer' : 'grab';
    });
    canvas.addEventListener('mouseup', () => { if (drag && !drag.pan && !drag.moved) { m.close(); onOpen(drag.n.path); } drag = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), mx = (e.clientX - r.left) * devicePixelRatio, my = (e.clientY - r.top) * devicePixelRatio;
      const k = e.deltaY < 0 ? 1.1 : 1 / 1.1; ox = mx - (mx - ox) * k; oy = my - (my - oy) * k; scale *= k;
    }, { passive: false });
    step();
  }
  return { open };
})();
