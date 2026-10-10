// Dice roller: a floating panel on every screen, plus clickable dice anywhere (.roll elements).
// Click = normal, Shift+click = advantage, Ctrl/Alt+click = disadvantage (for d20 rolls).
window.Dice = (() => {
  const { h, esc } = U;
  let history = [];
  try { history = JSON.parse(localStorage.getItem('dice.history') || '[]'); } catch { history = []; }
  let mode = 'normal', els = {};

  function roll(expr, { label = '', mode: m = 'normal' } = {}) {
    expr = String(expr).replace(/\s+/g, '').replace(/−/g, '-');
    let res = U.roll(expr), alt = null;
    const d20 = /^1?d20([+-]\d+)?$/i.test(expr);
    if (d20 && m !== 'normal') {
      alt = U.roll(expr);
      const keep = m === 'adv' ? (alt.total > res.total ? alt : res) : (alt.total < res.total ? alt : res);
      const drop = keep === res ? alt : res;
      res = { ...keep, detail: `${keep.detail}  (${m === 'adv' ? 'adv' : 'dis'}; other ${drop.total})` };
    }
    if (isNaN(res.total)) { U.toast('Can\'t roll “' + expr + '”', 'err'); return null; }
    const natural = d20 ? Number((/\[(\d+)\]/.exec(res.detail) || [])[1]) : null;
    const entry = { expr, label, total: res.total, detail: res.detail, mode: d20 ? m : 'normal', crit: natural === 20, fumble: natural === 1, t: Date.now() };
    history.unshift(entry); history = history.slice(0, 50);
    try { localStorage.setItem('dice.history', JSON.stringify(history)); } catch { /* history is a convenience only */ }
    show(entry);
    return entry;
  }

  function show(e) {
    drawHistory();
    const box = h('div.dice-pop' + (e.crit ? '.crit' : e.fumble ? '.fumble' : ''),
      h('div.dice-pop-label', e.label || e.expr, e.mode !== 'normal' ? h('span.chip', e.mode === 'adv' ? 'Advantage' : 'Disadvantage') : null),
      h('div.dice-pop-total', e.total), h('div.dice-pop-detail', `${e.expr}: ${e.detail}`), e.crit ? h('div.dice-pop-flag', 'NATURAL 20!') : e.fumble ? h('div.dice-pop-flag', 'Natural 1…') : null);
    U.$$('.dice-pop').forEach(p => p.remove());
    document.body.append(box);
    setTimeout(() => box.classList.add('out'), 3500);
    setTimeout(() => box.remove(), 4000);
  }

  function drawHistory() {
    if (!els.hist) return;
    els.hist.innerHTML = '';
    history.forEach(e => els.hist.append(h('div.dice-row' + (e.crit ? '.crit' : e.fumble ? '.fumble' : ''), { title: 'Click to roll again', onclick: () => roll(e.expr, { label: e.label, mode: e.mode }) },
      h('b', e.total), h('span', e.label ? `${e.label} ` : '', h('span.dim', e.expr + (e.mode !== 'normal' ? ` (${e.mode})` : ''))))));
  }

  function mount() {
    const input = h('input', { placeholder: '2d6+3, 1d20+5, 4d6…', onkeydown: (e) => { if (e.key === 'Enter' && input.value.trim()) roll(input.value, { mode }); } });
    const modeBtn = (m, label) => h('button.seg' + (m === mode ? '.on' : ''), { 'data-m': m, onclick: () => { mode = m; U.$$('.dice-modes .seg').forEach(b => b.classList.toggle('on', b.dataset.m === m)); } }, label);
    els.hist = h('div.dice-hist');
    els.panel = h('div.dice-panel.hidden',
      h('div.row', h('h3', '🎲 Dice'), h('span.grow'), h('button.icon', { onclick: () => { history = []; try { localStorage.removeItem('dice.history'); } catch { /* ignore */ } drawHistory(); }, title: 'Clear history' }, '🧹'), h('button.icon', { onclick: toggle }, '✕')),
      h('div.dice-quick', [4, 6, 8, 10, 12, 20, 100].map(d => h('button', { onclick: (e) => roll(`1d${d}`, { mode: d === 20 ? mode : 'normal' }) }, 'd' + d))),
      h('div.seg-group.dice-modes', modeBtn('dis', 'Disadv.'), modeBtn('normal', 'Normal'), modeBtn('adv', 'Advantage')),
      h('div.row', input, h('button.primary', { onclick: () => input.value.trim() && roll(input.value, { mode }) }, 'Roll')),
      h('p.hint', 'Tip: click any dice or bonus in a note or stat block. Shift+click = advantage, Ctrl+click = disadvantage.'),
      els.hist);
    els.fab = h('button.dice-fab', { title: 'Dice roller (Ctrl+D)', onclick: toggle }, '🎲');
    document.body.append(els.panel, els.fab);
    drawHistory();
    document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggle(); } });

    // Clickable dice anywhere in the DM app.
    document.addEventListener('click', (e) => {
      const el = e.target.closest('.roll');
      if (!el || el.closest('textarea')) return;
      e.preventDefault(); e.stopPropagation();
      const sb = el.closest('.statblock');
      const who = sb ? sb.querySelector('.sb-name')?.textContent : '';
      const entry = el.closest('.sb-entry');
      const what = el.dataset.label || (entry && entry.querySelector('b i') ? entry.querySelector('b i').textContent.replace(/\.$/, '') + (el.dataset.d20 ? ' (to hit)' : ' (damage)') : '');
      const m = e.shiftKey ? 'adv' : (e.ctrlKey || e.altKey) ? 'dis' : 'normal';
      roll(el.dataset.roll, { label: [who, what].filter(Boolean).join(' · '), mode: m });
    }, true);
  }

  function toggle() { els.panel.classList.toggle('hidden'); if (!els.panel.classList.contains('hidden')) els.panel.querySelector('input').focus(); }

  return { mount, roll };
})();
