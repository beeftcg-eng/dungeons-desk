// Characters from PDFs, for adding a player's character to a campaign (Settings → Party, a sheet's ⇩ Import, the
// phone's Me tab and the sheet app all take one). Two kinds work:
//  - Sheets printed from Dungeons Desk: CharSheet.printHtml() puts a share link (#c=…, the whole character file) on
//    the page, and Chromium keeps it in the PDF as a link, so the character comes back exactly.
//  - Fillable character sheets (D&D Beyond's PDF export, the official 5e sheet): their form fields are read and matched
//    to the sheet by name. Scores, class and level, species, background, skills, gear, attacks and spells come over;
//    AC and HP are kept as typed numbers if the sheet would work them out differently.
// No PDF library: a small reader for the parts of the format that hold those (objects, object streams, Flate).
// A scanned or flattened PDF has no text to read, and locked (encrypted) ones aren't supported.
window.PdfChar = (() => {
  // ---------- Reading the PDF ----------
  const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };
  const toBytes = (str) => Uint8Array.from(str, ch => ch.charCodeAt(0) & 255);
  // zlib inflate that keeps what it got when a stream has junk after its end (common in PDFs).
  async function inflate(str) {
    const out = [], reader = new Blob([toBytes(str)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); } } catch { /* keep what came out */ }
    let n = 0; out.forEach(c => { n += c.length; });
    const all = new Uint8Array(n); let o = 0; out.forEach(c => { all.set(c, o); o += c.length; });
    return latin1(all);
  }

  const WS = /[\x00\t\n\f\r ]/, DELIM = /[()<>[\]{}/%]/;
  // One PDF value at src[pos]: dict → plain object, array, {s: string}, {n: name}, {r: object number}, number, bool, null.
  function parseAt(src, pos) {
    const skip = () => { for (;;) { while (pos < src.length && WS.test(src[pos])) pos++; if (src[pos] === '%') { while (pos < src.length && src[pos] !== '\n' && src[pos] !== '\r') pos++; } else break; } };
    const word = () => { const st = pos; while (pos < src.length && !WS.test(src[pos]) && !DELIM.test(src[pos])) pos++; return src.slice(st, pos); };
    function value(depth) {
      if (depth > 60) throw new Error('too deep');
      skip();
      const ch = src[pos];
      if (ch === '<' && src[pos + 1] === '<') {
        pos += 2; const d = {};
        for (;;) {
          skip();
          if (src[pos] === '>' && src[pos + 1] === '>') { pos += 2; return d; }
          if (pos >= src.length) return d;
          if (src[pos] !== '/') { value(depth + 1); continue; }
          pos++; const k = name(word());
          d[k] = value(depth + 1);
        }
      }
      if (ch === '[') { pos++; const a = []; for (;;) { skip(); if (src[pos] === ']') { pos++; return a; } if (pos >= src.length) return a; a.push(value(depth + 1)); } }
      if (ch === '(') return { s: literal() };
      if (ch === '<') { pos++; const st = pos; while (pos < src.length && src[pos] !== '>') pos++; let h = src.slice(st, pos++).replace(/[^0-9a-fA-F]/g, ''); if (h.length % 2) h += '0'; return { s: h.replace(/../g, x => String.fromCharCode(parseInt(x, 16))) }; }
      if (ch === '/') { pos++; return { n: name(word()) }; }
      const w = word();
      if (!w) { pos++; return null; }
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
        // "12 0 R" is a reference to object 12.
        const save = pos; skip(); const g = word(); skip();
        if (/^\d+$/.test(w) && /^\d+$/.test(g) && src[pos] === 'R' && (pos + 1 >= src.length || WS.test(src[pos + 1]) || DELIM.test(src[pos + 1]))) { pos++; return { r: Number(w) }; }
        pos = save; return Number(w);
      }
      return w === 'true' ? true : w === 'false' ? false : null;
    }
    function literal() {
      pos++; let out = '', depth = 1;
      while (pos < src.length) {
        const c = src[pos++];
        if (c === '\\') {
          const e = src[pos++];
          if (/[0-7]/.test(e)) { let o = e; while (o.length < 3 && /[0-7]/.test(src[pos])) o += src[pos++]; out += String.fromCharCode(parseInt(o, 8) & 255); }
          else if (e === '\r') { if (src[pos] === '\n') pos++; }
          else if (e !== '\n') out += { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[e] ?? e;
        } else if (c === '(') { depth++; out += c; }
        else if (c === ')') { if (!--depth) break; out += c; }
        else out += c;
      }
      return out;
    }
    const name = (w) => w.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const v = value(0);
    return { v, pos };
  }
  // PDF text strings: UTF-16 with a byte-order mark, or (near enough) Latin-1.
  function text(x) {
    if (x == null) return '';
    if (typeof x === 'number') return String(x);
    if (x.n != null) return x.n === 'Off' ? '' : x.n;
    const s = x.s; if (s == null) return '';
    if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) { let o = ''; for (let i = 2; i + 1 < s.length; i += 2) o += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1)); return o; }
    if (s.charCodeAt(0) === 0xef && s.charCodeAt(1) === 0xbb && s.charCodeAt(2) === 0xbf) { try { return new TextDecoder().decode(toBytes(s.slice(3))); } catch { return s.slice(3); } }
    return s;
  }

  // Every object in the file, including those packed into compressed object streams.
  async function objects(src) {
    const objs = new Map(), streams = [];
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(src))) {
      let p;
      try { p = parseAt(src, m.index + m[0].length); } catch { continue; }
      const entry = { v: p.v };
      let after = p.pos; while (WS.test(src[after] || '')) after++;
      if (src.startsWith('stream', after)) {
        let st = after + 6; if (src[st] === '\r') st++; if (src[st] === '\n') st++;
        const len = p.v && typeof p.v.Length === 'number' ? p.v.Length : -1;
        // Trust /Length when "endstream" follows it; otherwise look for "endstream".
        let end = len >= 0 && /^\s*endstream/.test(src.slice(st + len, st + len + 30)) ? st + len : src.indexOf('endstream', st);
        if (end < 0) end = src.length;
        entry.raw = src.slice(st, end);
        streams.push(entry);
        re.lastIndex = end;
      } else re.lastIndex = p.pos;
      objs.set(Number(m[1]), entry);
    }
    const filters = (d) => { const f = d && d.Filter; return (Array.isArray(f) ? f : f ? [f] : []).map(x => x && x.n); };
    for (const e of streams) {
      const d = e.v; if (!d || !d.Type || d.Type.n !== 'ObjStm') continue;
      const fl = filters(d);
      if (fl.some(f => f !== 'FlateDecode') || d.DecodeParms) continue;
      const data = fl.length ? await inflate(e.raw) : e.raw, first = Number(d.First) || 0, n = Number(d.N) || 0;
      const head = data.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < n && i * 2 + 1 < head.length; i++) {
        if (objs.has(head[i * 2])) continue;
        try { objs.set(head[i * 2], { v: parseAt(data, first + head[i * 2 + 1]).v }); } catch { /* skip a broken one */ }
      }
    }
    return objs;
  }

  // The form's fields as { "Full.Name": "value" }, and any link to a Dungeons Desk character.
  async function readPdf(bytes) {
    const src = latin1(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (!src.startsWith('%PDF')) throw new Error('That isn\'t a PDF file.');
    if (/\/Encrypt\s*\d+\s+\d+\s+R|\/Encrypt\s*<</.test(src)) throw new Error('This PDF is locked (encrypted), so it can\'t be read. Save it again without a password.');
    const objs = await objects(src), fields = {}, links = [];
    const get = (x) => x && x.r != null ? (objs.get(x.r) || {}).v : x;
    const fullName = (d) => { const parts = []; let cur = d, n = 0; while (cur && n++ < 20) { if (cur.T) parts.unshift(text(get(cur.T))); cur = get(cur.Parent); } return parts.join('.'); };
    const seen = new Set();
    const walk = (x, depth) => {
      if (!x || typeof x !== 'object' || depth > 30 || seen.has(x)) return;
      seen.add(x);
      if (Array.isArray(x)) return x.forEach(y => walk(y, depth + 1));
      if (x.URI) { const u = text(get(x.URI)); if (/[#&]c=/.test(u)) links.push(u); }
      if (x.T && x.V !== undefined) {
        const v = get(x.V), name = fullName(x);
        const t = Array.isArray(v) ? v.map(y => text(get(y))).join('\n') : text(v);
        if (name && !(name in fields && fields[name])) fields[name] = t.replace(/\r\n?/g, '\n').trim();
      }
      for (const k in x) if (k !== 'Parent' && k !== 'P') walk(x[k], depth + 1);
    };
    objs.forEach(o => walk(o.v, 0));
    return { fields, links };
  }

  // ---------- Matching form fields to the character sheet ----------
  const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
  const int = (v) => { const m = /[+-]?\s*\d+/.exec(String(v || '').replace(/−/g, '-')); return m ? Number(m[0].replace(/\s/g, '')) : null; };
  const BOX_SAVES = { str: 11, dex: 18, con: 19, int: 20, wis: 21, cha: 22 };  // the official sheet's proficiency boxes
  const yes = (v) => /^(yes|on|true|x|p|e|1|●|•|✓)$/i.test(String(v || '').trim());

  function fromFields(raw, fileName) {
    const CS = window.CharSheet, D = CS.data(), AB = CS.AB, AB_NAME = CS.AB_NAME;
    const byName = (list, n) => (list || []).find(x => x.name.toLowerCase() === String(n || '').trim().toLowerCase()) || null;
    const F = new Map();
    // Each field by its own name ("form.page1.STR" → "str") and by its full name, so nested names still match.
    Object.entries(raw).forEach(([k, v]) => new Set([norm(k.split('.').pop()), norm(k)]).forEach(n => { if (n && (!F.get(n) || !F.has(n))) F.set(n, String(v || '')); }));
    const get = (...keys) => { for (const k of keys) { const v = F.get(k); if (v) return v.trim(); } return ''; };
    const keys = (re) => [...F.keys()].filter(k => re.test(k)).sort((a, b) => (int(a.replace(/\D+/g, ' ')) || 0) - (int(b.replace(/\D+/g, ' ')) || 0));
    const found = [];
    const m = { cls: '', level: 1, sheet: { abilities: {}, skills: {}, items: [], attacks: [], spells: [], feats: [], coins: {}, bio: {}, auto: { ac: true, hp: true, init: true, speed: true } } };
    const s = m.sheet;

    // Class and level: "Fighter 3", "Rogue (Thief) 5 / Wizard 2", "Level 4 Cleric".
    const classText = get('classlevel', 'classandlevel', 'class', 'classlevel1', 'classes');
    const parts = D.classes.map(c => ({ c, i: classText.search(new RegExp(`\\b${c.name}\\b`, 'i')) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i);
    parts.forEach((x, k) => {
      const seg = classText.slice(x.i, k + 1 < parts.length ? parts[k + 1].i : undefined);
      x.lvl = int(seg.slice(x.c.name.length).replace(/\([^)]*\)/g, '')) || null;
      x.sub = (x.c.subclasses.find(sc => classText.toLowerCase().includes(sc.name.toLowerCase()) || classText.toLowerCase().includes(sc.name.replace(/^(Path|College|Oath|Circle|Way|Warrior|School|College) of (the )?/i, '').toLowerCase())) || {}).name || '';
    });
    const typedLevel = int(get('level', 'totallevel', 'characterlevel'));
    if (parts.length) {
      const total = parts.reduce((t, x) => t + (x.lvl || 0), 0) || typedLevel || int(classText) || 1;
      m.cls = parts[0].c.name; s.subclass = parts[0].sub; m.level = Math.min(20, Math.max(1, total));
      s.multi = parts.slice(1).map(x => ({ cls: x.c.name, level: x.lvl || 1, subclass: x.sub }));
      found.push('class');
    } else if (classText) { m.cls = classText.replace(/\d+/g, '').trim().slice(0, 40); m.level = int(classText) || typedLevel || 1; }

    // Species (with lineage) and background: matched to the rules when they can be, kept as typed when not.
    const race = get('race', 'species', 'racespecies', 'speciesrace', 'racelineage');
    const sp = [...D.species].sort((a, b) => b.name.length - a.name.length).find(x => new RegExp(`\\b${x.name}\\b`, 'i').test(race));
    if (sp) {
      s.species = sp.name; found.push('species');
      const lr = norm(race);
      const sub = sp.subspecies.find(x => { const n = norm(x.name.replace(/\b(lineage|legacy|draconic ancestor|ancestry)\b/gi, '')); return n && lr.includes(n); });
      if (sub) s.subspecies = sub.name;
    } else s.species = race;
    const bgText = get('background', 'backgroundname');
    const bg = D.backgrounds.find(x => new RegExp(`\\b${x.name}\\b`, 'i').test(bgText));
    s.background = bg ? bg.name : bgText;
    const align = get('alignment');
    s.alignment = CS.ALIGN.find(a => a.toLowerCase() === align.toLowerCase()) || align;
    s.xp = int(get('xp', 'experiencepoints', 'experience').replace(/[,.\s]/g, '')) || 0;

    // Ability scores: the big number, not the modifier.
    AB.forEach(a => {
      const t = get(a, AB_NAME[a].toLowerCase(), a + 'score', AB_NAME[a].toLowerCase() + 'score'), v = /^\s*[+−-]/.test(t) ? null : int(t);
      if (v != null && v >= 1 && v <= 30) { s.abilities[a] = v; found.push(a); }
    });
    const md = Object.fromEntries(AB.map(a => [a, Math.floor(((s.abilities[a] || 10) - 10) / 2)]));
    const pb = int(get('profbonus', 'proficiencybonus', 'proficiency')) || Math.ceil(m.level / 4) + 1;

    // Proficiencies: a marker field when there is one ("AcrobaticsProf": P or E), else the bonus written next to it
    // (bonus − modifier = proficiency bonus, or twice it for expertise), else the official sheet's checkboxes.
    const profFrom = (bonus, ab) => { if (bonus == null) return null; const d = bonus - md[ab]; return d >= 2 * pb ? 2 : d >= pb ? 1 : 0; };
    const saves = {}; let anySave = false;
    AB.forEach(a => {
      const full = AB_NAME[a].toLowerCase(), mark = get('st' + full + 'prof', a + 'saveprof', full + 'saveprof', 'st' + a + 'prof');
      let p = mark ? (yes(mark) ? 1 : 0) : profFrom(int(get('st' + full, full + 'save', a + 'save', 'savingthrow' + full)), a);
      if (p == null && F.has('checkbox' + BOX_SAVES[a])) p = yes(F.get('checkbox' + BOX_SAVES[a])) ? 1 : 0;
      if (p != null) { saves[a] = p > 0; anySave = true; }
    });
    if (anySave) s.saves = Object.fromEntries(AB.map(a => [a, !!saves[a]]));
    Object.entries(D.skills).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, ab], i) => {
      const n = norm(name), key = F.has(n) ? n : [...F.keys()].find(k => k.length >= 6 && n.startsWith(k) && !F.has(n));
      const mark = get(n + 'prof', n + 'proficiency');
      let p = mark ? (/^e/i.test(mark) ? 2 : yes(mark) ? 1 : 0) : key ? profFrom(int(F.get(key)), ab) : null;
      if (p == null && F.has('checkbox' + (23 + i))) p = yes(F.get('checkbox' + (23 + i))) ? 1 : 0;
      if (p) s.skills[name] = p;
    });

    // Numbers the sheet can work out itself, kept by hand only if they differ (checked below).
    const ac = int(get('ac', 'armorclass', 'armourclass'));
    const hp = int(get('hpmax', 'maxhp', 'hitpointmaximum', 'maxhitpoints', 'hitpointsmax'));
    const cur = int(get('hpcurrent', 'currenthp', 'currenthitpoints'));
    const init = int(get('initiative', 'init'));
    const speed = int(get('speed', 'walkingspeed'));
    s.tempHp = int(get('hptemp', 'temphp', 'temporaryhitpoints')) || 0;
    ['cp', 'sp', 'ep', 'gp', 'pp'].forEach(k => { const v = int(get(k)); if (v) s.coins[k] = v; });

    // Gear: one item per line (or per row of an equipment table), matched to the rules' items when the name fits.
    const addLine = (line, qty) => {
      let t = line.replace(/^[\s•*\-–·]+/, '').trim(); if (!t || t.length > 80) return;
      let q = qty || 1, mm;
      if ((mm = /^(\d+)\s*[x×]?\s+(.+)$/i.exec(t))) { q = Number(mm[1]); t = mm[2]; }
      else if ((mm = /^(.+?)\s*(?:[x×]\s*(\d+)|\((\d+)\))$/i.exec(t))) { q = Number(mm[2] || mm[3]); t = mm[1]; }
      const known = CS.data().equipment.concat(CS.data().magicItems);
      const hit = byName(known, t) || byName(known, t.replace(/s$/i, '')) || byName(known, t.replace(/es$/i, ''));
      CS.addItemTo(m, hit ? hit.name : t, Math.max(1, Math.min(9999, q)), hit ? undefined : t);
    };
    const rows = keys(/^eqname\d+$/);
    rows.forEach(k => { const n = F.get(k); if (n) addLine(n, int(get(k.replace('name', 'qty'))) || 1); });
    const eqText = [get('equipment', 'equipment1', 'inventory', 'gear'), ...keys(/^equipment\d+$/).filter(k => k !== 'equipment1').map(k => F.get(k))].filter(Boolean).join('\n');
    if (!rows.length && eqText) eqText.split(/\n|;|,(?![^(]*\))/).forEach(l => addLine(l));
    if (s.items.length) found.push('gear');

    // Attacks: weapons the rules know become gear (the sheet works out their attacks); anything else stays as typed.
    keys(/^wpnname\d*$/).forEach(k => {
      const nm = (F.get(k) || '').trim(), i = k.replace('wpnname', '') || '1';
      if (!nm) return;
      const g = byName(CS.data().equipment, nm);
      if (g && g.kind === 'weapon') { if (!s.items.some(x => x.name === g.name)) CS.addItemTo(m, g.name, 1); return; }
      const dmgText = get(`wpn${i}damage`), dm = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([a-z]*)/i.exec(dmgText);
      s.attacks.push({ name: nm.slice(0, 60), hit: int(get(`wpn${i}atkbonus`, `wpn${i}attackbonus`)) || 0, dmg: dm ? dm[1].replace(/\s+/g, '') : '', dmgType: dm && dm[2] ? dm[2][0].toUpperCase() + dm[2].slice(1).toLowerCase() : '', notes: dm ? '' : dmgText.slice(0, 300) });
    });

    // Spells: any spell-ish field whose text is a spell the rules know.
    const spellKeys = [...F.keys()].filter(k => /spell|cantrip/.test(k) && !/(ability|savedc|atkbonus|attack|slots?|class|level|dc$|prepared|source|range|time|duration|components|notes|header)/.test(k));
    const have = new Set();
    spellKeys.forEach(k => (F.get(k) || '').split(/\n|,|;/).forEach(line => {
      const n = line.replace(/\[[^\]]*\]|\([^)]*\)|[*†•●○◉]/g, '').replace(/\s+/g, ' ').trim();
      const d = byName(CS.data().spells, n);
      if (d && !have.has(d.name)) { have.add(d.name); s.spells.push({ name: d.name, level: d.level, prepared: d.level > 0, desc: '' }); }
    }));
    if (s.spells.length) found.push('spells');

    // Words: proficiencies, languages, personality and backstory, features (kept as one note so nothing is lost).
    s.profs = get('proficiencieslang', 'proficienciesandlanguages', 'otherproficienciesandlanguages', 'otherproficiencieslanguages', 'proficiencies');
    s.languages = get('languages');
    s.bio = { personality: get('personalitytraits', 'personality', 'traits'), ideals: get('ideals'), bonds: get('bonds'), flaws: get('flaws'),
      backstory: get('backstory', 'characterbackstory'), appearance: get('appearance') || ['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map(k => get(k) ? `${k[0].toUpperCase() + k.slice(1)}: ${get(k)}` : '').filter(Boolean).join(' · ') };
    const feats = [get('featuresandtraits', 'featurestraits', 'features', 'featuresandtraits1', 'featurestraits1'), ...keys(/^(featuresandtraits|featurestraits|additionalfeaturestraits|feattraits|features)\d+$/).map(k => F.get(k)), get('feattraits', 'additionalfeaturesandtraits')]
      .filter((v, i, a) => v && a.indexOf(v) === i).join('\n\n');
    for (let i = 0; i < feats.length && i < 24000; i += 6000) s.feats.push({ name: i ? 'From the PDF (continued)' : 'From the PDF', desc: feats.slice(i, i + 6000), uses: 0, used: 0 });

    if (!found.length && !m.cls) throw new Error('No character found in this PDF\'s form. PDFs from D&D Beyond, the official fillable sheet and Dungeons Desk work.');

    // AC, HP, initiative and speed: worked out by the sheet unless the PDF says something else.
    let out = CS.applyAuto(CS.clean(m));
    const X = CS.derive(out);
    if (ac != null && ac !== X.autoAc) { out.sheet.auto.ac = false; out.ac = ac; }
    if (hp != null && hp !== X.autoHp) { out.sheet.auto.hp = false; out.hp = hp; }
    if (init != null && init !== X.autoInit) { out.sheet.auto.init = false; out.initBonus = init; }
    if (speed != null && speed !== X.autoSpeed) { out.sheet.auto.speed = false; out.sheet.speed = speed; }
    if (cur != null && hp != null && cur < hp) out.sheet.curHp = cur;
    out = CS.applyAuto(CS.clean(out));
    const name = get('charactername', 'charactername2', 'name', 'character', 'pcname') || String(fileName || '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    return { name: name.slice(0, 60), model: out, from: 'form' };
  }

  // A PDF → { name, model, from: 'dungeons-desk' | 'form' }.
  async function read(bytes, fileName) {
    const { fields, links } = await readPdf(bytes);
    for (const l of links) { try { const c = await window.CharSheet.fromLink(l); if (c) return { ...c, from: 'dungeons-desk' }; } catch { /* try the form */ } }
    if (!Object.keys(fields).length) throw new Error('This PDF has no character to read: it\'s a picture of a sheet, not a form. PDFs from D&D Beyond, the official fillable sheet and Dungeons Desk work.');
    return fromFields(fields, fileName);
  }
  return { read, readPdf, fromFields };
})();
