// Import monsters, spells and magic items into the campaign (as homebrew notes):
//  • Paste text: copy a stat block / spell / item from D&D Beyond, a PDF or a web page and paste it.
//  • Open5e: search the free, open-licensed Open5e library (SRD, Tome of Beasts, Deep Magic, …).
//  • File: JSON in Open5e or 5e-database format.
//  • Book PDF: a book the DM owns (renderer/js/book-import.js finds the entries; they're saved only in this campaign).
window.Importer = (() => {
  const { h, toast, esc, cap } = U;
  const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const FULL = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
  const title = (s) => String(s || '').replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const norm = (t) => String(t || '').replace(/\r/g, '').replace(/−/g, '-').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const LABELS = /(Melee or Ranged Weapon Attack:|Melee Weapon Attack:|Ranged Weapon Attack:|Melee Spell Attack:|Ranged Spell Attack:|Melee or Ranged Attack Roll:|Melee Attack Roll:|Ranged Attack Roll:|Hit or Miss:|Hit:|Miss:|Failure or Success:|Failure:|Success:|Trigger:|Response:|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:)(?!\*)/g;
  const ital = (s) => String(s || '').replace(LABELS, '*$1*');

  // ======================= Text parsers =======================
  function detect(text) {
    const t = norm(text);
    if (/^\s*https?:\/\//i.test(t.trim())) return 'link';
    if (/(^|\n)\s*(armor class|ac)\s+\d+/i.test(t) && /(^|\n)\s*(hit points|hp)\s+\d+/i.test(t)) return 'monster';
    if (/casting time/i.test(t)) return 'spell';
    if (/(common|uncommon|rare|very rare|legendary|artifact|rarity varies)/i.test(t.split('\n').slice(0, 4).join(' '))) return 'item';
    return null;
  }

  function parseMonster(text) {
    const t = norm(text);
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
    const flat = lines.join(' ');
    const sb = { name: (lines[0] || 'Imported Creature').replace(/\s*\((?:legacy|2014|2024)\)\s*$/i, '') };
    // Ability scores — 2024 table ("Str 8 -1 -1"), 2014 inline ("STR 8 (-1)"), or a 2014 header row.
    let m;
    const re24 = /\b(STR|DEX|CON|INT|WIS|CHA)\b\s+(\d{1,2})\s+([+-]\d+)\s+([+-]\d+)/gi, saves = [];
    while ((m = re24.exec(flat))) { const k = m[1].toLowerCase(); sb[k] = Number(m[2]); if (m[4] !== m[3]) saves.push(k); }
    if (sb.str == null) { const re14 = /\b(STR|DEX|CON|INT|WIS|CHA)\b\s*(\d{1,2})\s*\(([+-]?\d+)\)/gi; while ((m = re14.exec(flat))) sb[m[1].toLowerCase()] = Number(m[2]); }
    if (sb.str == null && (m = /STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA\s+((?:\d{1,2}\s*\([+-]?\d+\)\s*){6})/i.exec(flat))) {
      [...m[1].matchAll(/(\d{1,2})\s*\(/g)].forEach((x, i) => (sb[ABIL[i]] = Number(x[1])));
    }
    if (saves.length) sb.saves = saves;

    const isAbilityNoise = (l) => /^(str|dex|con|int|wis|cha|mod|save|score|mod save)$/i.test(l) || /^\d{1,2}\s*\([+-]?\d+\)$/.test(l) || /^[+-]?\d+$/.test(l)
      || /^(str|dex|con|int|wis|cha)\b(\s+[\d+(-]|\s*$)/i.test(l) || /^STR\s+DEX/i.test(l) || /^(\d{1,2}\s*\([+-]?\d+\)\s*){2,}$/.test(l);
    const SECTION = /^(traits|actions|bonus actions|reactions|legendary actions|lair actions|mythic actions)$/i;
    const ENTRY = /^([A-Z][\w'’\-/ ,]{0,58}?(?:\s*\([^)]{1,40}\))?)\.\s+(.+)$/;
    const set = (k, v) => { v = v.trim(); if (v) sb[k] = v; };
    let section = null, entry = null, inProps = true, legendIntro = [];
    const sections = { traits: [], actions: [], bonus_actions: [], reactions: [], legendary_actions: [] };

    for (const l of lines.slice(1)) {
      if (SECTION.test(l)) {
        inProps = false;
        const key = l.toLowerCase().replace(/ /g, '_');
        section = key === 'lair_actions' || key === 'mythic_actions' ? 'legendary_actions' : key;
        entry = null; continue;
      }
      if (inProps) {
        if ((m = /^((?:tiny|small|medium|large|huge|gargantuan)(?:\s+or\s+\w+)?)\s+(.+?),\s*(.+)$/i.exec(l))) { sb.size = cap(m[1].split(/\s+or\s+/i)[0].toLowerCase()); sb.type = cap(m[2]); sb.alignment = title(m[3]); continue; }
        if ((m = /^(?:armor class|ac)\s+(\d+)\s*(?:\((.+)\))?/i.exec(l))) { sb.ac = Number(m[1]); if (m[2]) sb.ac_note = m[2]; const im = /initiative\s+([+-]\d+)/i.exec(l); if (im) sb.initiative = im[1]; continue; }
        if ((m = /^initiative\s+([+-]\d+)/i.exec(l))) { sb.initiative = m[1]; continue; }
        if ((m = /^(?:hit points|hp)\s+(\d+)\s*(?:\((.+)\))?/i.exec(l))) { sb.hp = Number(m[1]); if (m[2]) sb.hit_dice = m[2]; continue; }
        if (/^speed\b/i.test(l)) { set('speed', l.replace(/^speed\s*/i, '')); continue; }
        if (/^saving throws\b/i.test(l)) { sb.saves = [...l.matchAll(/\b(str|dex|con|int|wis|cha)\w*\s*[+-]\d+/gi)].map(x => x[1].toLowerCase()); continue; }
        if (/^skills\b/i.test(l)) { set('skills', l.replace(/^skills\s*/i, '')); continue; }
        if (/^(damage )?vulnerabilities\b/i.test(l)) { set('vulnerabilities', l.replace(/^(damage )?vulnerabilities\s*/i, '')); continue; }
        if (/^(damage )?resistances\b/i.test(l)) { set('resistances', l.replace(/^(damage )?resistances\s*/i, '')); continue; }
        if (/^damage immunities\b/i.test(l)) { set('immunities', l.replace(/^damage immunities\s*/i, '')); continue; }
        if (/^condition immunities\b/i.test(l)) { set('condition_immunities', l.replace(/^condition immunities\s*/i, '')); continue; }
        if (/^immunities\b/i.test(l)) { const [d, c] = l.replace(/^immunities\s*/i, '').split(';'); set('immunities', d || ''); if (c) set('condition_immunities', c); continue; }
        if (/^gear\b/i.test(l)) { set('gear', l.replace(/^gear\s*/i, '')); continue; }
        if (/^senses\b/i.test(l)) { set('senses', l.replace(/^senses\s*/i, '')); continue; }
        if (/^languages\b/i.test(l)) { set('languages', l.replace(/^languages\s*/i, '')); continue; }
        if ((m = /^(?:challenge|cr)\s+([\d/]+)/i.exec(l))) { sb.cr = m[1]; continue; }
        if (/^(proficiency bonus|pb)\b/i.test(l) || isAbilityNoise(l)) continue;
        if (!ENTRY.test(l)) continue; // stray text between properties (tooltips etc.)
        inProps = false; section = 'traits';
      }
      if (!section) section = 'traits';
      const em = ENTRY.exec(l);
      if (em) { entry = { name: em[1].trim(), desc: em[2].trim() }; sections[section].push(entry); }
      else if (section === 'legendary_actions' && !entry) legendIntro.push(l);
      else if (entry) entry.desc += '\n' + l;
      else sections[section].push(l);
    }
    for (const [k, list] of Object.entries(sections)) if (list.length) sb[k] = list.map(e => typeof e === 'string' ? ital(e) : { name: e.name, desc: ital(e.desc) });
    if (legendIntro.length) sb.legendary_desc = legendIntro.join(' ');
    sb.size = sb.size || 'Medium'; sb.type = sb.type || 'Creature'; sb.ac = sb.ac ?? 10; sb.hp = sb.hp ?? 1; sb.cr = sb.cr || '0';
    ABIL.forEach(a => { if (sb[a] == null) sb[a] = 10; });
    return sb;
  }

  function parseSpell(text) {
    const lines = norm(text).split('\n').map(l => l.trim()).filter(Boolean);
    const sp = { name: lines[0], level: 0, school: 'Evocation', time: '', range: '', comp: '', dur: '', conc: false, ritual: false, classes: [], desc: '', higher: '' };
    const used = new Set([0]);
    const field = (re) => {
      for (let i = 1; i < lines.length; i++) {
        if (used.has(i)) continue;
        const m = re.exec(lines[i]);
        if (!m) continue;
        used.add(i);
        let v = (m[1] || '').trim();
        if (!v && lines[i + 1]) { v = lines[i + 1]; used.add(i + 1); }
        return v;
      }
      return '';
    };
    let m;
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      const l = lines[i];
      if ((m = /^(\d)(?:st|nd|rd|th)[- ]level\s+(\w+)(.*)$/i.exec(l)) || (m = /^level\s+(\d)\s+(\w+)(.*)$/i.exec(l))) { sp.level = Number(m[1]); sp.school = cap(m[2].toLowerCase()); sp.ritual = /ritual/i.test(m[3]); const cl = /\(([^)]*)\)/.exec(m[3]); if (cl && !/^ritual$/i.test(cl[1])) sp.classes = cl[1].split(',').map(x => x.trim()).filter(x => x && !/ritual/i.test(x)); used.add(i); break; }
      if ((m = /^(\w+)\s+cantrip(.*)$/i.exec(l)) || (m = /^cantrip\s+(\w+)(.*)$/i.exec(l))) { sp.level = 0; sp.school = cap(m[1].toLowerCase()); const cl = /\(([^)]*)\)/.exec(m[2] || ''); if (cl) sp.classes = cl[1].split(',').map(x => x.trim()); used.add(i); break; }
    }
    // D&D Beyond spell pages list "Level / Casting Time / Range/Area / …" with the value on the next line.
    const lv = field(/^level:?\s*(.*)$/i); if (lv) { sp.level = /cantrip/i.test(lv) ? 0 : Number((/\d/.exec(lv) || [0])[0]); }
    const sc = field(/^school:?\s*(.*)$/i); if (sc) sp.school = cap(sc.toLowerCase());
    sp.time = field(/^casting time:?\s*(.*)$/i);
    sp.range = field(/^range(?:\/area)?:?\s*(.*)$/i);
    sp.comp = field(/^components:?\s*(.*)$/i);
    sp.dur = field(/^duration:?\s*(.*)$/i);
    field(/^attack\/save:?\s*(.*)$/i); field(/^damage\/effect:?\s*(.*)$/i);
    const avail = field(/^(?:available for|classes|spell lists?):?\s*(.*)$/i); if (avail) sp.classes = avail.split(',').map(x => x.trim()).filter(Boolean);
    field(/^spell tags:?\s*(.*)$/i);
    if (/ritual/i.test(sp.time)) sp.ritual = true;
    if (/concentration/i.test(sp.dur)) { sp.conc = true; sp.dur = sp.dur.replace(/concentration,?\s*(up to\s*)?/i, (_, u) => u ? 'Up to ' : '').trim(); sp.dur = cap(sp.dur); }
    const desc = [], higher = [];
    let inHigher = false;
    lines.forEach((l, i) => {
      if (used.has(i)) return;
      if (/^\*\s*-\s*\((.+)\)$/.test(l)) { sp.comp = sp.comp.replace(/\s*\*$/, '') + ` (${/\((.+)\)/.exec(l)[1]})`; return; }
      const hm = /^(?:\*+)?(at higher levels|using a higher-level spell slot|cantrip upgrade)\.?(?:\*+)?\s*(.*)$/i.exec(l);
      if (hm) { inHigher = true; if (hm[2]) higher.push(hm[2]); return; }
      (inHigher ? higher : desc).push(l);
    });
    sp.desc = desc.join('\n\n'); sp.higher = higher.join(' ');
    return sp;
  }

  function parseItem(text) {
    const lines = norm(text).split('\n').map(l => l.trim()).filter(Boolean);
    const it = { name: lines[0], type: 'Wondrous Item', rarity: 'Uncommon', attune: false, desc: '' };
    let start = 1, m;
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      if ((m = /^(.+?),\s*(common|uncommon|rare|very rare|legendary|artifact|rarity varies)\b(.*)$/i.exec(lines[i]))) {
        it.type = title(m[1].replace(/\s*\(.*\)\s*/, ' ').trim()); it.rarity = title(m[2]);
        const a = /\((requires attunement[^)]*)\)/i.exec(m[3]); if (a) it.attune = a[1].toLowerCase() === 'requires attunement' ? true : a[1];
        start = i + 1; break;
      }
    }
    it.desc = lines.slice(start).join('\n\n');
    return it;
  }

  // ======================= Open5e / JSON converters =======================
  function fromJsonMonster(o) {
    const ac = Array.isArray(o.armor_class) ? o.armor_class[0] : { value: o.armor_class };
    const speed = o.speed && typeof o.speed === 'object'
      ? Object.entries(o.speed).filter(([k]) => k !== 'hover' && k !== 'notes').map(([k, v]) => { const val = /ft/.test(String(v)) ? v : `${v} ft.`; return k === 'walk' ? val : `${cap(k)} ${val}`; }).join(', ') + (o.speed.hover ? ' (hover)' : '')
      : (o.speed || '30 ft.');
    const sb = { name: o.name, size: o.size || 'Medium', type: cap(String(o.type || 'creature')) + (o.subtype ? ` (${cap(o.subtype)})` : ''), alignment: title(o.alignment || ''),
      ac: Number(ac.value ?? ac.ac ?? 10) || 10, hp: o.hit_points || 1, hit_dice: o.hit_dice || o.hit_points_roll || '', speed };
    if (o.armor_desc) sb.ac_note = o.armor_desc;
    ABIL.forEach(a => (sb[a] = Number(o[FULL[a]] ?? 10)));
    const saves = ABIL.filter(a => o[`${FULL[a]}_save`] != null);
    const profs = (o.proficiencies || []).map(p => ({ n: p.proficiency.name, v: p.value }));
    profs.filter(p => /^Saving/.test(p.n)).forEach(p => saves.push(p.n.split(': ')[1].toLowerCase()));
    if (saves.length) sb.saves = [...new Set(saves)];
    const skills = o.skills && typeof o.skills === 'object' && !Array.isArray(o.skills) ? Object.entries(o.skills).map(([k, v]) => `${title(k.replace(/_/g, ' '))} +${v}`) : profs.filter(p => /^Skill/.test(p.n)).map(p => `${p.n.split(': ')[1]} +${p.v}`);
    if (skills.length) sb.skills = skills.join(', ');
    const list = (v) => Array.isArray(v) ? v.map(x => typeof x === 'object' ? x.name : cap(x)).join(', ') : v;
    for (const [src, dst] of [['damage_vulnerabilities', 'vulnerabilities'], ['damage_resistances', 'resistances'], ['damage_immunities', 'immunities'], ['condition_immunities', 'condition_immunities']]) { const v = list(o[src]); if (v) sb[dst] = v; }
    if (o.senses) sb.senses = typeof o.senses === 'string' ? o.senses : Object.entries(o.senses).filter(([k]) => k !== 'passive_perception').map(([k, v]) => `${cap(k)} ${v}`).join(', ');
    if (o.senses && o.senses.passive_perception) sb.passive = o.senses.passive_perception;
    sb.languages = o.languages || '—';
    const cr = o.challenge_rating ?? o.cr ?? 0;
    sb.cr = ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[cr] || String(cr);
    const entries = (v) => (Array.isArray(v) ? v : []).filter(e => e && e.name).map(e => ({ name: e.name, desc: ital(e.desc || '') }));
    for (const [src, dst] of [['special_abilities', 'traits'], ['actions', 'actions'], ['bonus_actions', 'bonus_actions'], ['reactions', 'reactions'], ['legendary_actions', 'legendary_actions']]) { const e = entries(o[src]); if (e.length) sb[dst] = e; }
    if (o.legendary_desc) sb.legendary_desc = o.legendary_desc;
    return sb;
  }
  const yes = (v) => v === true || /^yes|true$/i.test(String(v || ''));
  const fromJsonSpell = (o) => ({ name: o.name, level: Number(o.level_int ?? o.level ?? 0) || 0, school: cap(String((o.school && o.school.name) || o.school || 'Evocation').toLowerCase()),
    time: o.casting_time || '', range: o.range || '', comp: (Array.isArray(o.components) ? o.components.join(', ') : o.components || '') + (o.material ? ` (${o.material})` : ''),
    dur: o.duration || '', conc: yes(o.concentration) || yes(o.requires_concentration), ritual: yes(o.ritual) || yes(o.can_be_cast_as_ritual),
    classes: Array.isArray(o.classes) ? o.classes.map(c => c.name || c) : String(o.dnd_class || '').split(',').map(x => x.trim()).filter(Boolean),
    desc: Array.isArray(o.desc) ? o.desc.join('\n\n') : (o.desc || o.description || ''), higher: Array.isArray(o.higher_level) ? o.higher_level.join(' ') : (o.higher_level || '') });
  const fromJsonItem = (o) => ({ name: o.name, type: (o.equipment_category && o.equipment_category.name) || o.type || 'Wondrous Item', rarity: title((o.rarity && o.rarity.name) || o.rarity || 'Uncommon'),
    attune: o.requires_attunement ? (o.requires_attunement === true ? true : o.requires_attunement) : !!o.attunement, desc: Array.isArray(o.desc) ? o.desc.join('\n\n') : (o.desc || '') });
  function kindOfJson(o) {
    if (!o || typeof o !== 'object' || !o.name) return null;
    if ('hit_points' in o && ('armor_class' in o)) return 'monster';
    if ('casting_time' in o) return 'spell';
    if ('rarity' in o) return 'item';
    return null;
  }
  const convert = { monster: fromJsonMonster, spell: fromJsonSpell, item: fromJsonItem };

  // ======================= UI =======================
  function preview(kind, obj) {
    if (kind === 'monster') { const d = h('div', { html: Statblock.render(obj) }); MD.decorateText(d); return d; }
    if (kind === 'spell') return h('div.spell-card', h('h1', obj.name), h('div.spell-sub', Homebrew.levelText(obj.level, obj.school) + (obj.ritual ? ' (Ritual)' : ''), obj.classes.length ? h('span.dim', ' · ' + obj.classes.join(', ')) : null),
      h('div.spell-props', [['Casting Time', obj.time], ['Range', obj.range], ['Components', obj.comp], ['Duration', (obj.conc ? 'Concentration, ' : '') + obj.dur]].map(([k, v]) => h('div', h('b', k + ': '), v || '—'))),
      h('div.md', { html: MD.simple(obj.desc + (obj.higher ? `\n\n***Using a Higher-Level Spell Slot.*** ${obj.higher}` : '')) }));
    return h('div.spell-card', h('h1', obj.name), h('div.spell-sub', `${obj.type}, ${obj.rarity}${obj.attune ? ' (requires attunement)' : ''}`), h('div.md', { html: MD.simple(obj.desc) }));
  }
  function saveButtons(kind, obj, source, after) {
    const done = (p) => { toast(`${obj.name} added to your campaign`); after && after(p); };
    const edit = () => {
      if (kind === 'monster') Statblock.openBuilder(obj, (sb) => Homebrew.save('monster', sb, { source }).then(done));
      else if (kind === 'spell') Homebrew.spellForm({ ...obj, source }, (x) => Homebrew.save('spell', x).then(done));
      else Homebrew.itemForm({ ...obj, source }, (x) => Homebrew.save('item', x).then(done));
    };
    return h('div.row', h('button.primary', { onclick: () => Homebrew.save(kind, { ...obj, source }, { source }).then(done) }, '💾 Save to campaign'), h('button', { onclick: edit }, '✏ Edit first'));
  }

  function open() {
    const tabs = h('div.tabs'), body = h('div.imp-body');
    const tab = (label, fn) => { const b = h('button.tab', { onclick: () => { U.$$('.tab', tabs).forEach(x => x.classList.remove('on')); b.classList.add('on'); body.innerHTML = ''; fn(); } }, label); tabs.append(b); return b; };
    const m = U.modal('Import into this campaign', [tabs, body], { wide: true });
    tab('📋 Paste text', pasteTab).click();
    tab('🌐 Open5e library', open5eTab);
    tab('📁 JSON file', fileTab);
    tab('📕 Book PDF', bookTab);

    function pasteTab() {
      const ta = h('textarea.imp-text', { rows: 16, spellcheck: 'false', placeholder: 'Paste a monster stat block, a spell or a magic item here.\n\nFrom D&D Beyond: open the monster/spell/item page, select everything from the name down to the end of the block, copy (Ctrl+C) and paste here (Ctrl+V).\nWorks with PDFs and most websites too.' });
      const kindSel = h('select', h('option', { value: '' }, 'Detect automatically'), h('option', { value: 'monster' }, 'Monster'), h('option', { value: 'spell' }, 'Spell'), h('option', { value: 'item' }, 'Magic item'));
      const out = h('div.imp-preview', h('p.dim', 'The preview appears here.'));
      const run = () => {
        out.innerHTML = '';
        const text = ta.value.trim();
        if (!text) { out.append(h('p.dim', 'The preview appears here.')); return; }
        const kind = kindSel.value || detect(text);
        if (kind === 'link') {
          out.append(h('div.callout.callout-warning', h('div.callout-title', '⚠ Links can\'t be imported directly'),
            h('p', /dndbeyond/i.test(text) ? 'D&D Beyond doesn\'t let other apps read its pages (there\'s no public API, and its terms don\'t allow scraping), so the app can\'t fetch content from a link.' : 'The app can\'t fetch content from links.'),
            h('p', h('b', 'Do this instead: '), 'open the page in your browser, select the stat block (from the name to the last action), copy it, and paste the text here. Anything you can see on the page works, including content you own.')));
          return;
        }
        if (!kind) { out.append(h('p', 'Couldn\'t tell what this is. Choose Monster, Spell or Magic item above.')); return; }
        const obj = kind === 'monster' ? parseMonster(text) : kind === 'spell' ? parseSpell(text) : parseItem(text);
        out.append(h('div.row', h('span.chip.live', { style: 'text-transform:capitalize' }, kind), h('span.dim', 'Check the preview, then save. Use “Edit first” to fix anything the parser missed.')), saveButtons(kind, obj, 'Imported (pasted)', () => m.close()), preview(kind, obj));
      };
      ta.addEventListener('input', U.debounce(run, 250));
      kindSel.addEventListener('change', run);
      body.append(h('div.imp-paste', h('div', h('div.row', h('b', 'Paste here'), h('span.grow'), kindSel), ta), out));
      setTimeout(() => ta.focus(), 30);
    }

    function open5eTab() {
      const kind = h('select', h('option', { value: 'monsters' }, 'Monsters'), h('option', { value: 'spells' }, 'Spells'), h('option', { value: 'magicitems' }, 'Magic items'));
      const doc = h('select', h('option', { value: '' }, 'All sources'));
      const q = h('input', { placeholder: 'Search Open5e… (e.g. dragon, fireball, cloak)' });
      const list = h('div.imp-results'), out = h('div.imp-preview', h('p.dim', 'Open5e is a free library of open-licensed 5e content: the SRD plus Kobold Press books like Tome of Beasts, Creature Codex and Deep Magic.'));
      dm.web.open5e('/v1/documents/?limit=100').then(r => r.results.forEach(d => doc.append(h('option', { value: d.slug }, d.title)))).catch(() => {});
      const search = async () => {
        list.innerHTML = ''; list.append(h('p.dim', 'Searching…'));
        try {
          const params = new URLSearchParams({ limit: '40', search: q.value.trim() });
          if (doc.value) params.set('document__slug', doc.value);
          const r = await dm.web.open5e(`/v1/${kind.value}/?${params}`);
          list.innerHTML = '';
          list.append(h('div.tree-label', `${r.count} result${r.count === 1 ? '' : 's'}${r.count > 40 ? ' (showing 40)' : ''}`));
          r.results.forEach(o => list.append(h('div.ref-item', { onclick: (e) => { U.$$('.ref-item', list).forEach(x => x.classList.remove('active')); e.currentTarget.classList.add('active'); show(o); } },
            h('div', h('div', o.name), h('div.dim.small', [o.challenge_rating != null ? `CR ${o.challenge_rating}` : o.level_int != null ? (o.level_int ? `Level ${o.level_int}` : 'Cantrip') : o.rarity, o.document__title].filter(Boolean).join(' · '))))));
        } catch (e) { list.innerHTML = ''; list.append(h('p', 'Couldn\'t reach Open5e. Check your internet connection. ', h('span.dim', String(e.message || e).replace(/^.*Error: /, '')))); }
      };
      const show = (o) => {
        const k = kind.value === 'monsters' ? 'monster' : kind.value === 'spells' ? 'spell' : 'item';
        const obj = convert[k](o);
        out.innerHTML = '';
        out.append(h('div.row', h('span.chip', o.document__title || 'Open5e'), o.document__license_url ? h('a.dim.small', { href: o.document__license_url, target: '_blank' }, 'license') : null), saveButtons(k, obj, o.document__title || 'Open5e'), preview(k, obj));
      };
      q.addEventListener('keydown', (e) => e.key === 'Enter' && search());
      body.append(h('div.row', kind, doc, q, h('button.primary', { onclick: search }, '🔍 Search')), h('div.imp-o5', list, out));
      setTimeout(() => q.focus(), 30);
    }

    // A book PDF the DM owns: every monster, spell and magic item found in it, to tick and save into this campaign.
    function bookTab() {
      const file = h('input', { type: 'file', accept: '.pdf,application/pdf', style: 'display:none' });
      body.append(file, h('div.imp-book-intro',
        h('p', 'Pick a PDF of a book you own, like a Monster Manual or a Dungeon Master\'s Guide. The app finds the monsters, spells and magic items in it, and you choose which ones to save as homebrew in this campaign.'),
        h('p.dim.small', 'The book stays on this device: nothing is uploaded, and what you save lives only in this campaign\'s notes. Players see an entry only if you share it with them.'),
        h('p.dim.small', 'Scanned books have rough text. Entries that look wrong get a ⚠: check them against the page shown, or fix them with “Edit first”.'),
        h('button.primary', { onclick: () => file.click() }, '📕 Choose a PDF')));
      file.addEventListener('change', () => { if (file.files[0]) readBook(file.files[0]); });
    }
    async function readBook(f) {
      const source = f.name.replace(/\.pdf$/i, '').trim() || 'Book';
      let stop = false;
      const bar = h('progress', { max: 1, value: 0 }), label = h('span.dim', 'Opening the PDF…');
      body.innerHTML = '';
      body.append(h('div.imp-book-progress', h('b', `📕 ${source}`), bar, label, h('button', { onclick: () => { stop = true; } }, 'Stop')));
      let lines;
      try {
        lines = await BookImport.readLines(f, (n, total) => { bar.max = total; bar.value = n; label.textContent = `Reading page ${n} of ${total}…`; }, () => stop || !document.body.contains(body));
      } catch (e) {
        body.innerHTML = ''; body.append(h('p', 'That PDF couldn\'t be read. ', h('span.dim', e.message || String(e)))); return;
      }
      if (!document.body.contains(body)) return;
      label.textContent = 'Finding monsters, spells and items…';
      await new Promise(r => setTimeout(r, 30));
      const hb = Homebrew.list(), have = new Set([...hb.monsters, ...hb.spells, ...hb.items].map(x => x.name.toLowerCase()));
      const dict = { monster: SRDREF.monsters.map(m => m.name), spell: SRDREF.spells.map(m => m.name), item: [...new Set([...SRDREF.items.map(m => m.name), ...CHARDATA.magicItems.map(m => m.name)])] };
      const entries = BookImport.findEntries(lines, dict).map((e, i) => {
        const obj = e.kind === 'monster' ? parseMonster(e.text) : e.kind === 'spell' ? parseSpell(e.text) : parseItem(e.text);
        obj.name = e.name;
        const warn = [...e.warn.map(w => w === 'name' ? 'name may be misread' : w), ...(e.kind === 'monster' ? BookImport.checkMonster(obj, e.text) : [])];
        const dup = have.has(e.name.toLowerCase());
        return { ...e, i, obj, warn, dup, pick: !dup };
      });
      showBook(source, entries, stop);
    }
    function showBook(source, entries, stopped) {
      body.innerHTML = '';
      if (!entries.length) { body.append(h('p', 'No monsters, spells or magic items found in this PDF.'), h('p.dim', 'A PDF that is only pictures of pages (no text) can\'t be read. Try pasting entries in the 📋 Paste text tab instead.')); return; }
      const KINDS = { monster: '🐉 Monster', spell: '✨ Spell', item: '💎 Item' };
      const count = (k) => entries.filter(e => e.kind === k).length;
      const kindSel = h('select', h('option', { value: '' }, `Everything (${entries.length})`), ['monster', 'spell', 'item'].filter(count).map(k => h('option', { value: k }, `${KINDS[k]}s (${count(k)})`)));
      const q = h('input', { placeholder: 'Filter by name…' }), cleanOnly = h('input', { type: 'checkbox' });
      const list = h('div.imp-results'), out = h('div.imp-preview'), go = h('button.primary');
      let current = null;
      const shown = () => entries.filter(e => (!kindSel.value || e.kind === kindSel.value) && (!cleanOnly.checked || !e.warn.length) && (!q.value.trim() || e.name.toLowerCase().includes(q.value.trim().toLowerCase())));
      const sync = () => { const n = entries.filter(e => e.pick).length; go.textContent = `📥 Save ${n} to this campaign`; go.disabled = !n; };
      const row = (e) => h('div.ref-item.imp-book-row' + (current === e ? '.active' : ''), { onclick: (ev) => { if (ev.target.type === 'checkbox') return; current = e; draw(); show(e); } },
        h('input', { type: 'checkbox', checked: e.pick, onchange: (ev) => { e.pick = ev.target.checked; sync(); } }),
        h('div.grow', h('div', e.name, e.warn.length ? h('span.imp-warn', { title: e.warn.join(', ') }, ' ⚠') : null),
          h('div.dim.small', [KINDS[e.kind], e.kind === 'monster' ? `CR ${e.obj.cr}` : e.kind === 'item' ? e.obj.rarity : e.obj.level ? `Level ${e.obj.level}` : 'Cantrip', `p. ${e.page}`, e.dup ? 'already in this campaign' : ''].filter(Boolean).join(' · '))));
      function draw() {
        const s = shown();
        list.innerHTML = '';
        list.append(h('div.row.imp-book-bulk', h('span.dim.small.grow', `${s.length} shown`), h('button.small', { onclick: () => { s.forEach(e => (e.pick = true)); draw(); sync(); } }, 'Tick all'), h('button.small', { onclick: () => { s.forEach(e => (e.pick = false)); draw(); sync(); } }, 'Untick all')));
        s.forEach(e => list.append(row(e)));
      }
      function show(e) {
        out.innerHTML = '';
        const name = h('input', { value: e.name, oninput: () => { e.name = e.obj.name = name.value; } , onchange: () => draw() });
        out.append(h('div.row', h('label.field.grow', h('span', `Name · page ${e.page} of ${source}`), name)),
          e.warn.length ? h('div.callout.callout-warning', h('div.callout-title', '⚠ Check this one'), h('p', `Looks wrong: ${e.warn.join(', ')}. Compare it with page ${e.page}, and use “Edit first” to fix it.`)) : null,
          saveButtons(e.kind, e.obj, source, () => { e.pick = false; e.dup = true; draw(); sync(); }),
          preview(e.kind, e.obj),
          h('details.imp-book-raw', h('summary.dim.small', 'The text as it came out of the PDF'), h('pre', e.text)));
      }
      go.addEventListener('click', async () => {
        const chosen = entries.filter(e => e.pick);
        go.disabled = true;
        for (let i = 0; i < chosen.length; i++) {
          go.textContent = `Saving ${i + 1} of ${chosen.length}…`;
          await Homebrew.save(chosen[i].kind, { ...chosen[i].obj, source }, { open: false, source });
          chosen[i].pick = false; chosen[i].dup = true;
        }
        await Notes.refresh();
        toast(`Saved ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'} from ${source} into Homebrew`);
        draw(); sync();
      });
      [kindSel, cleanOnly].forEach(x => x.addEventListener('change', draw));
      q.addEventListener('input', U.debounce(draw, 150));
      const warned = entries.filter(e => e.warn.length).length;
      body.append(h('div.row', h('b', `📕 ${source}`), h('span.dim', `${['monster', 'spell', 'item'].filter(count).map(k => `${count(k)} ${k === 'monster' ? 'monsters' : k === 'spell' ? 'spells' : 'magic items'}`).join(', ')} found${stopped ? ' (stopped early)' : ''}${warned ? ` · ${warned} with ⚠` : ''}`)),
        h('div.row', kindSel, q, h('label.chk', cleanOnly, ' Hide ones with ⚠'), h('span.grow'), go),
        h('div.imp-o5', list, out));
      out.append(h('p.dim', 'Click an entry to check it before saving. Everything ticked is saved with the button above.'));
      draw(); sync();
    }

    function fileTab() {
      const file = h('input', { type: 'file', accept: '.json,application/json' });
      const out = h('div');
      file.addEventListener('change', async () => {
        out.innerHTML = '';
        const f = file.files[0]; if (!f) return;
        let data;
        try { data = JSON.parse(await f.text()); } catch { out.append(h('p', 'That file isn\'t valid JSON.')); return; }
        const arr = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : Array.isArray(data.monster) ? data.monster : [data];
        const items = arr.map(o => ({ o, k: kindOfJson(o) })).filter(x => x.k);
        if (!items.length) { out.append(h('p', 'No monsters, spells or items found. Supported: Open5e and 5e-database style JSON.')); return; }
        const picks = items.map(x => ({ ...x, box: h('input', { type: 'checkbox', checked: true }) }));
        out.append(h('p', `Found ${items.length}: ${['monster', 'spell', 'item'].map(k => `${items.filter(x => x.k === k).length} ${k}s`).join(', ')}.`),
          h('div.imp-filelist', picks.map(p => h('label.chk', p.box, ` ${p.o.name} `, h('span.dim.small', p.k)))),
          h('div.row', h('button.primary', { onclick: async (e) => {
            e.target.disabled = true;
            const chosen = picks.filter(p => p.box.checked);
            for (const p of chosen) await Homebrew.save(p.k, convert[p.k](p.o), { open: false, source: `Imported (${f.name})` });
            await Notes.refresh();
            toast(`Imported ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'} into Homebrew`);
            m.close();
          } }, '📥 Import selected')));
      });
      body.append(h('p', 'Import a JSON file of monsters, spells or items (Open5e or 5e-database format). Each one becomes a homebrew note in this campaign.'), file, out);
    }
  }

  return { open, parseMonster, parseSpell, parseItem, detect, fromJsonMonster, fromJsonSpell, fromJsonItem };
})();
