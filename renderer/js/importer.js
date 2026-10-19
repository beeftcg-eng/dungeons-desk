// Import monsters, spells, magic items, feats, backgrounds and subclasses into the campaign (as homebrew notes):
//  • Paste text: copy a stat block / spell / item / feat / background / subclass from D&D Beyond, a PDF or a web page and paste it.
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
    const top = t.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4).join('\n');
    if (/(^|\n)\s*(ability scores|skill proficiencies)\s*:/i.test(t) && /(^|\n)\s*(feat|equipment|tool proficienc\w*)\s*:/i.test(t)) return 'background';
    if (SUBCLASS_RE.test(top)) return 'subclass';
    if (FEAT_RE.test(top)) return 'feat';
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

  // ----- Feats, backgrounds and subclasses (2024 layout) -----
  const FEAT_RE = /(^|\n)\s*(origin|general|fighting style|epic boon)\s+feat\b/i;
  const CLASS_NAMES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
  const SUBCLASS_RE = new RegExp(`(^|\\n)\\s*(${CLASS_NAMES.join('|')})\\s+subclass\\b`, 'i');
  const FEATURE_RE = /^level\s*(\d{1,2})\s*[:.;]\s*(.+)$/i;
  const paras = (lines) => lines.join('\n\n').replace(/^([A-Z][\w'’-]*(?: (?:[A-Z][\w'’-]*|of|the|and|or|a|to|in|with|for)){0,5})\. /gm, '**$1.** ');
  function parseFeat(text) {
    const lines = norm(text).split('\n').map(l => l.trim()).filter(Boolean);
    const ft = { name: (lines[0] || 'Imported Feat').replace(/\s*\((?:legacy|2014|2024)\)\s*$/i, ''), type: 'general', prereq: '' };
    let start = 1;
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      const m = /^(origin|general|fighting style|epic boon)\s+feat\b\s*(?:\((?:prerequisites?:?\s*)?([^)]*)\))?/i.exec(lines[i]);
      if (m) { ft.type = m[1].toLowerCase().replace(' ', '-'); ft.prereq = (m[2] || '').trim(); start = i + 1; break; }
      const p = /^prerequisites?:\s*(.+)$/i.exec(lines[i]);
      if (p) { ft.prereq = p[1].trim(); start = i + 1; }
    }
    ft.desc = paras(lines.slice(start));
    return ft;
  }
  const ABIL_OF = (s) => String(s || '').split(/,|\band\b|\bor\b/).map(x => x.trim().toLowerCase().slice(0, 3)).filter(a => ABIL.includes(a));
  const listOf = (s) => String(s || '').replace(/\.$/, '').split(/,\s*|\s+and\s+/).map(x => x.trim()).filter(Boolean);
  function parseBackground(text) {
    const lines = norm(text).split('\n').map(l => l.trim()).filter(Boolean);
    const bg = { name: (lines[0] || 'Imported Background').replace(/\s*\((?:legacy|2014|2024)\)\s*$/i, ''), abilities: [], feat: '', skills: [], tools: [], equipment: '' }, rest = [];
    lines.slice(1).forEach(l => {
      const m = /^(ability scores?|feat|skill proficienc\w*|tool proficienc\w*|equipment)\s*:\s*(.*)$/i.exec(l);
      if (!m) return rest.push(l);
      const k = m[1].toLowerCase(), v = m[2].trim();
      if (k.startsWith('ability')) bg.abilities = ABIL_OF(v);
      else if (k === 'feat') bg.feat = v.replace(/\s*\(see [^)]*\)/i, '').trim();
      else if (k.startsWith('skill')) bg.skills = listOf(v);
      else if (k.startsWith('tool')) bg.tools = /^choose/i.test(v) ? [v] : listOf(v);
      else bg.equipment = v;
    });
    bg.desc = paras(rest);
    return bg;
  }
  function parseSubclass(text) {
    const lines = norm(text).split('\n').map(l => l.trim()).filter(Boolean);
    const sc = { name: (lines[0] || 'Imported Subclass').replace(/\s*\((?:legacy|2014|2024)\)\s*$/i, ''), cls: '', summary: '', features: [] };
    let i = 1;
    const m = new RegExp(`^(${CLASS_NAMES.join('|')})\\s+subclass\\b[:\\s]*(.*)$`, 'i').exec(lines[1] || '');
    if (m) { sc.cls = title(m[1]); sc.summary = m[2].trim(); i = 2; }
    // A short line under "Barbarian Subclass" with no full stop is the subclass's tagline.
    if (!sc.summary && lines[i] && lines[i].length < 80 && !/[.:]$/.test(lines[i]) && !FEATURE_RE.test(lines[i])) sc.summary = lines[i++];
    const intro = [];
    let cur = null;
    lines.slice(i).forEach(l => {
      const f = FEATURE_RE.exec(l);
      if (f) { cur = { level: Number(f[1]), name: f[2].trim().replace(/\.$/, ''), lines: [] }; sc.features.push(cur); }
      else (cur ? cur.lines : intro).push(l);
    });
    if (!sc.cls) sc.cls = CLASS_NAMES.find(c => new RegExp(`\\b${c}s?\\b`, 'i').test(intro.join(' '))) || 'Fighter';
    sc.desc = paras(intro);
    sc.features = sc.features.map(f => ({ level: f.level, name: f.name, desc: paras(f.lines) }));
    return sc;
  }
  const PARSE = { monster: parseMonster, spell: parseSpell, item: parseItem, feat: parseFeat, background: parseBackground, subclass: parseSubclass };

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
    const md = (t) => h('div.md', { html: MD.simple(t || '') });
    if (kind === 'feat') return h('div.spell-card', h('h1', obj.name), h('div.spell-sub', `${Homebrew.FEAT_TYPES[obj.type] || 'General'} Feat${obj.prereq ? ` (Prerequisite: ${obj.prereq})` : ''}`), md(obj.desc));
    if (kind === 'background') {
      const AB = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
      return h('div.spell-card', h('h1', obj.name), h('div.spell-sub', 'Background'),
        h('div.spell-props', [['Ability Scores', obj.abilities.map(a => AB[a]).join(', ')], ['Feat', obj.feat], ['Skill Proficiencies', obj.skills.join(', ')], ['Tool Proficiency', obj.tools.join(', ')], ['Equipment', obj.equipment]].map(([k, v]) => h('div', h('b', k + ': '), v || '—'))),
        md(obj.desc));
    }
    if (kind === 'subclass') return h('div.spell-card', h('h1', obj.name), h('div.spell-sub', `${obj.cls} Subclass${obj.summary ? `: ${obj.summary}` : ''}`), md(obj.desc),
      obj.features.map(f => [h('h3', `Level ${f.level}: ${f.name}`), md(f.desc)]), obj.features.length ? null : h('p.dim', 'No “Level 3: Feature” lines found. Use “Edit first” to add the features.'));
    return h('div.spell-card', h('h1', obj.name), h('div.spell-sub', `${obj.type}, ${obj.rarity}${obj.attune ? ' (requires attunement)' : ''}`), md(obj.desc));
  }
  function saveButtons(kind, obj, source, after) {
    const done = (p) => { toast(`${obj.name} added to your campaign`); after && after(p); };
    const edit = () => {
      if (kind === 'monster') Statblock.openBuilder(obj, (sb) => Homebrew.save('monster', sb, { source }).then(done));
      else if (kind === 'spell') Homebrew.spellForm({ ...obj, source }, (x) => Homebrew.save('spell', x).then(done));
      else if (kind === 'feat') Homebrew.featForm({ ...obj, source }, (x) => Homebrew.save('feat', x).then(done));
      else if (kind === 'background') Homebrew.backgroundForm({ ...obj, equipText: obj.equipment, source }, (x) => Homebrew.save('background', x).then(done));
      else if (kind === 'subclass') Homebrew.subclassForm({ ...obj, source }, (x) => Homebrew.save('subclass', x).then(done));
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
      const ta = h('textarea.imp-text', { rows: 16, spellcheck: 'false', placeholder: 'Paste a monster stat block, a spell, a magic item, a feat, a background or a subclass here.\n\nFrom D&D Beyond: open the page, select everything from the name down to the end of the block, copy (Ctrl+C) and paste here (Ctrl+V).\nWorks with PDFs and most websites too.' });
      const kindSel = h('select', h('option', { value: '' }, 'Detect automatically'), h('option', { value: 'monster' }, 'Monster'), h('option', { value: 'spell' }, 'Spell'), h('option', { value: 'item' }, 'Magic item'), h('option', { value: 'feat' }, 'Feat'), h('option', { value: 'background' }, 'Background'), h('option', { value: 'subclass' }, 'Subclass'));
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
        if (!kind) { out.append(h('p', 'Couldn\'t tell what this is. Choose what it is in the list above.')); return; }
        const obj = PARSE[kind](text);
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

    // A book PDF the DM owns: every monster, spell, magic item, feat, background and subclass found in it, to tick and save into this campaign.
    function bookTab() {
      const file = h('input', { type: 'file', accept: '.pdf,application/pdf', style: 'display:none' });
      body.append(file, h('div.imp-book-intro',
        h('p', 'Pick a PDF of a book you own, like a Monster Manual, a Dungeon Master\'s Guide or a Player\'s Handbook. The app finds the monsters, spells, magic items, feats, backgrounds and subclasses in it, and you choose which ones to save as homebrew in this campaign.'),
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
      label.textContent = 'Finding monsters, spells, items and character options…';
      await new Promise(r => setTimeout(r, 30));
      const hb = Homebrew.list(), have = new Set([...hb.monsters, ...hb.spells, ...hb.items, ...hb.feats, ...hb.backgrounds, ...hb.subclasses].map(x => x.name.toLowerCase()));
      const dict = { monster: SRDREF.monsters.map(m => m.name), spell: SRDREF.spells.map(m => m.name), item: [...new Set([...SRDREF.items.map(m => m.name), ...CHARDATA.magicItems.map(m => m.name)])],
        feat: CHARDATA.feats.map(f => f.name), background: CHARDATA.backgrounds.map(b => b.name), subclass: CHARDATA.classes.flatMap(c => c.subclasses.map(x => x.name)) };
      const entries = BookImport.findEntries(lines, dict).map((e, i) => {
        const obj = PARSE[e.kind](e.text);
        obj.name = e.name;
        const warn = [...e.warn.map(w => w === 'name' ? 'name may be misread' : w), ...(e.kind === 'monster' ? BookImport.checkMonster(obj, e.text) : [])];
        const dup = have.has(e.name.toLowerCase());
        return { ...e, i, obj, warn, dup, pick: !dup };
      });
      showBook(source, entries, stop, dict, have);
    }
    function showBook(source, entries, stopped, dict, have) {
      body.innerHTML = '';
      if (!entries.length) { body.append(h('p', 'No monsters, spells, magic items, feats, backgrounds or subclasses found in this PDF.'), h('p.dim', 'A PDF that is only pictures of pages (no text) can\'t be read. Try pasting entries in the 📋 Paste text tab instead.')); return; }
      const KINDS = { monster: '🐉 Monster', spell: '✨ Spell', item: '💎 Item', feat: '🎖 Feat', background: '📜 Background', subclass: '🧬 Subclass' };
      const PLURAL = { monster: 'monsters', spell: 'spells', item: 'magic items', feat: 'feats', background: 'backgrounds', subclass: 'subclasses' };
      const count = (k) => entries.filter(e => e.kind === k).length;
      const kindSel = h('select', h('option', { value: '' }, `Everything (${entries.length})`), Object.keys(KINDS).filter(count).map(k => h('option', { value: k }, `${KINDS[k]}s (${count(k)})`)));
      const about = (e) => e.kind === 'monster' ? `CR ${e.obj.cr}` : e.kind === 'item' ? e.obj.rarity : e.kind === 'spell' ? (e.obj.level ? `Level ${e.obj.level}` : 'Cantrip')
        : e.kind === 'feat' ? `${Homebrew.FEAT_TYPES[e.obj.type] || 'General'}` : e.kind === 'subclass' ? `${e.obj.cls}, ${e.obj.features.length} features` : '';
      const q = h('input', { placeholder: 'Filter by name…' }), cleanOnly = h('input', { type: 'checkbox' });
      const list = h('div.imp-results'), out = h('div.imp-preview'), go = h('button.primary'), nextBtn = h('button', { title: 'Show the next entry with a ⚠ (Enter in a name does the same)' });
      const rows = new Map();
      let current = null;
      const shown = () => entries.filter(e => (!kindSel.value || e.kind === kindSel.value) && (!cleanOnly.checked || !e.warn.length) && (!q.value.trim() || e.name.toLowerCase().includes(q.value.trim().toLowerCase())));
      const sync = () => {
        const n = entries.filter(e => e.pick).length, w = entries.filter(e => e.warn.length).length, names = entries.filter(misread).length;
        go.textContent = `📥 Save ${n} to this campaign`; go.disabled = !n;
        nextBtn.textContent = !w ? '✓ Nothing to check' : names ? `⚠ Next name to fix (${names})` : `⚠ Next to check (${w})`; nextBtn.disabled = !w;
      };
      // A new name: the "name may be misread" warning goes, and whether it's already in the campaign is checked again.
      function rename(e, v, from, keep) {
        v = v.replace(/\s+/g, ' ').trim();
        if (!v || (v === e.name && !keep)) return;
        e.name = e.obj.name = v;
        e.warn = e.warn.filter(w => w !== 'name may be misread');
        e.dup = have.has(v.toLowerCase());
        const r = rows.get(e);
        if (r) { r.querySelector('.imp-warn').hidden = !e.warn.length; r.querySelector('.imp-warn').title = e.warn.join(', '); r.querySelector('.imp-row-sub').textContent = sub(e); if (from !== r) r.querySelector('.imp-name').value = v; }
        if (current === e && from !== out) show(e);
        sync();
      }
      const misread = (e) => e.warn.includes('name may be misread');
      const sub = (e) => [KINDS[e.kind], about(e), `p. ${e.page}`, e.dup ? 'already in this campaign' : ''].filter(Boolean).join(' · ');
      function select(e, focusName) {
        current = e;
        rows.forEach((r, x) => r.classList.toggle('active', x === e));
        show(e);
        const r = rows.get(e);
        if (r) { r.scrollIntoView({ block: 'nearest' }); if (focusName) { const n = r.querySelector('.imp-name'); n.focus(); n.select(); } }
      }
      // The next entry (in the list as filtered) that still has a ⚠, after the one that's open: misread names first,
      // since they're quick to fix, then anything else.
      function nextWarn(focusName = true) {
        const s = shown(), at = current ? s.indexOf(current) : -1, order = [...s.slice(at + 1), ...s.slice(0, at + 1)].filter(x => x !== current);
        const e = order.find(misread) || order.find(x => x.warn.length);
        if (e) select(e, focusName); else toast('Nothing left to check in this list');
      }
      nextBtn.addEventListener('click', () => nextWarn());
      const row = (e) => {
        const name = h('input.imp-name', { value: e.name, spellcheck: 'false', title: 'Type to fix the name. Enter goes to the next ⚠.',
          onfocus: () => { if (current !== e) select(e); },
          onchange: () => rename(e, name.value, r),
          onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); rename(e, name.value, r); nextWarn(); } if (ev.key === 'Escape') { name.value = e.name; name.blur(); } } });
        const r = h('div.ref-item.imp-book-row' + (current === e ? '.active' : ''), { onclick: (ev) => { if (ev.target.tagName === 'INPUT') return; select(e); } },
          h('input', { type: 'checkbox', checked: e.pick, onchange: (ev) => { e.pick = ev.target.checked; sync(); } }),
          h('div.grow', h('div.row.imp-row-name', name, h('span.imp-warn', { title: e.warn.join(', '), hidden: !e.warn.length }, '⚠')),
            h('div.dim.small.imp-row-sub', sub(e))));
        rows.set(e, r);
        return r;
      };
      function draw() {
        const s = shown();
        list.innerHTML = '';
        rows.clear();
        list.append(h('div.row.imp-book-bulk', h('span.dim.small.grow', `${s.length} shown`), h('button.small', { onclick: () => { s.forEach(e => (e.pick = true)); draw(); sync(); } }, 'Tick all'), h('button.small', { onclick: () => { s.forEach(e => (e.pick = false)); draw(); sync(); } }, 'Untick all')));
        s.forEach(e => list.append(row(e)));
      }
      function show(e) {
        out.innerHTML = '';
        const name = h('input.imp-name-big', { value: e.name, onchange: () => rename(e, name.value, out), onkeydown: (ev) => { if (ev.key === 'Enter') { rename(e, name.value, out); nextWarn(); } } });
        const ideas = misread(e) && dict[e.kind] ? BookImport.suggest(e.name, dict[e.kind]) : [];
        out.append(h('div.row', h('label.field.grow', h('span', `Name · page ${e.page} of ${source}`), name)),
          ideas.length ? h('div.row.imp-ideas', h('span.dim.small', 'Did you mean'), ideas.map(n => h('button.small', { onclick: () => { rename(e, n); } }, n)),
            h('button.small', { onclick: () => rename(e, e.name, null, true), title: 'Keep the name as it is' }, '✓ It\'s right')) : null,
          e.warn.length ? h('div.callout.callout-warning', h('div.callout-title', '⚠ Check this one'), h('p', `Looks wrong: ${e.warn.join(', ')}. Compare it with page ${e.page}, and use “Edit first” to fix it.`)) : null,
          saveButtons(e.kind, e.obj, source, () => { e.pick = false; e.dup = true; have.add(e.name.toLowerCase()); const r = rows.get(e); if (r) { r.querySelector('input[type=checkbox]').checked = false; r.querySelector('.imp-row-sub').textContent = sub(e); } sync(); }),
          preview(e.kind, e.obj),
          h('details.imp-book-raw', h('summary.dim.small', 'The text as it came out of the PDF'), h('pre', e.text)));
      }
      go.addEventListener('click', async () => {
        const chosen = entries.filter(e => e.pick);
        go.disabled = true;
        for (let i = 0; i < chosen.length; i++) {
          go.textContent = `Saving ${i + 1} of ${chosen.length}…`;
          await Homebrew.save(chosen[i].kind, { ...chosen[i].obj, source }, { open: false, source });
          chosen[i].pick = false; chosen[i].dup = true; have.add(chosen[i].name.toLowerCase());
        }
        await Notes.refresh();
        toast(`Saved ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'} from ${source} into Homebrew`);
        draw(); sync();
      });
      [kindSel, cleanOnly].forEach(x => x.addEventListener('change', draw));
      q.addEventListener('input', U.debounce(draw, 150));
      const warned = entries.filter(e => e.warn.length).length;
      body.append(h('div.row', h('b', `📕 ${source}`), h('span.dim', `${Object.keys(KINDS).filter(count).map(k => `${count(k)} ${PLURAL[k]}`).join(', ')} found${stopped ? ' (stopped early)' : ''}${warned ? ` · ${warned} with ⚠` : ''}`)),
        h('div.row', kindSel, q, h('label.chk', cleanOnly, ' Hide ones with ⚠'), nextBtn, h('span.grow'), go),
        h('div.imp-o5', list, out));
      out.append(h('p.dim', 'Click an entry to check it before saving. Everything ticked is saved with the button above.'),
        warned ? h('p.dim', `To fix names quickly: press “⚠ Next name to fix”, pick a suggestion or type the right name in the list, and press Enter to go on to the next one.`) : null);
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

  return { open, parseMonster, parseSpell, parseItem, parseFeat, parseBackground, parseSubclass, detect, fromJsonMonster, fromJsonSpell, fromJsonItem };
})();
