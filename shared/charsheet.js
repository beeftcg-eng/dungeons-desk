// Character sheet, shared by the phone page (each player's own sheet) and the DM app (any party member's sheet).
// A sheet edits a party member's model: {name, cls, level, ac, hp, initBonus, sheet}. cls/level/ac/hp/initBonus are the
// same fields as the Settings party table; everything else lives in model.sheet (see clean() for its shape).
// Class, level, species and background fill in what the SRD knows (CHARDATA, from shared/charsheet-data.js), and any
// number can be typed by hand instead. Rolls and "Show the DM" cards go out through opts.onShare; the DM app rolls the
// dice (resolve()), so results are fair, and sends each player back only their own results.
window.CharSheet = (() => {
  const EMPTY = { skills: {}, classes: [], species: [], backgrounds: [], feats: [], equipment: [], spells: [], magicItems: [] };
  let merged = null, hbKey = '';
  const DATA = () => merged || window.CHARDATA || EMPTY;
  // Campaign homebrew (spells and magic items) joins the SRD lists; a homebrew entry wins over an SRD one with the same name.
  function setHomebrew(hb) {
    const key = JSON.stringify(hb || {});
    if (key === hbKey) return false;
    hbKey = key;
    const base = window.CHARDATA || EMPTY;
    merged = { ...base, spells: [...((hb && hb.spells) || []), ...base.spells], magicItems: [...((hb && hb.items) || []), ...base.magicItems] };
    return true;
  }
  const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const AB_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  const BIO = [['personality', 'Personality'], ['ideals', 'Ideals'], ['bonds', 'Bonds'], ['flaws', 'Flaws'], ['appearance', 'Appearance'], ['backstory', 'Backstory']];
  const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];
  const ALIGN = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];
  // Class resources that the level tables count, and when they come back: 'short' = all on a Short Rest, 'short1' = one on a Short Rest.
  const RES = { rage_count: ['Rage', 'short1'], focus_points: ['Focus Points', 'short'], sorcery_points: ['Sorcery Points', 'long'],
    channel_divinity_charges: ['Channel Divinity', 'short1'], wild_shape_uses: ['Wild Shape', 'short1'], second_wind_uses: ['Second Wind', 'short1'] };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => (v === '' || v == null || !Number.isFinite(Number(v))) ? d : Number(v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (score) => Math.floor((num(score, 10) - 10) / 2);
  const sgn = (n) => (n >= 0 ? '+' : '') + n;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const ord = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
  const byName = (list, name) => { const n = String(name || '').trim().toLowerCase(); return n ? (list || []).find(x => x.name.toLowerCase() === n) || null : null; };
  const findGear = (n) => byName(DATA().equipment, n);
  const findMagic = (n) => byName(DATA().magicItems, n);
  const findSpell = (n) => byName(DATA().spells, n);
  const findFeat = (n) => byName(DATA().feats, String(n || '').replace(/\s*\(.*\)$/, ''));
  // Light markdown for SRD text: **bold**, *italic*, line breaks.
  const fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/\n\s*\n/g, '<br><br>').replace(/\n/g, '<br>');

  // ---------- Dice ----------
  // "1d20+5", "2d6 + 3", "8d6". At most 100 dice of up to 1000 sides, so a phone can't ask for something silly.
  function rollDice(expr, doRoll = true) {
    const src = String(expr || '').replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
    if (!src || !/^[0-9d+-]+$/.test(src)) return null;
    const terms = src.match(/[+-]?[^+-]+/g) || [];
    if (!terms.length || terms.length > 12) return null;
    let total = 0, d20 = null; const parts = [];
    for (const t of terms) {
      const neg = t[0] === '-', body = t.replace(/^[+-]/, ''), m = /^(\d*)d(\d+)$/.exec(body), joint = neg ? '− ' : parts.length ? '+ ' : '';
      if (m) {
        const n = Number(m[1] || 1), s = Number(m[2]);
        if (n < 1 || n > 100 || s < 1 || s > 1000) return null;
        if (!doRoll) continue;
        const rs = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * s)), sum = rs.reduce((a, b) => a + b, 0);
        total += neg ? -sum : sum; parts.push(joint + '[' + rs.join(', ') + ']');
        if (s === 20 && n === 1 && d20 == null) d20 = rs[0];
      } else if (/^\d+$/.test(body)) { total += neg ? -Number(body) : Number(body); parts.push(joint + body); }
      else return null;
    }
    return { total, detail: parts.join(' '), d20 };
  }
  const validExpr = (e) => !!rollDice(e, false);
  const critExpr = (e) => String(e).replace(/(\d*)d(\d+)/g, (_, n, s) => `${Number(n || 1) * 2}d${s}`);

  // Roll what a share asks for. Used by the DM app for every player roll, and by "Roll just for me" on phones.
  function resolve(s) {
    const e = { id: s.id || uid(), t: Date.now(), kind: s.kind, label: s.label || '', sub: s.sub || '' };
    if (s.tag) e.tag = s.tag;
    if (s.kind === 'card') return { ...e, title: s.title, body: s.body };
    if (s.kind === 'hp') return { ...e, amount: s.amount, heal: s.heal };
    e.expr = s.expr; e.mode = s.mode || 'normal';
    if (s.manual != null) { e.manual = true; e.total = s.manual; if (s.dmg) { e.dmgExpr = s.dmg; e.dmgType = s.dmgType || ''; } return e; }
    const once = () => rollDice(s.expr);
    let r = once();
    if (!r) return null;
    if (s.kind !== 'damage' && (e.mode === 'adv' || e.mode === 'dis')) {
      const b = once(), keep = e.mode === 'adv' ? (b.total > r.total ? b : r) : (b.total < r.total ? b : r), other = keep === r ? b : r;
      r = { ...keep, detail: `${keep.detail} (${e.mode === 'adv' ? 'advantage' : 'disadvantage'}, other roll ${other.total})` };
    }
    e.total = r.total; e.detail = r.detail;
    if (s.kind !== 'damage') { e.crit = r.d20 === 20; e.fumble = r.d20 === 1; }
    if (s.kind === 'damage') e.dmgType = s.dmgType || '';
    if (s.kind === 'attack' && s.dmg) {
      const d = rollDice(e.crit ? critExpr(s.dmg) : s.dmg);
      if (d) e.dmg = { expr: e.crit ? critExpr(s.dmg) : s.dmg, total: Math.max(0, d.total), detail: d.detail, type: s.dmgType || '' };
    }
    return e;
  }

  // ---------- Data shape ----------
  // Turns whatever arrived (from a phone, or old saved state) into a safe, complete model. Names and owners are not
  // part of it: the DM app keeps those.
  function clean(m) {
    m = m && typeof m === 'object' ? m : {};
    const s = m.sheet && typeof m.sheet === 'object' ? m.sheet : {};
    const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const str = (v, n = 80) => v == null ? '' : String(v).slice(0, n);
    const int = (v, lo, hi, d = null) => (v === '' || v == null || !Number.isFinite(Number(v))) ? d : clamp(Math.round(Number(v)), lo, hi);
    const dec = (v, lo, hi, d = null) => (v === '' || v == null || !Number.isFinite(Number(v))) ? d : clamp(Math.round(Number(v) * 100) / 100, lo, hi);
    const arr = (v, n, f) => Array.isArray(v) ? v.slice(0, n).filter(x => x && typeof x === 'object').map(f) : [];
    const expr = (v) => { const e = str(v, 40); return e && validExpr(e) ? e : ''; };
    const id = (v) => str(v, 20) || uid();
    const skills = obj(s.skills), auto = obj(s.auto), coins = obj(s.coins), bio = obj(s.bio);
    return {
      cls: str(m.cls, 40), level: int(m.level, 1, 20, 1), ac: int(m.ac, 0, 60), hp: int(m.hp, 0, 9999), initBonus: int(m.initBonus, -20, 30, 0),
      sheet: {
        species: str(s.species), subspecies: str(s.subspecies), background: str(s.background), subclass: str(s.subclass),
        alignment: str(s.alignment, 40), size: str(s.size, 20), xp: int(s.xp, 0, 9999999, 0),
        abilities: Object.fromEntries(AB.map(a => [a, int(obj(s.abilities)[a], 1, 30, 10)])),
        saves: s.saves && typeof s.saves === 'object' ? Object.fromEntries(AB.map(a => [a, !!s.saves[a]])) : null,
        skills: Object.fromEntries(Object.keys(DATA().skills).map(k => [k, int(skills[k], 0, 2, 0)]).filter(([, v]) => v)),
        auto: { ac: auto.ac !== false, hp: auto.hp !== false, init: auto.init !== false, speed: auto.speed !== false },
        speed: int(s.speed, 0, 300, 30), acMisc: int(s.acMisc, -10, 20, 0),
        curHp: int(s.curHp, -999, 9999), tempHp: int(s.tempHp, 0, 999, 0), hdUsed: int(s.hdUsed, 0, 20, 0), inspiration: !!s.inspiration,
        items: arr(s.items, 400, it => ({ id: id(it.id), name: str(it.name, 80) || 'Item', qty: int(it.qty, 0, 99999, 1), equipped: !!it.equipped, attuned: !!it.attuned,
          bonus: int(it.bonus, -5, 10, 0), weight: dec(it.weight, 0, 5000), notes: str(it.notes, 1000) })),
        coins: Object.fromEntries(COINS.map(k => [k, int(coins[k], 0, 99999999, 0)])),
        attacks: arr(s.attacks, 60, a => ({ id: id(a.id), name: str(a.name, 60) || 'Attack', hit: int(a.hit, -20, 40, 0), dmg: expr(a.dmg), dmgType: str(a.dmgType, 30), notes: str(a.notes, 300) })),
        spells: arr(s.spells, 400, x => ({ id: id(x.id), name: str(x.name, 80) || 'Spell', prepared: !!x.prepared, level: int(x.level, 0, 9, 0), desc: str(x.desc, 6000) })),
        slotsUsed: Array.from({ length: 9 }, (_, i) => int((Array.isArray(s.slotsUsed) ? s.slotsUsed : [])[i], 0, 9, 0)),
        pactUsed: int(s.pactUsed, 0, 9, 0), conc: str(s.conc, 80),
        multi: arr(s.multi, 3, x => ({ id: id(x.id), cls: str(x.cls, 40), level: int(x.level, 1, 19, 1), subclass: str(x.subclass) })),
        resUsed: Object.fromEntries(Object.entries(obj(s.resUsed)).slice(0, 40).map(([k, v]) => [str(k, 40), int(v, 0, 99, 0)])),
        feats: arr(s.feats, 150, f => ({ id: id(f.id), name: str(f.name, 80) || 'Feature', desc: str(f.desc, 6000), uses: int(f.uses, 0, 99, 0), used: int(f.used, 0, 99, 0) })),
        profs: str(s.profs, 1500), languages: str(s.languages, 500),
        bio: Object.fromEntries(BIO.map(([k]) => [k, str(bio[k], k === 'backstory' ? 10000 : 1500)])),
      },
    };
  }

  // A new sheet keeps whatever AC / max HP / initiative the DM already typed in Settings.
  function prepare(m) {
    const out = clean({ ...m, sheet: m.sheet || { auto: { ac: !num(m.ac, 0), hp: !num(m.hp, 0), init: !num(m.initBonus, 0), speed: true } } });
    return applyAuto(out);
  }

  // Copy the numbers that are calculated automatically into the fields the rest of the app reads (initiative, Settings).
  function applyAuto(m) {
    const d = derive(m), a = m.sheet.auto;
    if (a.ac) m.ac = d.autoAc;
    if (a.hp && d.autoHp != null) m.hp = d.autoHp;
    if (a.init) m.initBonus = d.autoInit;
    return m;
  }

  function cleanShare(s) {
    if (!s || typeof s !== 'object') return null;
    const str = (v, n) => String(v ?? '').slice(0, n);
    const kind = ['roll', 'attack', 'damage', 'card', 'hp'].includes(s.kind) ? s.kind : null;
    if (!kind) return null;
    const out = { id: str(s.id, 20) || uid(), kind, label: str(s.label, 80), sub: str(s.sub, 160) };
    // Tags let the DM app act on a share: fill in initiative, mark a death save, track concentration.
    if (['init', 'death', 'conc', 'conc-end'].includes(s.tag)) out.tag = s.tag;
    if (kind === 'hp') {
      const n = Math.round(Number(s.amount));
      if (!Number.isFinite(n) || n < 1 || n > 999) return null;
      out.amount = n; out.heal = !!s.heal; out.label = `${out.heal ? 'Healed' : 'Took'} ${n}${out.heal ? ' HP' : ' damage'}`;
      return out;
    }
    if (kind === 'card') { out.title = str(s.title, 120) || out.label; out.body = str(s.body, 6000); return out; }
    out.expr = str(s.expr, 60);
    if (!validExpr(out.expr)) return null;
    out.mode = ['adv', 'dis'].includes(s.mode) ? s.mode : 'normal';
    if (s.dmg && validExpr(str(s.dmg, 60))) { out.dmg = str(s.dmg, 60); out.dmgType = str(s.dmgType, 30); }
    if (s.manual !== '' && s.manual != null && Number.isFinite(Number(s.manual))) out.manual = clamp(Math.round(Number(s.manual)), -99, 999);
    return out;
  }

  // ---------- Everything the sheet works out from the model ----------
  const FULL_CASTER = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'], HALF_CASTER = ['Paladin', 'Ranger'];
  // model.level is the character's total level. sheet.multi holds any extra classes; the first class gets the rest.
  function classParts(m) {
    const total = clamp(num(m.level, 1), 1, 20);
    const extra = (m.sheet.multi || []).map(x => ({ c: byName(DATA().classes, x.cls), name: x.cls, lvl: clamp(num(x.level, 1), 1, 19), sub: x.subclass, id: x.id })).filter(x => x.name);
    let rest = total;
    extra.forEach(x => { x.lvl = Math.min(x.lvl, Math.max(1, rest - 1)); rest -= x.lvl; });
    const first = { c: byName(DATA().classes, m.cls), name: m.cls, lvl: Math.max(1, rest), sub: m.sheet.subclass, primary: true };
    return { total, parts: [first, ...extra].map(x => ({ ...x, L: x.c ? x.c.levels[x.lvl - 1] : null, subclass: x.c ? byName(x.c.subclasses, x.sub) : null })) };
  }

  function derive(m, live) {
    const s = m.sheet, { total: lvl, parts } = classParts(m), P = parts[0], c = P.c, L = P.L;
    const known = parts.filter(x => x.c), multi = parts.length > 1;
    const pb = Math.ceil(lvl / 4) + 1;
    const score = Object.fromEntries(AB.map(a => [a, num(s.abilities[a], 10)])), md = Object.fromEntries(AB.map(a => [a, mod(score[a])]));
    const saveProf = s.saves || Object.fromEntries(AB.map(a => [a, !!(c && c.saves.includes(a))]));
    const saves = Object.fromEntries(AB.map(a => [a, md[a] + (saveProf[a] ? pb : 0)]));
    const part = (name) => known.find(x => x.c.name === name);
    const jack = part('Bard') && part('Bard').lvl >= 2 ? Math.floor(pb / 2) : 0;
    const skills = Object.entries(DATA().skills).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, ab]) => { const p = s.skills[name] || 0; return { name, ab, prof: p, bonus: md[ab] + (p ? pb * p : jack) }; });
    const perception = skills.find(k => k.name === 'Perception');
    const sp = byName(DATA().species, s.species), sub = sp && byName(sp.subspecies, s.subspecies);
    const bg = byName(DATA().backgrounds, s.background), subclass = P.subclass;
    // Class-table extras (Rage, Focus Points, Sneak Attack…) from every class at its own level.
    const spec = Object.assign({}, ...known.map(x => (x.L && x.L.specific) || {}));

    const features = [];
    known.forEach(x => {
      x.c.levels.slice(0, x.lvl).forEach((l, i) => l.features.forEach(f => features.push({ src: x.c.name, level: i + 1, name: f.name, desc: f.desc })));
      if (x.subclass) x.subclass.features.filter(f => f.level <= x.lvl).forEach(f => features.push({ src: x.subclass.name, level: f.level, name: f.name, desc: f.desc }));
    });
    if (sp) sp.traits.forEach(t => features.push({ src: sp.name, name: t.name, desc: t.desc }));
    if (sub) sub.traits.filter(t => (t.level || 1) <= lvl).forEach(t => features.push({ src: sub.name, name: t.name, desc: t.desc }));
    if (bg && bg.feat) features.push({ src: `${bg.name} background`, name: bg.feat, desc: (findFeat(bg.feat) || {}).desc || '' });
    s.feats.forEach(f => features.push({ src: 'Added', custom: f.id, name: f.name, desc: f.desc || (findFeat(f.name) || {}).desc || '' }));
    const hasFeat = (n) => features.some(f => f.name.replace(/\s*\(.*\)$/, '').toLowerCase() === n.toLowerCase());

    const items = s.items.map(it => ({ ...it, g: findGear(it.name), mi: findMagic(it.name) }));
    const armor = items.find(i => i.equipped && i.g && i.g.kind === 'armor');
    const shield = items.find(i => i.equipped && i.g && i.g.kind === 'shield');
    let autoAc;
    if (armor) { const g = armor.g; autoAc = g.ac + (g.dex ? (g.maxDex != null ? Math.min(md.dex, g.maxDex) : md.dex) : 0) + armor.bonus + (hasFeat('Defense') ? 1 : 0); }
    else autoAc = Math.max(10 + md.dex, part('Barbarian') ? 10 + md.dex + md.con : 0, part('Monk') && !shield ? 10 + md.dex + md.wis : 0);
    if (shield) autoAc += (shield.g.ac || 2) + shield.bonus;
    autoAc += s.acMisc;
    const autoInit = md.dex + (hasFeat('Alert') ? pb : 0);
    // Max HP: the first class's hit die in full at level 1, then the average roll for every other level, from each class.
    let autoHp = null;
    if (c && known.length === parts.length) {
      autoHp = c.hitDie + md.con + (P.lvl - 1) * (c.hitDie / 2 + 1 + md.con) + parts.slice(1).reduce((t, x) => t + x.lvl * (x.c.hitDie / 2 + 1 + md.con), 0);
      if (sp && sp.name === 'Dwarf') autoHp += lvl;
      if (hasFeat('Tough')) autoHp += 2 * lvl;
      autoHp = Math.max(lvl, autoHp);
    }
    const autoSpeed = (sp ? sp.speed : 30) + (!armor && !shield && spec.unarmored_movement_bonus ? spec.unarmored_movement_bonus : 0);
    const A = s.auto;
    const ac = A.ac ? autoAc : num(m.ac, autoAc);
    const maxHp = A.hp && autoHp != null ? autoHp : (m.hp != null && m.hp !== '' ? num(m.hp) : null);
    const init = A.init ? autoInit : num(m.initBonus, autoInit);
    const speed = A.speed ? autoSpeed : s.speed;
    const inCombat = !!(live && live.inCombat);
    const hp = inCombat && live.hp != null ? live.hp : (s.curHp != null ? s.curHp : maxHp);

    // Attacks: equipped weapons, an unarmed strike, and any the player added by hand.
    // Proficiencies: all of the first class's, plus what each extra class grants when multiclassing into it.
    const profs = [...(c ? c.profs : []), ...parts.slice(1).flatMap(x => x.c ? x.c.multiProfs || [] : [])].map(p => p.toLowerCase());
    const weaponProf = (g) => !c || profs.includes(g.martial ? 'martial weapons' : 'simple weapons') || profs.includes(g.name.toLowerCase() + 's') || profs.includes(g.name.toLowerCase());
    const dieSize = (d) => Number((/d(\d+)/.exec(d || '') || [])[1] || 0);
    const monk = part('Monk');
    const attacks = [];
    items.filter(i => i.equipped && i.g && i.g.kind === 'weapon').forEach(i => {
      const g = i.g, props = g.props || [];
      const monkOk = monk && ((!g.martial && !g.ranged) || props.includes('Light'));
      const ab = g.ranged ? 'dex' : (props.includes('Finesse') || monkOk) ? (md.dex > md.str ? 'dex' : 'str') : 'str';
      let die = g.dmg || '1';
      if (monkOk && spec.martial_arts_die && spec.martial_arts_die > dieSize(die)) die = '1d' + spec.martial_arts_die;
      const bonus = md[ab] + i.bonus, reach = g.ranged ? `Range ${g.range} ft.` : `Reach ${g.range || 5} ft.` + (g.thrown ? `, thrown ${g.thrown} ft.` : '');
      attacks.push({ key: 'w:' + i.id, name: i.name + (i.bonus ? ` (${sgn(i.bonus)})` : ''), hit: md[ab] + (weaponProf(g) ? pb : 0) + i.bonus,
        dmg: die + (bonus ? sgn(bonus) : ''), dmgType: g.dmgType || '', versatile: g.versatile ? g.versatile + (bonus ? sgn(bonus) : '') : null,
        notes: [reach, ...props.filter(p => p !== 'Thrown' || !g.thrown)].join(' · '), mastery: spec.weapon_mastery && g.mastery ? g.mastery : null, item: i.id });
    });
    const ua = monk && spec.martial_arts_die ? { ab: md.dex > md.str ? 'dex' : 'str', die: '1d' + spec.martial_arts_die } : { ab: 'str', die: null };
    attacks.push({ key: 'unarmed', name: 'Unarmed Strike', hit: md[ua.ab] + pb, dmg: ua.die ? ua.die + (md[ua.ab] ? sgn(md[ua.ab]) : '') : String(Math.max(1, 1 + md.str)), dmgType: 'Bludgeoning', notes: 'Reach 5 ft.' });
    s.attacks.forEach(a => attacks.push({ key: 'c:' + a.id, custom: a.id, name: a.name, hit: a.hit, dmg: a.dmg, dmgType: a.dmgType, notes: a.notes }));

    // Spellcasting. Each casting class has its own ability; characters without one (Magic Initiate, say) use their best mental ability.
    const best = ['int', 'wis', 'cha'].sort((a, b) => md[b] - md[a])[0];
    const castings = known.filter(x => x.c.spellAbility).map(x => ({ cls: x.c.name, ab: x.c.spellAbility, mod: md[x.c.spellAbility], dc: 8 + pb + md[x.c.spellAbility], atk: pb + md[x.c.spellAbility] }));
    const castAb = castings.length ? castings[0].ab : (s.spells.length ? best : null);
    const casting = castAb ? { ab: castAb, mod: md[castAb], dc: 8 + pb + md[castAb], atk: pb + md[castAb] } : null;
    // Spell slots: one casting class uses its own table. Two or more (not counting Warlock) share the multiclass table:
    // full casters count every level, Paladins and Rangers half (rounded up). Warlock Pact Magic slots stay separate.
    const casters = known.filter(x => x.c.spellAbility && x.c.name !== 'Warlock' && x.L && x.L.slots && x.L.slots.length);
    const lock = part('Warlock');
    let slotTable = [];
    if (casters.length === 1) slotTable = casters[0].L.slots;
    else if (casters.length > 1) {
      const cl = casters.reduce((t, x) => t + (FULL_CASTER.includes(x.c.name) ? x.lvl : HALF_CASTER.includes(x.c.name) ? Math.ceil(x.lvl / 2) : 0), 0);
      const wiz = byName(DATA().classes, 'Wizard');
      slotTable = wiz && cl ? wiz.levels[clamp(cl, 1, 20) - 1].slots : [];
    } else if (lock && lock.L) slotTable = lock.L.slots || [];
    const slots = (slotTable || []).map((max, i) => ({ level: i + 1, max, used: Math.min(s.slotsUsed[i] || 0, max) })).filter(x => x.max);
    let pact = null;
    if (lock && lock.L && casters.length) {
      const ls = lock.L.slots || [], lv = ls.length;
      if (lv) pact = { level: lv, max: ls[lv - 1], used: Math.min(s.pactUsed || 0, ls[lv - 1]) };
    }
    const shortSlots = !casters.length && !!lock;
    const counts = known.reduce((t, x) => ({ cantrips: t.cantrips + ((x.L && x.L.cantrips) || 0), prepared: t.prepared + ((x.L && x.L.prepared) || 0) }), { cantrips: 0, prepared: 0 });
    const spells = s.spells.map(x => { const d = findSpell(x.name); return { ...x, d, level: d ? d.level : x.level }; }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

    const resources = Object.entries(RES).filter(([k]) => spec[k]).map(([k, [label, rest]]) => ({ key: k, label, max: spec[k], used: Math.min(s.resUsed[k] || 0, spec[k]), rest }));
    if (spec.bardic_inspiration_die) { const max = Math.max(1, md.cha); resources.push({ key: 'bardic', label: `Bardic Inspiration (d${spec.bardic_inspiration_die})`, max, used: Math.min(s.resUsed.bardic || 0, max), rest: part('Bard').lvl >= 5 ? 'short' : 'long' }); }
    s.feats.filter(f => f.uses).forEach(f => resources.push({ key: 'feat:' + f.id, label: f.name, max: f.uses, used: Math.min(f.used, f.uses), rest: 'long' }));
    const extras = [];
    if (spec.rage_damage_bonus) extras.push({ label: 'Rage Damage', value: '+' + spec.rage_damage_bonus });
    if (spec.martial_arts_die) extras.push({ label: 'Martial Arts', value: 'd' + spec.martial_arts_die });
    if (spec.sneak_attack) extras.push({ label: 'Sneak Attack', value: `${spec.sneak_attack.dice_count}d${spec.sneak_attack.dice_value}`, roll: `${spec.sneak_attack.dice_count}d${spec.sneak_attack.dice_value}` });
    if (spec.unarmored_movement_bonus) extras.push({ label: 'Unarmored Movement', value: `+${spec.unarmored_movement_bonus} ft.` });
    if (spec.weapon_mastery) extras.push({ label: 'Weapon Masteries', value: spec.weapon_mastery });
    if (spec.eldritch_invocations) extras.push({ label: 'Eldritch Invocations', value: spec.eldritch_invocations });
    if (spec.favored_enemies) extras.push({ label: 'Favored Enemy (Hunter\'s Mark uses)', value: spec.favored_enemies });

    // Hit Point Dice: one pool per die size; spending uses the biggest dice first.
    const pool = {};
    parts.forEach(x => { const die = x.c ? x.c.hitDie : 8; pool[die] = (pool[die] || 0) + x.lvl; });
    const hdPool = Object.entries(pool).map(([die, count]) => ({ die: Number(die), count })).sort((a, b) => b.die - a.die);
    let usedLeft = s.hdUsed, hdNext = null;
    hdPool.forEach(p => { const u = Math.min(usedLeft, p.count); p.left = p.count - u; usedLeft -= u; if (p.left && !hdNext) hdNext = p.die; });

    const weight = Math.round(items.reduce((t, i) => t + i.qty * num(i.weight != null ? i.weight : i.g && i.g.weight, 0), 0) * 100) / 100;
    return { c, lvl, L, P, parts, multi, pb, score, md, saveProf, saves, skills, passive: 10 + (perception ? perception.bonus : md.wis), sp, sub, bg, subclass, spec,
      features, items, armor, shield, autoAc, autoInit, autoHp, autoSpeed, ac, maxHp, hp, init, speed, inCombat, attacks, casting, castings, slots, pact, shortSlots, counts, spells,
      resources, extras, weight, capacity: score.str * 15, attuned: items.filter(i => i.attuned).length, hdPool, hdNext, hitDie: c ? c.hitDie : 8,
      spellClasses: castings.map(x => x.cls), stealthDis: !!(armor && armor.g.stealthDis) };
  }

  // ---------- The interactive sheet ----------
  // opts: { model, live, mode: 'player'|'dm'|'solo', onChange(model), onShare(share) → Promise, toast(text), extraTabs: [{id, label, el}] }
  // 'solo' is the standalone sheet with no DM: it rolls on the phone itself and has nobody to show cards to.
  function mount(root, opts) {
    let model = prepare(opts.model || {}), live = opts.live || null, name = (opts.model || {}).name || '';
    let tab = 'main', edit = false, pending = null, dlg = null, spellFilter = 'class';
    const solo = opts.mode === 'solo', player = !solo && opts.mode !== 'dm';
    const extras = opts.extraTabs || [];
    const toast = opts.toast || ((t) => { const el = document.createElement('div'); el.className = 'cs-toast'; el.textContent = t; document.body.append(el); setTimeout(() => el.remove(), 2600); });
    root.classList.add('cs');
    root.innerHTML = '<div class="cs-headbox"></div><div class="cs-tabs" role="tablist"></div><div class="cs-body"></div>';
    const $h = root.querySelector('.cs-headbox'), $t = root.querySelector('.cs-tabs'), $b = root.querySelector('.cs-body');
    const extraBoxes = extras.map(x => { const box = document.createElement('div'); box.className = 'cs-extra'; box.hidden = true; box.append(x.el); root.append(box); return box; });
    let D = derive(model, live);

    const commit = () => { applyAuto(model); render(); opts.onChange && opts.onChange(model); };
    const share = (sh) => {
      if (solo) { const s = cleanShare({ id: uid(), ...sh }), e = s && resolve(s); if (e && e.kind !== 'card' && e.kind !== 'hp') showRoll(e); return; }
      const p = opts.onShare ? opts.onShare({ id: uid(), ...sh }) : null;
      if (p && p.then) p.then(ok => { if (ok === false) toast('Not sent: check the connection to the DM'); else if (sh.kind === 'card') toast(player ? 'Sent to the DM' : 'Added to the player feed'); }).catch(() => toast('Not sent: check the connection to the DM'));
    };
    function showRoll(e) {
      document.querySelectorAll('.cs-rollpop').forEach(x => x.remove());
      const pop = document.createElement('div');
      pop.className = 'cs-rollpop';
      pop.innerHTML = feedHtml(e);
      pop.addEventListener('click', () => pop.remove());
      document.body.append(pop);
      if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(e.crit ? [80, 60, 80, 60, 160] : 40);
      setTimeout(() => { pop.classList.add('out'); setTimeout(() => pop.remove(), 400); }, 8000);
    }
    const getPath = (path) => !path ? model : path.split('.').reduce((o, k) => o == null ? o : (k[0] === '#' ? o.find(x => x.id === k.slice(1)) : o[k]), model);
    const setPath = (path, v) => { const ks = path.split('.'), last = ks.pop(), o = getPath(ks.join('.')); if (o) o[last] = v; };

    function render() {
      D = derive(model, live);
      renderHead(); renderTabs(); renderBody();
    }

    // ----- Header: name, the big numbers, HP, conditions -----
    function renderHead() {
      const c = D.c, cls = D.multi ? `Level ${D.lvl} · ${D.parts.map(x => `${esc(x.c ? x.c.name : x.name)} ${x.lvl}`).join(' / ')}`
        : c || model.cls ? `Level ${D.lvl} ${esc(c ? c.name : model.cls)}${model.sheet.subclass ? ` (${esc(model.sheet.subclass)})` : ''}` : '';
      const sub = [cls, esc(model.sheet.species), esc(model.sheet.background)].filter(Boolean).join(' · ');
      const hpPct = D.maxHp ? clamp(D.hp / D.maxHp, 0, 1) : null;
      const conds = (live && live.conditions) || [];
      $h.innerHTML = `<div class="cs-title"><div class="cs-namebox"><div class="cs-name">${esc(name || 'Adventurer')}</div><div class="cs-sub">${sub || 'Tap ✏ Edit to set up your character'}</div></div>
        <button class="cs-editbtn${edit ? ' on' : ''}" data-act="edit">${edit ? '✓ Done' : '✏ Edit'}</button></div>
        <div class="cs-tiles">
          <button class="cs-tile" data-act="ac"><b>${D.ac}</b><span>AC</span></button>
          <button class="cs-tile cs-hp" data-act="hp"><b>${D.hp ?? '—'}<small>${D.maxHp != null ? ' / ' + D.maxHp : ''}</small></b><span>HP${model.sheet.tempHp ? ` · +${model.sheet.tempHp} temp` : ''}</span></button>
          <button class="cs-tile" data-act="roll" data-label="Initiative" data-tag="init" data-bonus="${D.init}"><b>${sgn(D.init)}</b><span>Initiative</span></button>
          <div class="cs-tile"><b>${D.speed}<small> ft</small></b><span>Speed</span></div>
          <div class="cs-tile"><b>${sgn(D.pb)}</b><span>Proficiency</span></div>
          <div class="cs-tile"><b>${D.passive}</b><span>Passive Perc.</span></div>
        </div>
        ${hpPct != null ? `<div class="cs-hpbar"><i style="width:${hpPct * 100}%;background:${hpPct > .5 ? 'var(--green, #4caf50)' : hpPct > .25 ? '#e0a030' : 'var(--red, #d9443a)'}"></i></div>` : ''}
        <div class="cs-status">${D.inCombat ? '<span class="cs-chip cs-live">⚔ In combat</span>' : ''}${conds.map(x => `<span class="cs-chip cs-cond">${esc(x)}</span>`).join('')}
          ${model.sheet.conc ? `<button class="cs-chip on" data-act="end-conc" title="Tap to stop concentrating">◎ ${esc(model.sheet.conc)} ✕</button>` : ''}
          <button class="cs-chip${model.sheet.inspiration ? ' on' : ''}" data-act="inspiration" title="Tap to gain or spend Heroic Inspiration">${model.sheet.inspiration ? '★ Heroic Inspiration' : '☆ No Heroic Inspiration'}</button></div>
        ${live && live.deathSaves ? `<div class="cs-ds"><b>Death saves</b> ${[0, 1, 2].map(k => `<i class="cs-pip ok${k < live.deathSaves.s ? ' on' : ''}"></i>`).join('')} ${[0, 1, 2].map(k => `<i class="cs-pip bad${k < live.deathSaves.f ? ' on' : ''}"></i>`).join('')}
          <button class="cs-btn small primary" data-act="roll" data-label="Death saving throw" data-tag="death" data-bonus="0" data-nomod="1">🎲 Roll death save</button></div>` : ''}`;
    }

    function renderTabs() {
      const tabs = [['main', 'Stats'], ['actions', 'Actions'], ...(D.casting || model.sheet.spells.length || edit ? [['spells', 'Spells']] : []), ['gear', 'Gear'], ['features', 'Features'], ['about', 'About'], ...extras.map(x => [x.id, x.label])];
      if (!tabs.some(t => t[0] === tab)) tab = 'main';
      $t.innerHTML = tabs.map(([id, label]) => `<button role="tab" class="${id === tab ? 'on' : ''}" data-tab="${id}">${esc(label)}</button>`).join('');
      const ex = extras.findIndex(x => x.id === tab);
      extraBoxes.forEach((b, i) => { b.hidden = i !== ex; });
      $b.hidden = ex >= 0;
    }

    function renderBody() {
      if (extras.some(x => x.id === tab)) return;
      $b.innerHTML = ({ main: mainTab, actions: actionsTab, spells: spellsTab, gear: gearTab, features: featuresTab, about: aboutTab }[tab] || mainTab)();
    }

    const field = (label, path, value, type = 'text', extra = '') => `<label class="cs-field"><span>${label}</span><input data-f="${path}" data-t="${type === 'number' ? 'int' : 'str'}" type="${type}" value="${esc(value ?? '')}" ${type === 'number' ? 'inputmode="numeric"' : ''} ${extra}></label>`;
    const datalist = (id, list) => `<datalist id="${id}">${list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
    const dots = (p) => p === 2 ? '◉' : p ? '●' : '○';

    // ----- Stats: abilities, saves, skills -----
    function setupCard() {
      const d = DATA(), c = D.c;
      return `<div class="cs-card cs-setup"><h4>${model.cls ? 'Your character' : 'Start here'}</h4>
        <p class="cs-hint">Pick your class, level, species and background. The sheet fills in your proficiency bonus, saving throws, hit points, features and spell slots.</p>
        <div class="cs-grid2">
          ${field('Class', 'cls', model.cls, 'text', 'list="cs-dl-class" placeholder="e.g. Fighter"')}
          <label class="cs-field"><span>${D.multi ? 'Total level' : 'Level'}</span><span class="cs-step"><button class="cs-btn small" data-act="level" data-d="-1">−</button><input data-f="level" data-t="int" type="number" inputmode="numeric" min="1" max="20" value="${D.lvl}"><button class="cs-btn small" data-act="level" data-d="1">＋</button></span></label>
          ${field('Subclass', 'sheet.subclass', model.sheet.subclass, 'text', `list="cs-dl-sub" placeholder="${c && c.subclasses.length ? esc(c.subclasses[0].name) : ''}"`)}
          ${field('Species', 'sheet.species', model.sheet.species, 'text', 'list="cs-dl-species" placeholder="e.g. Dwarf"')}
          ${D.sp && D.sp.subspecies.length ? field('Lineage', 'sheet.subspecies', model.sheet.subspecies, 'text', 'list="cs-dl-subspecies"') : ''}
          ${field('Background', 'sheet.background', model.sheet.background, 'text', 'list="cs-dl-bg" placeholder="e.g. Soldier"')}
        </div>
        ${D.multi ? `<p class="cs-hint">${esc(c ? c.name : model.cls || 'First class')} level ${D.P.lvl}: the total minus your other classes. Saving throws come from this class.</p>` : ''}
        ${(model.sheet.multi || []).map(x => `<div class="cs-multi">
          <input data-f="sheet.multi.#${x.id}.cls" data-t="str" value="${esc(x.cls)}" list="cs-dl-class" placeholder="Class">
          <input data-f="sheet.multi.#${x.id}.level" data-t="int" type="number" inputmode="numeric" min="1" max="19" value="${x.level}" aria-label="Level in this class">
          <input data-f="sheet.multi.#${x.id}.subclass" data-t="str" value="${esc(x.subclass)}" placeholder="Subclass" list="cs-dl-sub-${x.id}">
          ${datalist('cs-dl-sub-' + x.id, (byName(d.classes, x.cls) || { subclasses: [] }).subclasses.map(y => y.name))}
          <button class="cs-x" data-act="del-multi" data-id="${x.id}" aria-label="Remove this class">✕</button></div>`).join('')}
        ${D.c && D.lvl < 20 ? '<button class="cs-btn primary" data-act="levelup">⬆ Level up</button> ' : ''}${model.cls && (model.sheet.multi || []).length < 3 ? `<button class="cs-btn small" data-act="add-multi" ${D.lvl < 2 ? 'disabled title="Reach level 2 first"' : ''}>＋ Add a class (multiclass)</button>` : ''}
        ${datalist('cs-dl-class', d.classes.map(x => x.name))}${datalist('cs-dl-sub', c ? c.subclasses.map(x => x.name) : [])}
        ${datalist('cs-dl-species', d.species.map(x => x.name))}${datalist('cs-dl-subspecies', D.sp ? D.sp.subspecies.map(x => x.name) : [])}${datalist('cs-dl-bg', d.backgrounds.map(x => x.name))}
        ${D.bg ? `<p class="cs-hint">${esc(D.bg.name)}: add +2 to one and +1 to another of ${D.bg.abilities.map(a => AB_NAME[a]).join(', ')} (or +1 to all three). Skills: ${D.bg.skills.join(', ')}. Feat: ${esc(D.bg.feat || '—')}.</p>` : ''}
        ${c ? `<p class="cs-hint">${esc(c.name)}: d${c.hitDie} hit die, best in ${esc(c.primary)}. Choose ${c.skillChoose} skills from ${c.skillFrom.join(', ')}.</p>` : ''}
        <p class="cs-hint">Ability scores: the standard array is 15, 14, 13, 12, 10, 8. Type them in the boxes below.</p></div>`;
    }

    function mainTab() {
      const c = D.c;
      const chosen = c ? c.skillFrom.filter(n => model.sheet.skills[n]).length : 0;
      return `${edit || !model.cls ? setupCard() : ''}
        <div class="cs-abils">${AB.map(a => `<div class="cs-abil">
          <button class="cs-abil-main" data-act="roll" data-label="${AB_NAME[a]} check" data-bonus="${D.md[a]}"><span>${AB_NAME[a]}</span><b>${sgn(D.md[a])}</b></button>
          ${edit ? `<input class="cs-score" data-f="sheet.abilities.${a}" data-t="int" type="number" inputmode="numeric" min="1" max="30" value="${D.score[a]}">` : `<span class="cs-score">${D.score[a]}</span>`}</div>`).join('')}</div>
        <div class="cs-card"><h4>Saving throws${edit ? '<small> · tap ○ to change proficiency</small>' : ''}</h4><div class="cs-list cs-cols2">${AB.map(a => `<div class="cs-row">
          ${edit ? `<button class="cs-dot" data-act="save-prof" data-a="${a}">${dots(D.saveProf[a] ? 1 : 0)}</button>` : `<span class="cs-dot">${dots(D.saveProf[a] ? 1 : 0)}</span>`}
          <button class="cs-rowbtn" data-act="roll" data-label="${AB_NAME[a]} saving throw" data-bonus="${D.saves[a]}"><span>${AB_NAME[a]}</span><b>${sgn(D.saves[a])}</b></button></div>`).join('')}</div></div>
        <div class="cs-card"><h4>Skills${edit ? `<small> · tap ○ for proficiency, again for expertise${c ? ` · ${chosen}/${c.skillChoose} class skills picked` : ''}</small>` : ''}</h4><div class="cs-list cs-cols2">${D.skills.map(k => `<div class="cs-row${edit && c && c.skillFrom.includes(k.name) ? ' cs-opt' : ''}">
          ${edit ? `<button class="cs-dot" data-act="skill-prof" data-k="${esc(k.name)}">${dots(k.prof)}</button>` : `<span class="cs-dot">${dots(k.prof)}</span>`}
          <button class="cs-rowbtn" data-act="roll" data-label="${esc(k.name)} check" data-bonus="${k.bonus}"><span>${esc(k.name)} <small>${k.ab.toUpperCase()}</small></span><b>${sgn(k.bonus)}</b></button></div>`).join('')}</div>
          ${D.stealthDis ? '<p class="cs-hint">Your armor gives Disadvantage on Stealth checks.</p>' : ''}</div>`;
    }

    // ----- Actions: attacks, class resources, rests -----
    function pips(kind, key, max, used) {
      return `<span class="cs-pips">${Array.from({ length: max }, (_, i) => `<button class="cs-pip${i < max - used ? ' on' : ''}" data-act="pip" data-kind="${kind}" data-key="${esc(key)}" data-i="${i}" aria-label="${i < max - used ? 'Available' : 'Used'}"></button>`).join('')}</span><span class="cs-count">${max - used}/${max}</span>`;
    }
    function actionsTab() {
      return `<div class="cs-card"><h4>Attacks <small>Tap one to roll it</small></h4>
        ${D.attacks.map((a, i) => `<div class="cs-attack"><button class="cs-rowbtn" data-act="attack" data-i="${i}">
          <span class="cs-atk-name">${esc(a.name)}${a.mastery ? `<small class="cs-tag">${esc(a.mastery)}</small>` : ''}<small>${esc(a.notes || '')}</small></span>
          <span class="cs-atk-hit">${sgn(a.hit)}</span><span class="cs-atk-dmg">${esc(a.dmg || '—')} <small>${esc(a.dmgType || '')}</small></span></button>
          ${edit && a.custom ? `<button class="cs-x" data-act="del-attack" data-id="${a.custom}" aria-label="Remove">✕</button>` : ''}</div>`).join('')}
        ${D.attacks.length === 1 ? '<p class="cs-hint">Weapons you equip in Gear show up here.</p>' : ''}
        ${edit ? `<div class="cs-addrow"><input id="cs-atk-name" placeholder="Name"><input id="cs-atk-hit" type="number" inputmode="numeric" placeholder="To hit"><input id="cs-atk-dmg" placeholder="Damage, e.g. 1d8+3"><input id="cs-atk-type" placeholder="Type"><button class="cs-btn" data-act="add-attack">Add</button></div>` : ''}</div>
        ${D.resources.length || D.extras.length ? `<div class="cs-card"><h4>Class resources <small>Tap a dot to use it</small></h4>
          ${D.resources.map(r => `<div class="cs-res"><span>${esc(r.label)}</span>${pips('res', r.key, r.max, r.used)}</div>`).join('')}
          ${D.extras.map(x => `<div class="cs-res"><span>${esc(x.label)}</span>${x.roll ? `<button class="cs-btn small" data-act="damage" data-label="${esc(x.label)}" data-expr="${esc(x.roll)}">🎲 ${esc(x.value)}</button>` : `<b>${esc(x.value)}</b>`}</div>`).join('')}</div>` : ''}
        <div class="cs-card"><h4>Hit Point Dice</h4><div class="cs-res"><span>${D.hdPool.map(p => `${p.left}/${p.count} d${p.die}`).join(' · ')} left</span>
          <button class="cs-btn small" data-act="hitdie" ${D.hdNext ? '' : 'disabled'}>🎲 Spend one${D.hdNext ? ` (1d${D.hdNext}${sgn(D.md.con)})` : ''}</button></div></div>
        <div class="cs-card cs-rests"><button class="cs-btn" data-act="rest" data-r="short">☕ Short Rest</button><button class="cs-btn" data-act="rest" data-r="long">🌙 Long Rest</button>
          <p class="cs-hint">A Long Rest restores your HP, spell slots, resources and Hit Point Dice. A Short Rest restores Warlock Pact Magic slots and short-rest resources.</p></div>`;
    }

    // ----- Spells -----
    function spellsTab() {
      const cs = D.casting, prepCount = D.spells.filter(x => x.level > 0 && x.prepared).length, cantrips = D.spells.filter(x => x.level === 0).length;
      const groups = {};
      D.spells.forEach(x => (groups[x.level] = groups[x.level] || []).push(x));
      return `${cs ? `<div class="cs-tiles cs-tiles3"><div class="cs-tile"><b>${cs.ab.toUpperCase()}</b><span>Spellcasting</span></div><div class="cs-tile"><b>${cs.dc}</b><span>Save DC</span></div>
          <button class="cs-tile" data-act="roll" data-label="Spell attack" data-bonus="${cs.atk}"><b>${sgn(cs.atk)}</b><span>Spell attack</span></button></div>` : ''}
        ${D.castings.length > 1 ? `<p class="cs-hint">${D.castings.map(x => `${esc(x.cls)}: ${x.ab.toUpperCase()}, DC ${x.dc}, ${sgn(x.atk)} to hit`).join(' · ')}</p>` : ''}
        ${D.counts.cantrips || D.counts.prepared ? `<p class="cs-hint">Cantrips ${cantrips}/${D.counts.cantrips} · Prepared spells ${prepCount}/${D.counts.prepared}</p>` : ''}
        ${model.sheet.conc ? `<div class="cs-res"><span>Concentrating on <b>${esc(model.sheet.conc)}</b></span><button class="cs-btn small" data-act="end-conc">End it</button></div>` : ''}
        ${D.slots.length || D.pact ? `<div class="cs-card"><h4>Spell slots <small>Tap a dot to use a slot</small></h4>${D.slots.map(sl => `<div class="cs-res"><span>${ord(sl.level)} level</span>${pips('slot', sl.level, sl.max, sl.used)}</div>`).join('')}
          ${D.pact ? `<div class="cs-res"><span>Pact Magic <small>${ord(D.pact.level)} level · back on a Short Rest</small></span>${pips('pact', 'pact', D.pact.max, D.pact.used)}</div>` : ''}</div>` : ''}
        <div class="cs-card"><h4>Add a spell</h4><div class="cs-search"><input class="cs-ac" data-ac="spell" placeholder="Search spells…" autocomplete="off">
          <div class="cs-seg small">${D.spellClasses.length ? `<button class="${spellFilter === 'class' ? 'on' : ''}" data-act="spellfilter" data-v="class">${esc(D.spellClasses.join(' & '))}</button>` : ''}<button class="${spellFilter === 'all' || !D.spellClasses.length ? 'on' : ''}" data-act="spellfilter" data-v="all">All spells</button></div>
          <div class="cs-acl"></div></div></div>
        ${Object.keys(groups).length ? Object.entries(groups).map(([lv, list]) => `<div class="cs-card"><h4>${Number(lv) ? ord(Number(lv)) + ' level' : 'Cantrips'}</h4>${list.map(x => `<div class="cs-row">
          ${x.level > 0 ? `<button class="cs-dot" data-act="prep" data-id="${x.id}" title="Prepared">${x.prepared ? '●' : '○'}</button>` : '<span class="cs-dot">✦</span>'}
          <button class="cs-rowbtn" data-act="spell" data-id="${x.id}"><span>${esc(x.name)}${x.d && x.d.conc ? ' <small class="cs-tag">C</small>' : ''}${x.d && x.d.ritual ? ' <small class="cs-tag">R</small>' : ''}<small>${x.d ? esc(`${x.d.time.split(',')[0]} · ${x.d.range}`) : 'Custom spell'}</small></span><b>›</b></button></div>`).join('')}</div>`).join('')
        : '<p class="cs-empty">No spells yet. Search above to add them.</p>'}
        <p class="cs-hint">● = prepared. Tap a spell to read it, cast it or roll its damage.</p>`;
    }

    // ----- Gear -----
    function gearTab() {
      const s = model.sheet, starting = [...(D.c ? D.c.equipment.map(o => ({ from: D.c.name, ...o })) : []), ...(D.bg ? D.bg.equipment.map(o => ({ from: D.bg.name, ...o })) : [])];
      return `<div class="cs-card"><h4>Money</h4><div class="cs-coins">${COINS.map(k => `<label><span>${k.toUpperCase()}</span><input data-f="sheet.coins.${k}" data-t="int" type="number" inputmode="numeric" min="0" value="${s.coins[k] || 0}"></label>`).join('')}</div></div>
        <div class="cs-card"><h4>Add gear</h4><div class="cs-search"><input class="cs-ac" data-ac="item" placeholder="Search weapons, armor, gear, magic items…" autocomplete="off"><div class="cs-acl"></div></div>
          ${starting.length && !s.items.length ? `<button class="cs-btn" data-act="starting">🎒 Take your starting equipment</button>` : ''}</div>
        <div class="cs-card"><h4>Inventory <small>${D.weight} / ${D.capacity} lb${D.attuned ? ` · attuned ${D.attuned}/3` : ''}</small></h4>
        ${s.items.length ? D.items.map(i => { const k = i.g ? i.g.kind : i.mi ? 'magic' : 'gear', eq = ['weapon', 'armor', 'shield'].includes(k) || i.mi;
          return `<div class="cs-item">${eq ? `<button class="cs-dot" data-act="equip" data-id="${i.id}" title="${i.equipped ? 'Equipped' : 'Not equipped'}">${i.equipped ? '●' : '○'}</button>` : '<span class="cs-dot"></span>'}
            <button class="cs-rowbtn" data-act="item" data-id="${i.id}"><span>${esc(i.name)}${i.bonus ? ` ${sgn(i.bonus)}` : ''}${i.attuned ? ' <small class="cs-tag">Attuned</small>' : ''}<small>${esc(itemLine(i))}</small></span></button>
            <span class="cs-step"><button class="cs-btn small" data-act="qty" data-id="${i.id}" data-d="-1">−</button><b>${i.qty}</b><button class="cs-btn small" data-act="qty" data-id="${i.id}" data-d="1">＋</button></span></div>`; }).join('')
        : '<p class="cs-empty">Nothing yet.</p>'}
        <p class="cs-hint">● = equipped. Equipped armor and shields set your AC; equipped weapons appear under Actions.</p></div>`;
    }
    function itemLine(i) {
      const g = i.g;
      if (g && g.kind === 'weapon') return `${g.dmg} ${g.dmgType}${g.props ? ' · ' + g.props.join(', ') : ''}`;
      if (g && g.kind === 'armor') return `${g.armorType} armor · AC ${g.ac}${g.dex ? (g.maxDex != null ? ` + Dex (max ${g.maxDex})` : ' + Dex') : ''}`;
      if (g && g.kind === 'shield') return `Shield · +${g.ac} AC`;
      if (i.mi) return `${i.mi.type} · ${i.mi.rarity}`;
      return i.notes ? i.notes.slice(0, 60) : (g && g.weight ? `${g.weight} lb` : '');
    }

    // ----- Features -----
    function featuresTab() {
      const groups = {};
      D.features.forEach((f, i) => (groups[f.src] = groups[f.src] || []).push([f, i]));
      const res = Object.fromEntries(D.resources.filter(r => r.key.startsWith('feat:')).map(r => [r.key.slice(5), r]));
      return `${D.c && D.lvl < 20 ? '<button class="cs-btn primary" data-act="levelup" style="width:100%;margin-bottom:10px">⬆ Level up</button>' : ''}${Object.entries(groups).map(([src, list]) => `<div class="cs-card"><h4>${esc(src)}</h4>${list.map(([f, i]) => `<div class="cs-row">
          <button class="cs-rowbtn" data-act="feature" data-i="${i}"><span>${esc(f.name)}${f.level ? `<small>Level ${f.level}</small>` : ''}</span><b>›</b></button>
          ${f.custom && res[f.custom] ? pips('feat', 'feat:' + f.custom, res[f.custom].max, res[f.custom].used) : ''}</div>`).join('')}</div>`).join('') || '<p class="cs-empty">Pick a class, species and background (✏ Edit) to see your features here.</p>'}
        <div class="cs-card"><h4>Add a feat or feature</h4><div class="cs-search"><input class="cs-ac" data-ac="feat" placeholder="Search feats, or type any name…" autocomplete="off"><div class="cs-acl"></div></div></div>`;
    }

    // ----- About: numbers, proficiencies, personality -----
    function aboutTab() {
      const s = model.sheet, A = s.auto;
      const autoRow = (key, label, value, autoV, path, note = '') => `<div class="cs-res"><span>${label}${note ? `<small>${note}</small>` : ''}</span>
        <label class="cs-auto"><input type="checkbox" data-act="auto" data-k="${key}" ${A[key] ? 'checked' : ''}> Auto</label>
        <input class="cs-num" type="number" inputmode="numeric" data-f="${path}" data-t="int" value="${esc(A[key] ? (autoV ?? '') : (value ?? ''))}" ${A[key] ? 'disabled' : ''}></div>`;
      const profs = [...(D.c ? D.c.profs : []), ...(D.bg ? D.bg.tools : [])];
      return `${setupCard()}
        <div class="cs-card"><h4>Numbers <small>Untick Auto to type your own</small></h4>
          ${autoRow('ac', 'Armor Class', model.ac, D.autoAc, 'ac')}
          ${autoRow('hp', 'Hit Point maximum', model.hp, D.autoHp, 'hp', D.c ? `d${D.c.hitDie} per level, average rolls` : 'Pick a class to calculate it')}
          ${autoRow('init', 'Initiative bonus', model.initBonus, D.autoInit, 'initBonus')}
          ${autoRow('speed', 'Speed (ft.)', s.speed, D.autoSpeed, 'sheet.speed')}
          <div class="cs-res"><span>Extra AC <small>Ring of Protection, spells…</small></span><input class="cs-num" type="number" inputmode="numeric" data-f="sheet.acMisc" data-t="int" value="${s.acMisc}"></div></div>
        <div class="cs-card"><h4>Proficiencies & languages</h4>${profs.length ? `<p class="cs-hint">From your class and background: ${esc(profs.join(', '))}</p>` : ''}
          <label class="cs-field"><span>Other proficiencies (tools, instruments…)</span><textarea data-f="sheet.profs" data-t="str" rows="2">${esc(s.profs)}</textarea></label>
          <label class="cs-field"><span>Languages</span><input data-f="sheet.languages" data-t="str" value="${esc(s.languages)}" placeholder="Common, …"></label></div>
        <div class="cs-card"><h4>Who you are</h4><div class="cs-grid2">
          ${field('Alignment', 'sheet.alignment', s.alignment, 'text', 'list="cs-dl-align"')}${datalist('cs-dl-align', ALIGN)}
          ${field('Size', 'sheet.size', s.size || (D.sp ? D.sp.size : ''), 'text')}
          ${field('Experience points', 'sheet.xp', s.xp, 'number')}</div>
          ${BIO.map(([k, label]) => `<label class="cs-field"><span>${label}</span><textarea data-f="sheet.bio.${k}" data-t="str" rows="${k === 'backstory' ? 5 : 2}">${esc(s.bio[k])}</textarea></label>`).join('')}</div>`;
    }

    // ---------- Dialogs ----------
    function dialog(html, onClick) {
      closeDialog();
      dlg = document.createElement('div');
      dlg.className = 'cs-dlg-wrap';
      dlg.innerHTML = `<div class="cs-dlg" role="dialog"><button class="cs-dlg-x" data-do="close" aria-label="Close">✕</button>${html}</div>`;
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) return closeDialog();
        const b = e.target.closest('[data-do]');
        if (!b) return;
        if (b.dataset.do === 'close') return closeDialog();
        onClick(b.dataset.do, b, dlg);
      });
      document.body.append(dlg);
      return dlg;
    }
    function closeDialog() { if (dlg) { dlg.remove(); dlg = null; } }
    const modeSeg = () => `<div class="cs-seg cs-mode"><button data-do="mode" data-m="dis">Disadvantage</button><button data-do="mode" data-m="normal" class="on">Normal</button><button data-do="mode" data-m="adv">Advantage</button></div>`;
    const curMode = (box) => { const on = box.querySelector('.cs-mode .on'); return on ? on.dataset.m : 'normal'; };
    const sendBtns = (rollLabel) => `<button class="cs-btn primary big" data-do="send">🎲 ${rollLabel}${player ? ' and send to the DM' : ''}</button>
      ${player ? `<div class="cs-manual"><span>Rolled real dice?</span><input type="number" inputmode="numeric" placeholder="Your total"><button class="cs-btn" data-do="manual">Send</button></div>
      <button class="cs-btn ghost" data-do="local">Roll just for me</button>` : ''}<div class="cs-result"></div>`;
    const showLocal = (box, e) => { box.querySelector('.cs-result').innerHTML = e ? feedHtml(e) : ''; };

    function rollDialog(label, bonus, nomod, tag) {
      const expr = nomod ? '1d20' : '1d20' + (bonus ? sgn(bonus) : '');
      dialog(`<h3>${esc(label)}</h3>${nomod ? '' : `<div class="cs-big">${sgn(bonus)}</div>`}${tag === 'init' && player ? '<p class="cs-hint">If you\'re in the DM\'s turn order, this fills in your initiative.</p>' : tag === 'death' && player ? '<p class="cs-hint">The DM\'s tracker marks the success or failure.</p>' : ''}${modeSeg()}${sendBtns('Roll')}`, (act, b, box) => {
        if (act === 'mode') { box.querySelectorAll('.cs-mode button').forEach(x => x.classList.toggle('on', x === b)); return; }
        const sh = { kind: 'roll', label, sub: nomod ? '' : sgn(bonus), expr, mode: curMode(box), tag: tag || '' };
        if (act === 'local') return showLocal(box, resolve(sh));
        if (act === 'manual') { const v = box.querySelector('.cs-manual input').value; if (v === '') return; sh.manual = Number(v); }
        share(sh); closeDialog();
      });
    }

    function attackDialog(a) {
      dialog(`<h3>${esc(a.name)}</h3><div class="cs-big">${sgn(a.hit)} <small>to hit</small></div>
        <p class="cs-hint">${esc(a.dmg || '—')} ${esc(a.dmgType || '')} damage${a.versatile ? ` (${esc(a.versatile)} with two hands)` : ''}${a.notes ? ' · ' + esc(a.notes) : ''}${a.mastery ? ` · Mastery: ${esc(a.mastery)}` : ''}</p>
        ${a.versatile ? '<div class="cs-seg" data-grip><button data-do="grip" data-g="1" class="on">One hand</button><button data-do="grip" data-g="2">Two hands</button></div>' : ''}
        ${modeSeg()}${sendBtns('Roll attack + damage')}${a.dmg ? '<button class="cs-btn" data-do="dmg">Roll damage only</button>' : ''}`, (act, b, box) => {
        if (act === 'mode' || act === 'grip') { b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); return; }
        const two = box.querySelector('[data-grip] .on')?.dataset.g === '2', dmg = two && a.versatile ? a.versatile : a.dmg;
        if (act === 'dmg') { share({ kind: 'damage', label: `${a.name} damage`, expr: dmg, dmgType: a.dmgType }); return closeDialog(); }
        const sh = { kind: 'attack', label: a.name, sub: `${sgn(a.hit)} to hit`, expr: '1d20' + (a.hit ? sgn(a.hit) : ''), mode: curMode(box), dmg, dmgType: a.dmgType };
        if (act === 'local') return showLocal(box, resolve(sh));
        if (act === 'manual') { const v = box.querySelector('.cs-manual input').value; if (v === '') return; sh.manual = Number(v); }
        share(sh); closeDialog();
      });
    }

    function spellText(d) {
      return [`*${d.level ? `${ord(d.level)}-level ${d.school}` : `${d.school} cantrip`}*`, `**Casting Time:** ${d.time}`, `**Range:** ${d.range}`, `**Components:** ${d.comp}`,
        `**Duration:** ${d.conc ? 'Concentration, ' : ''}${d.dur}${d.ritual ? ' (ritual)' : ''}`, '', d.desc, d.higher ? `\n**Using a Higher-Level Spell Slot.** ${d.higher}` : ''].join('\n');
    }
    // Damage dice for a spell at a slot level (or character level for cantrips); falls back to the first dice in the text.
    function spellDice(x, slot) {
      const d = x.d, md = D.casting ? D.casting.mod : 0;
      const pickAt = (tbl, at) => { const ks = Object.keys(tbl).map(Number).filter(k => k <= at).sort((a, b) => b - a); return tbl[ks[0] != null ? ks[0] : Object.keys(tbl)[0]]; };
      let e = d && d.dmgChar ? pickAt(d.dmgChar, D.lvl) : d && d.dmgSlot ? pickAt(d.dmgSlot, slot || d.level) : null;
      if (!e) { const m = /\b(\d+d\d+)\b/.exec(d ? d.desc : x.desc || ''); e = m ? m[1] : null; }
      return e ? String(e).replace(/\s*\+\s*MOD/i, md ? sgn(md) : '').replace(/\s+/g, '') : null;
    }
    function spellDialog(x) {
      const d = x.d, avail = D.slots.filter(sl => sl.level >= x.level && sl.used < sl.max).map(sl => ({ v: String(sl.level), level: sl.level, label: `${ord(sl.level)}-level slot (${sl.max - sl.used} left)` }));
      if (D.pact && D.pact.level >= x.level && D.pact.used < D.pact.max) avail.push({ v: 'p', level: D.pact.level, label: `Pact Magic slot, ${ord(D.pact.level)} level (${D.pact.max - D.pact.used} left)` });
      const text = d ? spellText(d) : x.desc;
      dialog(`<h3>${esc(x.name)}</h3><div class="cs-dlg-text">${fmt(text || 'No description. Tap ✏ Edit on the Spells tab to remove it.')}</div>
        ${x.level > 0 ? (avail.length ? `<div class="cs-castrow"><select class="cs-slot">${avail.map(sl => `<option value="${sl.v}">${esc(sl.label)}</option>`).join('')}</select><button class="cs-btn primary" data-do="cast">✨ Cast</button></div>` : `<p class="cs-hint">${D.slots.length || D.pact ? 'No spell slots left at this level.' : ''}</p><button class="cs-btn" data-do="cast-free">✨ Cast (without a slot)</button>`) : `<button class="cs-btn primary" data-do="cast-free">✨ Cast</button>`}
        ${d && d.attack && D.casting ? `<button class="cs-btn" data-do="attack">🎯 Spell attack (${sgn(D.casting.atk)})</button>` : ''}
        ${d && d.save && D.casting ? `<p class="cs-hint">Targets make a ${AB_NAME[d.save] || d.save} saving throw against DC ${D.casting.dc}.</p>` : ''}
        ${spellDice(x) ? `<button class="cs-btn" data-do="dmg">🎲 Roll ${esc(spellDice(x))}${d && d.dmgType ? ' ' + esc(d.dmgType) : ''}</button>` : ''}
        ${player ? '<button class="cs-btn ghost" data-do="show">📤 Show the DM</button>' : ''}
        ${edit ? '<button class="cs-btn danger" data-do="del">Remove spell</button>' : ''}`, (act, b, box) => {
        const slotSel = box.querySelector('.cs-slot'), pactSlot = slotSel && slotSel.value === 'p', slot = pactSlot ? D.pact.level : slotSel ? Number(slotSel.value) : x.level;
        if (act === 'cast' || act === 'cast-free') {
          if (act === 'cast') { if (pactSlot) model.sheet.pactUsed++; else model.sheet.slotsUsed[slot - 1] = (model.sheet.slotsUsed[slot - 1] || 0) + 1; }
          // A concentration spell replaces the one being concentrated on, and marks the character Concentrating in the tracker.
          if (d && d.conc) model.sheet.conc = x.name;
          if (act === 'cast' || (d && d.conc)) commit();
          share({ kind: 'card', tag: d && d.conc ? 'conc' : '', title: `${name || 'They'} casts ${x.name}`, sub: act === 'cast' ? `using a ${pactSlot ? 'Pact Magic' : ord(slot) + '-level'} slot` : (x.level ? 'without a spell slot' : 'cantrip'),
            body: d ? `${d.range} · ${d.dur}${d.conc ? ' · Concentration' : ''}${d.save && D.casting ? ` · ${AB_NAME[d.save] || d.save} save DC ${D.casting.dc}` : ''}` : '' });
          return closeDialog();
        }
        if (act === 'attack') { share({ kind: 'attack', label: `${x.name} (spell attack)`, sub: `${sgn(D.casting.atk)} to hit`, expr: '1d20' + sgn(D.casting.atk), dmg: spellDice(x, slot) || undefined, dmgType: d.dmgType || '' }); return closeDialog(); }
        if (act === 'dmg') { share({ kind: 'damage', label: `${x.name} damage`, expr: spellDice(x, slot), dmgType: d && d.dmgType || '' }); return closeDialog(); }
        if (act === 'show') { share({ kind: 'card', title: x.name, sub: 'Spell', body: text || '' }); return closeDialog(); }
        if (act === 'del') { model.sheet.spells = model.sheet.spells.filter(y => y.id !== x.id); commit(); closeDialog(); }
      });
    }

    function itemDialog(i) {
      const g = i.g, mi = i.mi, eq = g && ['weapon', 'armor', 'shield'].includes(g.kind) || mi;
      const lines = [];
      if (g) {
        if (g.kind === 'weapon') lines.push(`**Damage:** ${g.dmg} ${g.dmgType}${g.versatile ? ` (${g.versatile} two-handed)` : ''}`, g.props ? `**Properties:** ${g.props.join(', ')}` : '', g.mastery ? `**Mastery:** ${g.mastery}` : '', `**${g.ranged ? 'Range' : 'Reach'}:** ${g.range || 5} ft.${g.thrown ? ` (thrown ${g.thrown} ft.)` : ''}`);
        if (g.kind === 'armor') lines.push(`**Armor Class:** ${g.ac}${g.dex ? (g.maxDex != null ? ` + Dex modifier (max ${g.maxDex})` : ' + Dex modifier') : ''}`, g.strMin ? `**Strength needed:** ${g.strMin}` : '', g.stealthDis ? 'Disadvantage on Stealth checks' : '');
        if (g.kind === 'shield') lines.push(`**Armor Class:** +${g.ac}`);
        lines.push([g.weight ? `${g.weight} lb` : '', g.cost].filter(Boolean).join(' · '));
        if (g.contents) lines.push('**Contains:** ' + g.contents.map(c => `${c.count > 1 ? c.count + ' ' : ''}${c.name}`).join(', '));
        if (g.desc) lines.push('', g.desc);
      }
      if (mi) lines.push(`*${mi.type}, ${mi.rarity}*`, mi.desc);
      const text = lines.filter(x => x !== '').join('\n');
      dialog(`<h3>${esc(i.name)}</h3>${text ? `<div class="cs-dlg-text">${fmt(text)}</div>` : ''}
        <div class="cs-grid2">
          <label class="cs-field"><span>Quantity</span><input data-k="qty" type="number" inputmode="numeric" min="0" value="${i.qty}"></label>
          ${eq ? `<label class="cs-field"><span>Magic bonus</span><input data-k="bonus" type="number" inputmode="numeric" min="-5" max="10" value="${i.bonus}" placeholder="+1"></label>` : ''}
          ${g ? '' : `<label class="cs-field"><span>Weight (lb)</span><input data-k="weight" type="number" inputmode="decimal" min="0" value="${i.weight ?? ''}"></label>`}
        </div>
        ${mi ? `<label class="cs-check"><input type="checkbox" data-k="attuned" ${i.attuned ? 'checked' : ''}> Attuned</label>` : ''}
        ${eq ? `<label class="cs-check"><input type="checkbox" data-k="equipped" ${i.equipped ? 'checked' : ''}> ${g && g.kind === 'weapon' ? 'Equipped (shows under Actions)' : 'Equipped / worn'}</label>` : ''}
        <label class="cs-field"><span>Notes</span><textarea data-k="notes" rows="2">${esc(i.notes)}</textarea></label>
        <div class="cs-btnrow"><button class="cs-btn primary" data-do="save">Save</button>${player ? '<button class="cs-btn" data-do="show">📤 Show the DM</button>' : ''}<button class="cs-btn danger" data-do="del">Remove</button></div>`, (act, b, box) => {
        const it = model.sheet.items.find(x => x.id === i.id);
        if (!it) return closeDialog();
        if (act === 'save') {
          box.querySelectorAll('[data-k]').forEach(inp => {
            const k = inp.dataset.k;
            if (inp.type === 'checkbox') it[k] = inp.checked;
            else if (k === 'notes') it[k] = inp.value.slice(0, 1000);
            else if (k === 'weight') it[k] = inp.value === '' ? null : clamp(Number(inp.value) || 0, 0, 5000);
            else it[k] = clamp(Math.round(Number(inp.value) || 0), k === 'bonus' ? -5 : 0, k === 'bonus' ? 10 : 99999);
          });
          if (it.equipped) unequipOthers(it);
          commit(); return closeDialog();
        }
        if (act === 'show') { share({ kind: 'card', title: i.name, sub: mi ? `${mi.type}, ${mi.rarity}` : 'Item', body: [text, i.notes].filter(Boolean).join('\n\n') }); return closeDialog(); }
        if (act === 'del') { model.sheet.items = model.sheet.items.filter(x => x.id !== i.id); commit(); closeDialog(); }
      });
    }
    // Only one suit of armor and one shield can be worn at a time.
    function unequipOthers(it) {
      const k = (findGear(it.name) || {}).kind;
      if (k !== 'armor' && k !== 'shield') return;
      model.sheet.items.forEach(x => { if (x !== it && x.equipped && (findGear(x.name) || {}).kind === k) x.equipped = false; });
    }

    function featureDialog(f) {
      const cf = f.custom && model.sheet.feats.find(x => x.id === f.custom);
      dialog(`<h3>${esc(f.name)}</h3><p class="cs-hint">${esc(f.src)}${f.level ? ` · level ${f.level}` : ''}</p>
        ${cf ? `<label class="cs-field"><span>Description</span><textarea data-k="desc" rows="6">${esc(cf.desc || f.desc)}</textarea></label>
          <label class="cs-field"><span>Uses per Long Rest (0 = not tracked)</span><input data-k="uses" type="number" inputmode="numeric" min="0" max="99" value="${cf.uses}"></label>
          <div class="cs-btnrow"><button class="cs-btn primary" data-do="save">Save</button>${player ? '<button class="cs-btn" data-do="show">📤 Show the DM</button>' : ''}<button class="cs-btn danger" data-do="del">Remove</button></div>`
        : `<div class="cs-dlg-text">${fmt(f.desc || 'No description.')}</div>${player ? '<button class="cs-btn primary" data-do="show">📤 Show the DM</button>' : ''}`}`, (act, b, box) => {
        if (act === 'show') { share({ kind: 'card', title: f.name, sub: f.src, body: cf ? cf.desc || f.desc : f.desc }); return closeDialog(); }
        if (act === 'save' && cf) { cf.desc = box.querySelector('[data-k=desc]').value.slice(0, 6000); cf.uses = clamp(Math.round(Number(box.querySelector('[data-k=uses]').value) || 0), 0, 99); commit(); return closeDialog(); }
        if (act === 'del' && cf) { model.sheet.feats = model.sheet.feats.filter(x => x.id !== cf.id); commit(); closeDialog(); }
      });
    }

    // ---------- Level up ----------
    function levelUpDialog(partIdx = 0) {
      if (D.lvl >= 20) return toast('Already level 20');
      const part = D.parts[partIdx], c = part.c;
      if (!c) return toast('Pick a class from the list first (✏ Edit), or change the level by hand');
      const newLvl = part.lvl + 1, L = c.levels[newLvl - 1], avg = c.hitDie / 2 + 1 + D.md.con;
      const subclass = part.subclass;
      const feats = [...L.features.filter(f => !/Subclass( Feature)?$/i.test(f.name) || !subclass), ...(subclass ? subclass.features.filter(f => f.level === newLvl) : [])];
      const asi = L.features.some(f => /^Ability Score Improvement$/i.test(f.name));
      const needSub = !subclass && L.features.some(f => /Subclass$/i.test(f.name)) && !part.sub;
      // What spellcasting looks like after the level, to show the difference.
      const after = JSON.parse(JSON.stringify(model));
      if (part.primary) after.level = D.lvl + 1; else { after.level = D.lvl + 1; after.sheet.multi.find(x => x.id === part.id).level++; }
      const A2 = derive(after, live);
      const slotLine = (x) => x.slots.map(sl => `${sl.max}×${ord(sl.level)}`).join(', ') + (x.pact ? ` + Pact ${x.pact.max}×${ord(x.pact.level)}` : '');
      const spellNote = slotLine(A2) !== slotLine(D) ? `Spell slots: ${slotLine(D) || 'none'} → <b>${slotLine(A2)}</b>` : '';
      const countNote = A2.counts.cantrips !== D.counts.cantrips || A2.counts.prepared !== D.counts.prepared ? `Cantrips ${D.counts.cantrips} → <b>${A2.counts.cantrips}</b> · Prepared spells ${D.counts.prepared} → <b>${A2.counts.prepared}</b>` : '';
      let rolled = null;
      const abilSel = (cls) => `<select class="${cls}">${AB.map(a => `<option value="${a}">${AB_NAME[a]} (${D.score[a]})</option>`).join('')}</select>`;
      dialog(`<h3>Level up to ${D.lvl + 1}</h3>
        ${D.multi ? `<div class="cs-seg" data-part>${D.parts.map((x, i) => `<button data-do="part" data-i="${i}" class="${i === partIdx ? 'on' : ''}">${esc(x.c ? x.c.name : x.name)} ${x.lvl} → ${x.lvl + (i === partIdx ? 1 : 0)}</button>`).join('')}</div>` : `<p class="cs-hint">${esc(c.name)} ${part.lvl} → ${newLvl}</p>`}
        <div class="cs-card"><h4>Hit points</h4><div class="cs-seg" data-hp><button data-do="hp" data-v="avg" class="on">Take the average (+${avg})</button><button data-do="hp" data-v="roll">Roll 1d${c.hitDie}${sgn(D.md.con)}</button></div><div class="cs-hint cs-hproll"></div></div>
        ${needSub ? `<div class="cs-card"><h4>Choose your subclass</h4><input class="cs-newsub" list="cs-dl-lvsub" placeholder="${esc(c.subclasses[0] ? c.subclasses[0].name : 'Subclass')}">${datalist('cs-dl-lvsub', c.subclasses.map(x => x.name))}
          ${c.subclasses.map(x => `<p class="cs-hint"><b>${esc(x.name)}</b>: ${esc(x.summary || '')}</p>`).join('')}</div>` : ''}
        ${asi ? `<div class="cs-card"><h4>Ability Score Improvement</h4><div class="cs-seg" data-asi><button data-do="asi" data-v="two" class="on">+2 to one</button><button data-do="asi" data-v="split">+1 to two</button><button data-do="asi" data-v="feat">A feat</button></div>
          <div class="cs-asi-two">${abilSel('cs-a1')}</div><div class="cs-asi-split" hidden>${abilSel('cs-b1')} ${abilSel('cs-b2')}</div>
          <div class="cs-asi-feat" hidden><input class="cs-newfeat" list="cs-dl-lvfeat" placeholder="Feat name">${datalist('cs-dl-lvfeat', DATA().feats.filter(f => f.type === 'general' || f.type === 'origin').map(f => f.name))}</div>
          <p class="cs-hint">Scores can't go above 20.</p></div>` : ''}
        ${feats.length ? `<div class="cs-card"><h4>New features</h4>${feats.map(f => `<details><summary>${esc(f.name)}</summary><div class="cs-dlg-text">${fmt(f.desc || '')}</div></details>`).join('')}</div>` : ''}
        ${spellNote || countNote ? `<p class="cs-hint">${[spellNote, countNote].filter(Boolean).join('<br>')}</p>` : ''}
        <button class="cs-btn primary big" data-do="go">⬆ Level up</button>`, (act, b, box) => {
        if (act === 'part') return levelUpDialog(Number(b.dataset.i));
        if (act === 'hp' || act === 'asi') { b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }
        if (act === 'hp') {
          if (b.dataset.v === 'roll') { const r = rollDice(`1d${c.hitDie}${D.md.con ? sgn(D.md.con) : ''}`); rolled = Math.max(1, r.total); box.querySelector('.cs-hproll').textContent = `Rolled ${r.detail}: +${rolled} HP`; }
          else { rolled = null; box.querySelector('.cs-hproll').textContent = ''; }
          return;
        }
        if (act === 'asi') { ['two', 'split', 'feat'].forEach(k => { box.querySelector('.cs-asi-' + k).hidden = k !== b.dataset.v; }); return; }
        if (act !== 'go') return;
        const s = model.sheet, oldMax = D.maxHp;
        model.level = D.lvl + 1;
        if (!part.primary) { const x = s.multi.find(y => y.id === part.id); if (x) x.level++; }
        // HP: Auto uses the average. A roll switches max HP to a typed number.
        const gain = rolled != null ? rolled : avg;
        if (rolled != null && s.auto.hp) { s.auto.hp = false; model.hp = (oldMax || 0) + gain; }
        else if (!s.auto.hp) model.hp = (num(model.hp, 0)) + gain;
        if (needSub) { const v = box.querySelector('.cs-newsub').value.trim(); if (v) { const sc = byName(c.subclasses, v); if (part.primary) s.subclass = sc ? sc.name : v; else s.multi.find(y => y.id === part.id).subclass = sc ? sc.name : v; } }
        let asiText = '';
        if (asi) {
          const mode = box.querySelector('[data-asi] .on').dataset.v, up = (a, n) => { s.abilities[a] = Math.min(20, s.abilities[a] + n); };
          if (mode === 'two') { const a = box.querySelector('.cs-a1').value; up(a, 2); asiText = `+2 ${AB_NAME[a]}`; }
          else if (mode === 'split') { const a = box.querySelector('.cs-b1').value, b2 = box.querySelector('.cs-b2').value; up(a, 1); up(b2, 1); asiText = `+1 ${AB_NAME[a]}, +1 ${AB_NAME[b2]}`; }
          else { const v = box.querySelector('.cs-newfeat').value.trim(); if (v) { const f = findFeat(v); s.feats.push({ id: uid(), name: f ? f.name : v, desc: '', uses: 0, used: 0 }); asiText = `Feat: ${f ? f.name : v}`; } }
        }
        commit(); closeDialog();
        toast(`Level ${model.level}! +${gain} HP`);
        share({ kind: 'card', title: `${name || 'A player'} reached level ${model.level}`, sub: `${c.name} ${newLvl} · +${gain} HP${rolled != null ? ' (rolled)' : ''}`,
          body: [feats.length ? `**New:** ${feats.map(f => f.name).join(', ')}` : '', asiText].filter(Boolean).join('\n') });
      });
    }

    function hpDialog() {
      const s = model.sheet;
      if (D.inCombat && !player) return dialog(`<h3>Hit Points</h3><div class="cs-big">${D.hp ?? '—'}${D.maxHp != null ? ` <small>/ ${D.maxHp}</small>` : ''}</div><p class="cs-hint">During combat, change HP in the initiative tracker.</p>`, () => {});
      // In a fight the DM's tracker owns HP, so players report damage and healing and the DM applies it.
      if (D.inCombat) return dialog(`<h3>Hit Points</h3><div class="cs-big">${D.hp ?? '—'}${D.maxHp != null ? ` <small>/ ${D.maxHp}</small>` : ''}</div>
        <p class="cs-hint">The DM is tracking HP in this fight. Tell them what happened and they'll apply it with one click.</p>
        <input class="cs-amount" type="number" inputmode="numeric" min="1" placeholder="Amount">
        <div class="cs-btnrow"><button class="cs-btn danger" data-do="dmg">I took damage</button><button class="cs-btn primary" data-do="heal">I was healed</button></div>`, (act, b, box) => {
        const n = Math.round(Number(box.querySelector('.cs-amount').value) || 0);
        if (n < 1) return;
        share({ kind: 'hp', label: act === 'heal' ? `Healed ${n} HP` : `Took ${n} damage`, amount: n, heal: act === 'heal' });
        toast('Sent to the DM'); closeDialog();
      });
      dialog(`<h3>Hit Points</h3><div class="cs-big">${D.hp ?? '—'}${D.maxHp != null ? ` <small>/ ${D.maxHp}</small>` : ''}${s.tempHp ? ` <small>+${s.tempHp} temp</small>` : ''}</div>
        <input class="cs-amount" type="number" inputmode="numeric" min="0" placeholder="Amount">
        <div class="cs-btnrow"><button class="cs-btn danger" data-do="dmg">− Damage</button><button class="cs-btn primary" data-do="heal">＋ Heal</button><button class="cs-btn" data-do="temp">Set temp HP</button></div>
        <button class="cs-btn ghost" data-do="full">Back to full HP</button>`, (act, b, box) => {
        const n = Math.max(0, Math.round(Number(box.querySelector('.cs-amount').value) || 0)), max = D.maxHp ?? 9999, cur = D.hp ?? max;
        if (act === 'full') { s.curHp = null; s.tempHp = 0; }
        else if (!n) return;
        else if (act === 'dmg') { const fromTemp = Math.min(s.tempHp, n); s.tempHp -= fromTemp; s.curHp = Math.max(0, cur - (n - fromTemp)); }
        else if (act === 'heal') s.curHp = Math.min(max, Math.max(0, cur) + n);
        else if (act === 'temp') s.tempHp = n;
        if (s.curHp != null && s.curHp >= max) s.curHp = null;
        commit(); closeDialog();
      });
    }

    function acDialog() {
      const a = D.armor, sh = D.shield;
      dialog(`<h3>Armor Class</h3><div class="cs-big">${D.ac}</div><p class="cs-hint">${model.sheet.auto.ac
        ? `${a ? `${esc(a.name)} (${a.g.ac}${a.g.dex ? ' + Dex' : ''})` : D.c && D.c.name === 'Barbarian' ? 'Unarmored Defense (10 + Dex + Con)' : D.c && D.c.name === 'Monk' && !sh ? 'Unarmored Defense (10 + Dex + Wis)' : 'No armor (10 + Dex)'}${sh ? ` + ${esc(sh.name)}` : ''}${model.sheet.acMisc ? ` ${sgn(model.sheet.acMisc)} extra` : ''}. Equip armor in Gear, or set your own number in About.`
        : 'You set this by hand in About → Numbers.'}</p>`, () => {});
    }

    function startingDialog() {
      const sets = [...(D.c ? D.c.equipment.map(o => ({ from: D.c.name, ...o })) : []), ...(D.bg ? D.bg.equipment.map(o => ({ from: D.bg.name, ...o })) : [])];
      dialog(`<h3>Starting equipment</h3>${sets.map((o, si) => `<div class="cs-card"><h4>${esc(o.from)}</h4><p class="cs-hint">${esc(o.desc)}</p><div class="cs-btnrow">${o.choices.map((ch, ci) => `<button class="cs-btn" data-do="take" data-s="${si}" data-c="${ci}">Take ${ch.label}</button>`).join('')}</div></div>`).join('')}
        <p class="cs-hint">Packs are unpacked into their contents. Items "of your choice" are added by name; rename them in the list.</p>`, (act, b) => {
        if (act !== 'take') return;
        const ch = sets[Number(b.dataset.s)].choices[Number(b.dataset.c)];
        ch.items.forEach(x => addItem(x.ref, x.count, x.name));
        model.sheet.coins.gp = (model.sheet.coins.gp || 0) + ch.gp;
        commit();
        b.closest('.cs-card').remove();
        if (!dlg.querySelector('.cs-card')) closeDialog();
        toast(`Added ${ch.items.length} item${ch.items.length === 1 ? '' : 's'}${ch.gp ? ` and ${ch.gp} GP` : ''}`);
      });
    }

    // Add gear by name; packs are unpacked so each torch and ration can be tracked.
    function addItem(name, qty = 1, label) {
      const g = findGear(name);
      if (g && g.contents && /pack$/i.test(g.name)) { g.contents.forEach(c => addItem(c.name, c.count * qty)); return; }
      const nm = (g || findMagic(name)) ? (g || findMagic(name)).name : (label || name);
      const have = model.sheet.items.find(x => x.name.toLowerCase() === nm.toLowerCase() && !(g && ['weapon', 'armor', 'shield'].includes(g.kind)));
      if (have) { have.qty += qty; return; }
      const it = { id: uid(), name: label && !g ? label : nm, qty, equipped: false, attuned: false, bonus: 0, weight: null, notes: '' };
      if (g && (g.kind === 'weapon' || ((g.kind === 'armor' || g.kind === 'shield') && !model.sheet.items.some(x => x.equipped && (findGear(x.name) || {}).kind === g.kind)))) it.equipped = true;
      model.sheet.items.push(it);
    }

    // ---------- Autocomplete search (gear, spells, feats) ----------
    function search(kind, q) {
      q = q.trim().toLowerCase();
      if (!q && kind !== 'spell') return [];
      const has = (n) => n.toLowerCase().includes(q);
      if (kind === 'item') return [...DATA().equipment.filter(g => has(g.name)).map(g => ({ name: g.name, note: g.kind === 'weapon' ? `${g.dmg} ${g.dmgType}` : g.kind === 'armor' ? `AC ${g.ac}` : g.cost || g.kind })),
        ...DATA().magicItems.filter(m => has(m.name)).map(m => ({ name: m.name, note: `${m.homebrew ? '★ ' : ''}${m.rarity} ${String(m.type).toLowerCase()}` }))].slice(0, 30);
      if (kind === 'feat') return DATA().feats.filter(f => has(f.name)).map(f => ({ name: f.name, note: f.type.replace('-', ' ') + ' feat' })).slice(0, 30);
      const maxLv = Math.max(D.slots.length ? D.slots[D.slots.length - 1].level : 0, D.pact ? D.pact.level : 0) || 9;
      const mine = new Set(model.sheet.spells.map(x => x.name.toLowerCase()));
      return DATA().spells.filter(s => has(s.name) && !mine.has(s.name.toLowerCase()) && (spellFilter === 'all' || !D.spellClasses.length || (s.classes.some(c => D.spellClasses.includes(c)) && s.level <= maxLv)))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).slice(0, 40).map(s => ({ name: s.name, note: (s.homebrew ? '★ ' : '') + (s.level ? `${ord(s.level)} · ${s.school}` : `Cantrip · ${s.school}`) }));
    }
    function drawResults(input) {
      const box = input.parentElement.querySelector('.cs-acl'), kind = input.dataset.ac, q = input.value.trim();
      const hits = search(kind, input.value);
      box.innerHTML = hits.map(x => `<button data-act="pick" data-kind="${kind}" data-name="${esc(x.name)}"><span>${esc(x.name)}</span><small>${esc(x.note)}</small></button>`).join('')
        + (q && kind !== 'spell' && !hits.some(x => x.name.toLowerCase() === q.toLowerCase()) ? `<button data-act="pick" data-kind="${kind}" data-name="${esc(q)}" data-custom="1"><span>Add “${esc(q)}”</span><small>your own ${kind === 'feat' ? 'feature' : 'item'}</small></button>` : '')
        + (q && kind === 'spell' ? `<button data-act="pick" data-kind="spell" data-name="${esc(q)}" data-custom="1"><span>Add “${esc(q)}” as your own spell</span><small>type its level and text after</small></button>` : '');
    }
    function pick(kind, name, custom) {
      if (kind === 'item') { addItem(name); toast(`Added ${name}`); }
      if (kind === 'feat') { const f = findFeat(name); model.sheet.feats.push({ id: uid(), name: f ? f.name : name, desc: '', uses: 0, used: 0 }); }
      if (kind === 'spell') {
        const d = findSpell(name);
        if (d) model.sheet.spells.push({ id: uid(), name: d.name, prepared: d.level > 0, level: d.level, desc: '' });
        else if (custom) return customSpellDialog(name);
      }
      commit();
      const inp = root.querySelector(`.cs-ac[data-ac="${kind}"]`);
      if (inp) { inp.focus(); if (kind === 'spell') drawResults(inp); }
      if (kind === 'feat') { const f = D.features[D.features.length - 1]; if (f && f.custom && !f.desc) featureDialog(f); }
    }
    function customSpellDialog(name) {
      dialog(`<h3>New spell</h3><label class="cs-field"><span>Name</span><input data-k="name" value="${esc(name)}"></label>
        <label class="cs-field"><span>Level (0 = cantrip)</span><input data-k="level" type="number" inputmode="numeric" min="0" max="9" value="1"></label>
        <label class="cs-field"><span>What it does</span><textarea data-k="desc" rows="5"></textarea></label><button class="cs-btn primary" data-do="save">Add spell</button>`, (act, b, box) => {
        if (act !== 'save') return;
        const v = (k) => box.querySelector(`[data-k=${k}]`).value;
        model.sheet.spells.push({ id: uid(), name: v('name').slice(0, 80) || name, level: clamp(Math.round(Number(v('level')) || 0), 0, 9), prepared: true, desc: v('desc').slice(0, 6000) });
        commit(); closeDialog();
      });
    }

    function rest(kind) {
      const s = model.sheet;
      if (kind === 'long') {
        s.curHp = null; s.tempHp = 0; s.hdUsed = 0; s.slotsUsed = s.slotsUsed.map(() => 0); s.pactUsed = 0; s.resUsed = {}; s.feats.forEach(f => { f.used = 0; });
      } else {
        if (D.shortSlots) s.slotsUsed = s.slotsUsed.map(() => 0);
        s.pactUsed = 0;
        D.resources.forEach(r => { if (r.rest === 'short') s.resUsed[r.key] = 0; else if (r.rest === 'short1' && s.resUsed[r.key]) s.resUsed[r.key]--; });
      }
      commit();
      if (player) share({ kind: 'card', title: `${name || 'A player'} took a ${kind === 'long' ? 'Long' : 'Short'} Rest`, sub: kind === 'long' ? 'HP, spell slots and resources restored' : 'Short-rest resources restored', body: '' });
      toast(kind === 'long' ? 'Long Rest: everything is restored' : 'Short Rest taken');
    }

    // ---------- Events ----------
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t && root.contains(t)) { tab = t.dataset.tab; renderTabs(); renderBody(); return; }
      const b = e.target.closest('[data-act]');
      if (!b || !root.contains(b)) return;
      const act = b.dataset.act, s = model.sheet;
      if (act === 'edit') { edit = !edit; return render(); }
      if (act === 'roll') return rollDialog(b.dataset.label, num(b.dataset.bonus), b.dataset.nomod === '1', b.dataset.tag);
      if (act === 'damage') return share({ kind: 'damage', label: b.dataset.label, expr: b.dataset.expr });
      if (act === 'attack') return attackDialog(D.attacks[Number(b.dataset.i)]);
      if (act === 'hp') return hpDialog();
      if (act === 'ac') return acDialog();
      if (act === 'inspiration') { s.inspiration = !s.inspiration; return commit(); }
      if (act === 'level') { model.level = clamp(D.lvl + Number(b.dataset.d), 1, 20); return commit(); }
      if (act === 'save-prof') { s.saves = { ...D.saveProf, [b.dataset.a]: !D.saveProf[b.dataset.a] }; return commit(); }
      if (act === 'skill-prof') { const k = b.dataset.k; s.skills[k] = ((s.skills[k] || 0) + 1) % 3; if (!s.skills[k]) delete s.skills[k]; return commit(); }
      if (act === 'pip') {
        const max = b.closest('.cs-pips').children.length, i = Number(b.dataset.i);
        const cur = b.dataset.kind === 'slot' ? (s.slotsUsed[b.dataset.key - 1] || 0) : b.dataset.kind === 'pact' ? s.pactUsed : b.dataset.kind === 'feat' ? (s.feats.find(f => 'feat:' + f.id === b.dataset.key) || {}).used || 0 : (s.resUsed[b.dataset.key] || 0);
        // Tapping an available dot uses one; tapping a used dot gets one back.
        const next = i < max - cur ? cur + 1 : cur - 1;
        if (b.dataset.kind === 'slot') s.slotsUsed[b.dataset.key - 1] = clamp(next, 0, max);
        else if (b.dataset.kind === 'pact') s.pactUsed = clamp(next, 0, max);
        else if (b.dataset.kind === 'feat') { const f = s.feats.find(x => 'feat:' + x.id === b.dataset.key); if (f) f.used = clamp(next, 0, max); }
        else s.resUsed[b.dataset.key] = clamp(next, 0, max);
        return commit();
      }
      if (act === 'hitdie') {
        if (!D.hdNext) return;
        const r = rollDice(`1d${D.hdNext}${D.md.con ? sgn(D.md.con) : ''}`), gain = Math.max(0, r.total), max = D.maxHp ?? 9999;
        s.hdUsed++; s.curHp = Math.min(max, Math.max(0, D.hp ?? max) + gain); if (s.curHp >= max) s.curHp = null;
        commit(); toast(`Hit Point Die: regained ${gain} HP`);
        if (player) share({ kind: 'card', title: `${name || 'A player'} spent a Hit Point Die`, sub: `Rolled ${r.detail} and regained ${gain} HP`, body: '' });
        return;
      }
      if (act === 'rest') return rest(b.dataset.r);
      if (act === 'levelup') return levelUpDialog(0);
      if (act === 'add-multi') { s.multi = s.multi || []; s.multi.push({ id: uid(), cls: '', level: 1, subclass: '' }); return commit(); }
      if (act === 'del-multi') { s.multi = (s.multi || []).filter(x => x.id !== b.dataset.id); return commit(); }
      if (act === 'end-conc') { const was = s.conc; s.conc = ''; commit(); return share({ kind: 'card', tag: 'conc-end', title: `${name || 'A player'} stops concentrating`, sub: was, body: '' }); }
      if (act === 'add-attack') {
        const v = (id) => root.querySelector('#' + id).value.trim();
        if (!v('cs-atk-name')) return toast('Give the attack a name');
        if (v('cs-atk-dmg') && !validExpr(v('cs-atk-dmg'))) return toast('Write damage as dice, like 1d8+3');
        s.attacks.push({ id: uid(), name: v('cs-atk-name'), hit: Math.round(Number(v('cs-atk-hit')) || 0), dmg: v('cs-atk-dmg').replace(/\s+/g, ''), dmgType: v('cs-atk-type'), notes: '' });
        return commit();
      }
      if (act === 'del-attack') { s.attacks = s.attacks.filter(a => a.id !== b.dataset.id); return commit(); }
      if (act === 'spell') { const x = D.spells.find(y => y.id === b.dataset.id); return x && spellDialog(x); }
      if (act === 'prep') { const x = s.spells.find(y => y.id === b.dataset.id); if (x) x.prepared = !x.prepared; return commit(); }
      if (act === 'spellfilter') { spellFilter = b.dataset.v; renderBody(); const i = root.querySelector('.cs-ac[data-ac=spell]'); if (i) drawResults(i); return; }
      if (act === 'item') { const i = D.items.find(x => x.id === b.dataset.id); return i && itemDialog(i); }
      if (act === 'equip') { const it = s.items.find(x => x.id === b.dataset.id); if (it) { it.equipped = !it.equipped; if (it.equipped) unequipOthers(it); } return commit(); }
      if (act === 'qty') { const it = s.items.find(x => x.id === b.dataset.id); if (it) it.qty = Math.max(0, it.qty + Number(b.dataset.d)); return commit(); }
      if (act === 'starting') return startingDialog();
      if (act === 'feature') return featureDialog(D.features[Number(b.dataset.i)]);
      if (act === 'pick') return pick(b.dataset.kind, b.dataset.name, b.dataset.custom === '1');
    });
    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.act === 'auto') {
        const k = el.dataset.k, s = model.sheet;
        // Switching Auto off starts from the number that was showing.
        if (!el.checked) { if (k === 'ac') model.ac = D.autoAc; if (k === 'hp') model.hp = D.autoHp ?? model.hp; if (k === 'init') model.initBonus = D.autoInit; if (k === 'speed') s.speed = D.autoSpeed; }
        s.auto[k] = el.checked;
        return commit();
      }
      if (!el.dataset.f) return;
      const v = el.dataset.t === 'int' ? (el.value === '' ? null : Math.round(Number(el.value))) : el.value;
      const before = getPath(el.dataset.f);
      setPath(el.dataset.f, v);
      if (el.dataset.f === 'level') model.level = clamp(num(v, 1), 1, 20);
      // A newly picked background gives its two skill proficiencies.
      if (el.dataset.f === 'sheet.background' && v !== before) { const bg = byName(DATA().backgrounds, v); if (bg) bg.skills.forEach(k => { model.sheet.skills[k] = Math.max(1, model.sheet.skills[k] || 0); }); }
      if (el.dataset.f === 'cls') { const c = byName(DATA().classes, v); if (c) model.cls = c.name; }
      Object.assign(model, clean(model));
      commit();
    });
    root.addEventListener('input', (e) => { if (e.target.classList.contains('cs-ac')) drawResults(e.target); });
    root.addEventListener('focusin', (e) => { if (e.target.classList.contains('cs-ac')) drawResults(e.target); });
    root.addEventListener('focusout', () => setTimeout(() => { if (pending && !root.contains(document.activeElement)) { const p = pending; pending = null; api.set(p.model, p.live); } }, 50));

    const api = {
      // New data from outside (the DM app, or the player's phone). Waits while someone is typing in the sheet.
      set(m, l) {
        if (root.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) { pending = { model: m, live: l }; live = l; renderHead(); return; }
        model = prepare(m); live = l || null; name = (m && m.name) || name; render();
      },
      get: () => model,
      destroy() { closeDialog(); root.innerHTML = ''; },
    };
    render();
    return api;
  }

  // A printable character sheet: a complete HTML document for the DM app's print / save-as-PDF.
  function printHtml(input) {
    const m = prepare(input), name = input.name || 'Character', s = m.sheet, D = derive(m);
    const cls = D.parts.map(x => `${x.c ? x.c.name : x.name} ${x.lvl}${x.sub ? ` (${x.sub})` : ''}`).join(' / ');
    const row = (a, b) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`;
    const box = (title, html, cls = '') => `<section class="${cls}"><h2>${title}</h2>${html}</section>`;
    const lines = (t) => esc(t).replace(/\n/g, '<br>');
    const bySpellLevel = {};
    D.spells.forEach(x => (bySpellLevel[x.level] = bySpellLevel[x.level] || []).push(x));
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>
      @page { size: auto; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font: 10pt/1.35 Georgia, 'Times New Roman', serif; color: #1d1a16; margin: 0; }
      header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5pt solid #58180d; padding-bottom: 4pt; margin-bottom: 8pt; }
      h1 { font: 700 22pt/1 'Cinzel', Georgia, serif; margin: 0; color: #58180d; }
      .sub { font-size: 10.5pt; color: #444; text-align: right; }
      .grid { columns: 2; column-gap: 14pt; }
      section { break-inside: avoid; border: 1pt solid #c9b99a; border-radius: 5pt; padding: 5pt 7pt; margin: 0 0 8pt; }
      h2 { font: 700 9pt/1.2 sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #58180d; margin: 0 0 4pt; }
      table { width: 100%; border-collapse: collapse; } td { padding: 1.2pt 0; vertical-align: top; } td.n { text-align: right; font-weight: 700; white-space: nowrap; padding-left: 6pt; }
      .abil { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4pt; text-align: center; margin-bottom: 8pt; }
      .abil div { border: 1pt solid #c9b99a; border-radius: 5pt; padding: 3pt; } .abil b { display: block; font-size: 15pt; } .abil small { font-size: 7.5pt; text-transform: uppercase; color: #555; }
      .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4pt; text-align: center; margin-bottom: 8pt; }
      .stats div { border: 1pt solid #58180d; border-radius: 5pt; padding: 3pt; } .stats b { display: block; font-size: 13pt; } .stats small { font-size: 7pt; text-transform: uppercase; color: #555; }
      .feat { margin-bottom: 4pt; font-size: 8.5pt; } .feat b { font-size: 9pt; }
      .dot { font-family: sans-serif; }
      .muted { color: #666; font-size: 8.5pt; }
    </style></head><body>
    <header><h1>${esc(name)}</h1><div class="sub">Level ${D.lvl} ${esc(cls || m.cls)}<br>${esc([s.species + (s.subspecies ? ` (${s.subspecies})` : ''), s.background, s.alignment].filter(Boolean).join(' · '))}</div></header>
    <div class="abil">${AB.map(a => `<div><small>${AB_NAME[a]}</small><b>${sgn(D.md[a])}</b>${D.score[a]}</div>`).join('')}</div>
    <div class="stats"><div><small>Armor Class</small><b>${D.ac}</b></div><div><small>Hit Points</small><b>${D.maxHp ?? '—'}</b></div><div><small>Initiative</small><b>${sgn(D.init)}</b></div>
      <div><small>Speed</small><b>${D.speed} ft</b></div><div><small>Proficiency</small><b>${sgn(D.pb)}</b></div><div><small>Passive Perc.</small><b>${D.passive}</b></div></div>
    <div class="grid">
      ${box('Saving throws', `<table>${AB.map(a => row(`<span class="dot">${D.saveProf[a] ? '●' : '○'}</span> ${AB_NAME[a]}`, sgn(D.saves[a]))).join('')}</table>`)}
      ${box('Skills', `<table>${D.skills.map(k => row(`<span class="dot">${k.prof === 2 ? '◉' : k.prof ? '●' : '○'}</span> ${esc(k.name)} <span class="muted">${k.ab.toUpperCase()}</span>`, sgn(k.bonus))).join('')}</table>`)}
      ${box('Attacks', `<table>${D.attacks.map(a => row(`<b>${esc(a.name)}</b> <span class="muted">${esc(a.notes || '')}</span>`, `${sgn(a.hit)} · ${esc(a.dmg || '')} ${esc(a.dmgType || '')}`)).join('')}</table>`)}
      ${D.resources.length || D.extras.length ? box('Class resources', `<table>${D.resources.map(r => row(esc(r.label), '☐'.repeat(r.max))).join('')}${D.extras.map(x => row(esc(x.label), esc(x.value))).join('')}</table>`) : ''}
      ${box('Hit Point Dice', D.hdPool.map(p => `${p.count}d${p.die}`).join(' + '))}
      ${D.casting ? box('Spellcasting', `<p>${D.castings.length ? D.castings.map(x => `${esc(x.cls)}: <b>${x.ab.toUpperCase()}</b>, save DC <b>${x.dc}</b>, attack <b>${sgn(x.atk)}</b>`).join('<br>') : `${D.casting.ab.toUpperCase()}, save DC ${D.casting.dc}, attack ${sgn(D.casting.atk)}`}</p>
        ${D.slots.length ? `<p>Slots: ${D.slots.map(sl => `${ord(sl.level)} ${'☐'.repeat(sl.max)}`).join(' &nbsp; ')}${D.pact ? ` &nbsp; Pact (${ord(D.pact.level)}) ${'☐'.repeat(D.pact.max)}` : ''}</p>` : ''}
        ${Object.entries(bySpellLevel).map(([lv, list]) => `<p><b>${Number(lv) ? ord(Number(lv)) : 'Cantrips'}:</b> ${list.map(x => esc(x.name) + (x.level && x.prepared ? ' ●' : '')).join(', ')}</p>`).join('')}`) : ''}
      ${box('Equipment', `<p>${s.items.map(i => `${esc(i.name)}${i.qty !== 1 ? ` ×${i.qty}` : ''}${i.equipped ? ' (worn)' : ''}`).join(', ') || '—'}</p>
        <p>${COINS.filter(k => s.coins[k]).map(k => `${s.coins[k]} ${k.toUpperCase()}`).join(' · ') || ''}</p><p class="muted">${D.weight} / ${D.capacity} lb</p>`)}
      ${box('Proficiencies & languages', `<p>${esc([...(D.c ? D.c.profs : []), ...(D.bg ? D.bg.tools : []), s.profs].filter(Boolean).join(', '))}</p><p>${esc(s.languages || '')}</p>`)}
      ${BIO.some(([k]) => s.bio[k]) ? box('Who they are', BIO.filter(([k]) => s.bio[k]).map(([k, l]) => `<p><b>${l}.</b> ${lines(s.bio[k])}</p>`).join('')) : ''}
    </div>
    ${box('Features & traits', D.features.map(f => `<div class="feat"><b>${esc(f.name)}</b> <span class="muted">${esc(f.src)}${f.level ? ' ' + f.level : ''}</span><br>${fmt(f.desc || '')}</div>`).join(''), 'feats')}
    <p class="muted">Made with Dungeons Desk. Rules text from the System Reference Document 5.2 (CC-BY-4.0).</p>
    </body></html>`;
  }

  // One entry in the player feed (rolls and shared cards), as HTML. Used by the DM app and the phones.
  function feedHtml(e, who) {
    const head = who ? `<div class="cs-feed-who">${esc(who)}</div>` : '';
    if (e.kind === 'hp') return `${head}<div class="cs-feed-title">${e.heal ? '💚' : '💥'} ${esc(e.label)}</div>${e.applied ? '<div class="cs-feed-sub">Applied in the tracker</div>' : ''}`;
    if (e.kind === 'card') return `${head}<div class="cs-feed-title">${esc(e.title)}</div>${e.sub ? `<div class="cs-feed-sub">${esc(e.sub)}</div>` : ''}${e.body ? `<div class="cs-feed-body">${fmt(e.body)}</div>` : ''}${e.note ? `<div class="cs-feed-sub">${esc(e.note)}</div>` : ''}`;
    const note = e.note ? `<div class="cs-feed-sub">${esc(e.note)}</div>` : '';
    const flag = e.crit ? '<div class="cs-feed-flag crit">Natural 20!</div>' : e.fumble ? '<div class="cs-feed-flag">Natural 1</div>' : '';
    const mode = e.mode && e.mode !== 'normal' ? ` · ${e.mode === 'adv' ? 'advantage' : 'disadvantage'}` : '';
    return `${head}<div class="cs-feed-title">${esc(e.label)}${e.sub ? ` <small>${esc(e.sub)}</small>` : ''}</div>
      <div class="cs-feed-total${e.crit ? ' crit' : e.fumble ? ' fumble' : ''}">${esc(e.total)}${e.kind === 'damage' && e.dmgType ? ` <small>${esc(e.dmgType)}</small>` : ''}</div>
      <div class="cs-feed-detail">${e.manual ? 'Rolled on real dice' : esc(`${e.expr}: ${e.detail}`)}${esc(mode)}</div>${flag}
      ${e.dmg ? `<div class="cs-feed-dmg">Damage <b>${esc(e.dmg.total)}</b> ${esc(e.dmg.type)} <small>${esc(`${e.dmg.expr}: ${e.dmg.detail}`)}</small></div>` : ''}
      ${e.dmgExpr ? `<div class="cs-feed-dmg">Damage: ${esc(e.dmgExpr)} ${esc(e.dmgType || '')}</div>` : ''}${note}`;
  }

  // ---------- Character files (.ddchar.json) ----------
  // How a sheet moves between the phone's standalone sheet, a DM's party (Settings → 📜) and the Me tab in a game.
  function toFile(m) {
    const c = clean(m);
    return { format: 'dungeons-desk-character', version: 1, name: String((m && m.name) || '').slice(0, 60), exported: new Date().toISOString(), model: c };
  }
  function fromFile(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
    if (!data || data.format !== 'dungeons-desk-character' || !data.model) throw new Error('That isn\'t a Dungeons Desk character file.');
    return { name: String(data.name || '').slice(0, 60).trim(), model: applyAuto(clean(data.model)) };
  }
  const fileName = (name) => `${String(name || 'Character').replace(/[\\/:*?"<>|]/g, '').trim() || 'Character'}.ddchar.json`;

  return { mount, setHomebrew, printHtml, derive, clean, prepare, applyAuto, cleanShare, resolve, rollDice, feedHtml, fmt, toFile, fromFile, fileName };
})();
