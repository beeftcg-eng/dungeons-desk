// Timeline + in-world calendar. Notes with `world_date:` in their properties appear on the timeline.
// Dates can be written as "1024", "-300", "1024-3-15" or "15 Thawmonth 1024".
window.Timeline = (() => {
  const { h, toast, esc } = U;
  let els = {}, tab = 'timeline', viewMonth = null, typeFilter = new Set();
  const DEFAULT = {
    months: ['Deepwinter', 'Thawmonth', 'Seedtime', 'Rainmoot', 'Blossom', 'Highsun', 'Midsummer', 'Harvest', 'Leafall', 'Mistmonth', 'Frostfall', 'Longnight'].map(name => ({ name, days: 30 })),
    weekdays: ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'],
    era: '', now: { y: 1024, m: 1, d: 1 },
  };
  const cal = () => { const s = Store.get(); if (!s.calendar) s.calendar = JSON.parse(JSON.stringify(DEFAULT)); return s.calendar; };
  const TYPE_COLORS = { npc: '#e0a458', character: '#5fb3e8', monster: '#e05858', encounter: '#d06bd1', location: '#6bd18a', lore: '#c9b27a', faction: '#9a8cff', session: '#8fa3b8', campaign: '#e0a458' };

  // ---------- Date maths ----------
  function parse(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim(), c = cal();
    let m;
    if ((m = /^(-?\d+)$/.exec(s))) return { y: Number(m[1]), m: null, d: null };
    if ((m = /^(-?\d+)-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s))) return { y: Number(m[1]), m: Number(m[2]), d: m[3] ? Number(m[3]) : null };
    const monthIdx = (name) => c.months.findIndex(x => x.name.toLowerCase() === name.toLowerCase()) + 1;
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z' ]+?),?\s+(-?\d+)/.exec(s)) && monthIdx(m[2])) return { y: Number(m[3]), m: monthIdx(m[2]), d: Number(m[1]) };
    if ((m = /^([A-Za-z' ]+?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(-?\d+)/.exec(s)) && monthIdx(m[1])) return { y: Number(m[3]), m: monthIdx(m[1]), d: Number(m[2]) };
    if ((m = /^([A-Za-z' ]+?),?\s+(-?\d+)$/.exec(s)) && monthIdx(m[1])) return { y: Number(m[2]), m: monthIdx(m[1]), d: null };
    return null;
  }
  const key = (d) => d.y * 10000 + (d.m || 0) * 100 + (d.d || 0);
  function format(d, { weekday = false } = {}) {
    if (!d) return '';
    const c = cal(), era = c.era ? ' ' + c.era : '';
    if (!d.m) return `${d.y}${era}`;
    const month = (c.months[d.m - 1] || {}).name || `Month ${d.m}`;
    if (!d.d) return `${month} ${d.y}${era}`;
    return `${weekday ? weekdayOf(d) + ', ' : ''}${d.d} ${month} ${d.y}${era}`;
  }
  const yearLength = () => cal().months.reduce((a, m) => a + Number(m.days || 30), 0);
  function dayNumber(d) { // days since year 0, month 1, day 1
    const c = cal();
    let n = d.y * yearLength();
    for (let i = 0; i < (d.m || 1) - 1; i++) n += Number(c.months[i].days || 30);
    return n + (d.d || 1) - 1;
  }
  function fromDayNumber(n) {
    const c = cal(), yl = yearLength();
    const y = Math.floor(n / yl); let rest = n - y * yl, m = 0;
    while (m < c.months.length - 1 && rest >= Number(c.months[m].days || 30)) { rest -= Number(c.months[m].days || 30); m++; }
    return { y, m: m + 1, d: rest + 1 };
  }
  const weekdayOf = (d) => { const w = cal().weekdays; return w.length ? w[((dayNumber(d) % w.length) + w.length) % w.length] : ''; };
  function advance(days) {
    const c = cal();
    c.now = fromDayNumber(dayNumber(c.now) + days);
    Store.save(); publishToPlayers(); draw();
    toast(`It is now ${format(c.now, { weekday: true })}`);
  }

  // ---------- Events from notes ----------
  function events() {
    const cache = Notes.notesCache();
    const out = [];
    for (const n of Notes.list()) {
      const content = cache.get(n.path) || '';
      const { meta, body } = MD.splitFrontmatter(content);
      if (!meta || meta.world_date == null) continue;
      const d = parse(meta.world_date);
      if (!d) continue;
      const end = meta.world_date_end != null ? parse(meta.world_date_end) : null;
      const summary = (body.split('\n').map(l => l.trim()).find(l => l && !/^(#|>|\||-{3}|\*\*[^*]+:\*\*\s*$|```)/.test(l)) || '').replace(/[*_[\]]/g, '').slice(0, 160);
      out.push({ note: n, d, end, type: meta.type || 'note', summary });
    }
    return out.sort((a, b) => key(a.d) - key(b.d));
  }

  // ---------- UI ----------
  function mount(root) {
    els.head = h('div.tl-now');
    els.tabs = h('div.tabs',
      h('button.tab.on', { 'data-t': 'timeline', onclick: () => setTab('timeline') }, '📜 Timeline'),
      h('button.tab', { 'data-t': 'calendar', onclick: () => setTab('calendar') }, '📅 Calendar'));
    els.body = h('div.tl-body');
    root.append(h('div.page', h('header.page-head', h('h1', 'Timeline'), els.tabs), els.head, els.body));
    Store.onLoad(draw);
    draw();
  }
  const onShow = () => draw();
  function setTab(t) { tab = t; U.$$('.tab', els.tabs).forEach(b => b.classList.toggle('on', b.dataset.t === t)); draw(); }

  function draw() {
    if (!els.head) return;
    const c = cal();
    els.head.innerHTML = '';
    els.head.append(h('div.card.tl-now-card',
      h('div', h('div.dim.small', 'TODAY IN THE WORLD'), h('div.tl-today', format(c.now, { weekday: true }))),
      h('div.row',
        h('button', { onclick: () => advance(-1) }, '− 1 day'), h('button.primary', { onclick: () => advance(1) }, '+ 1 day'),
        h('button', { onclick: () => advance(cal().weekdays.length || 7) }, '+ 1 week'),
        h('button', { onclick: () => advance(Number((c.months[c.now.m - 1] || {}).days || 30)) }, '+ 1 month'),
        h('button', { onclick: async () => { const v = await U.prompt('Set today\'s date', format(c.now), 'e.g. 15 Thawmonth 1024'); const d = v && parse(v); if (d) { c.now = { y: d.y, m: d.m || 1, d: d.d || 1 }; Store.save(); publishToPlayers(); draw(); } else if (v) toast('Couldn\'t read that date', 'err'); } }, '📅 Set date'),
        h('button', { onclick: calendarSettings }, '⚙ Calendar'))));
    els.body.innerHTML = '';
    if (tab === 'timeline') drawTimeline(); else drawCalendar();
  }

  function drawTimeline() {
    const all = events();
    const types = [...new Set(all.map(e => e.type))];
    const shown = all.filter(e => !typeFilter.size || typeFilter.has(e.type));
    const now = cal().now;
    els.body.append(h('div.row',
      h('button.primary', { onclick: () => addEvent() }, '+ Add event'),
      types.map(t => h('button.small.chip-btn' + (typeFilter.has(t) ? '.on' : ''), { onclick: () => { typeFilter.has(t) ? typeFilter.delete(t) : typeFilter.add(t); draw(); } }, h('span.rel-dot', { style: `background:${TYPE_COLORS[t] || '#888'}` }), ' ', t)),
      h('span.dim.small', 'Add  world_date: 1024-3-15  to any note\'s properties to put it here.')));
    if (!shown.length) { els.body.append(h('div.empty-state', h('div.big', '⏳'), h('h2', 'No dated events yet'), h('p', 'Give notes a world_date property, or press “Add event”.'))); return; }
    const list = h('div.timeline');
    let lastYear = null, nowPlaced = false;
    const nowMarker = () => h('div.tl-marker', h('span', '▶ Today · ' + format(now)));
    for (const e of shown) {
      if (!nowPlaced && key(e.d) > key(now)) { list.append(nowMarker()); nowPlaced = true; }
      if (e.d.y !== lastYear) { list.append(h('div.tl-year', format({ y: e.d.y }))); lastYear = e.d.y; }
      list.append(h('div.tl-event', { onclick: () => Notes.open(e.note.path), style: `--c:${TYPE_COLORS[e.type] || '#888'}` },
        h('div.tl-date', format(e.d) + (e.end ? ' – ' + format(e.end) : '')),
        h('div.tl-title', e.note.name, h('span.chip', e.type)),
        e.summary ? h('div.dim.small', e.summary) : null));
    }
    if (!nowPlaced) list.append(nowMarker());
    els.body.append(list);
  }

  function drawCalendar() {
    const c = cal();
    viewMonth = viewMonth || { y: c.now.y, m: c.now.m };
    const mi = viewMonth.m - 1, month = c.months[mi];
    const evs = events();
    const days = Number(month.days || 30), wd = c.weekdays.length || 7;
    const first = dayNumber({ y: viewMonth.y, m: viewMonth.m, d: 1 });
    const lead = ((first % wd) + wd) % wd;
    const go = (dm) => { let m = viewMonth.m + dm, y = viewMonth.y; if (m < 1) { m = c.months.length; y--; } if (m > c.months.length) { m = 1; y++; } viewMonth = { y, m }; draw(); };
    const grid = h('div.cal-grid', { style: `grid-template-columns: repeat(${wd}, 1fr)` },
      c.weekdays.map(w => h('div.cal-wd', w)),
      Array.from({ length: lead }, () => h('div.cal-day.blank')),
      Array.from({ length: days }, (_, i) => {
        const d = { y: viewMonth.y, m: viewMonth.m, d: i + 1 };
        const today = c.now.y === d.y && c.now.m === d.m && c.now.d === d.d;
        const here = evs.filter(e => e.d.y === d.y && e.d.m === d.m && e.d.d === d.d);
        return h('div.cal-day' + (today ? '.today' : ''), { onclick: () => dayMenu(d, here) },
          h('div.cal-num', i + 1), here.slice(0, 3).map(e => h('div.cal-ev', { style: `--c:${TYPE_COLORS[e.type] || '#888'}` }, e.note.name)), here.length > 3 ? h('div.dim.small', `+${here.length - 3} more`) : null);
      }));
    const monthEvents = evs.filter(e => e.d.y === viewMonth.y && e.d.m === viewMonth.m && !e.d.d);
    els.body.append(h('div.card',
      h('div.row', h('button', { onclick: () => go(-1) }, '◀'), h('h2.cal-title', `${month.name} ${viewMonth.y}${c.era ? ' ' + c.era : ''}`), h('button', { onclick: () => go(1) }, '▶'), h('span.grow'),
        h('button.small', { onclick: () => { viewMonth = { y: c.now.y, m: c.now.m }; draw(); } }, 'Today')),
      monthEvents.length ? h('div.row', h('span.dim', 'This month:'), monthEvents.map(e => h('a.info-link', { onclick: () => Notes.open(e.note.path) }, e.note.name))) : null,
      grid));
  }

  function dayMenu(d, here) {
    const m = U.modal(format(d, { weekday: true }), [
      here.length ? h('div', here.map(e => h('a.info-link', { onclick: () => { m.close(); Notes.open(e.note.path); } }, e.note.name, h('span.dim', ` (${e.type})`)))) : h('p.dim', 'Nothing recorded on this day.'),
      h('div.row.end',
        h('button', { onclick: () => { cal().now = d; Store.save(); publishToPlayers(); m.close(); draw(); } }, 'Make this today'),
        h('button.primary', { onclick: () => { m.close(); addEvent(d); } }, '+ Add event on this day')),
    ]);
  }

  async function addEvent(d) {
    const name = await U.prompt('Event name', '', 'e.g. The Burning of Oakhaven');
    if (!name) return;
    const when = d ? `${d.y}-${d.m}-${d.d}` : await U.prompt('When? (e.g. 1024-3-15, 15 Thawmonth 1024, or just a year)', `${cal().now.y}-${cal().now.m}-${cal().now.d}`);
    if (!when) return;
    const pd = parse(when);
    if (!pd) return toast('Couldn\'t read that date', 'err');
    await Notes.create(name, `---\ntype: lore\ntags: [event]\nworld_date: ${pd.y}${pd.m ? '-' + pd.m : ''}${pd.d ? '-' + pd.d : ''}\n---\n# ${name}\n\n**When:** ${format(pd)}\n**Where:** [[ ]]\n**Who:** [[ ]]\n\n## What Happened\n\n\n## Consequences\n- \n`, null, 'Lore/Events');
  }

  function calendarSettings() {
    const c = cal();
    const months = h('textarea', { rows: 12, value: c.months.map(m => `${m.name}: ${m.days}`).join('\n') });
    const weekdays = h('input', { value: c.weekdays.join(', ') });
    const era = h('input', { value: c.era, placeholder: 'e.g. DR, AS (optional)' });
    const m = U.modal('Calendar settings', [
      h('label.field', h('span', 'Months — one per line as “Name: days”'), months),
      h('label.field', h('span', 'Days of the week (comma-separated)'), weekdays),
      h('label.field', h('span', 'Year suffix / era'), era),
      h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: () => {
        const ms = months.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const x = /^(.+?)\s*[:=]\s*(\d+)$/.exec(l); return x ? { name: x[1].trim(), days: Number(x[2]) } : { name: l, days: 30 }; });
        if (!ms.length) return toast('Add at least one month', 'err');
        c.months = ms; c.weekdays = weekdays.value.split(',').map(s => s.trim()).filter(Boolean); c.era = era.value.trim();
        c.now.m = Math.min(c.now.m, ms.length); c.now.d = Math.min(c.now.d, ms[c.now.m - 1].days);
        Store.save(); publishToPlayers(); m.close(); viewMonth = null; draw();
      } }, 'Save')),
    ]);
  }

  const playerDate = () => (Store.get().calendar ? format(cal().now, { weekday: true }) : null);
  const today = () => format(cal().now);
  return { mount, onShow, playerDate, today, parse, format };
})();
