// Import → 📕 Book PDF: monsters, spells and magic items from a book PDF the DM owns, saved as homebrew notes in
// their own campaign (never into the app). pdf.js (renderer/vendor/pdfjs, Apache-2.0) reads the text; it's loaded
// only when this tab is used, with its worker as a plain script so it runs without a Worker (file:// can't start one).
// Book PDFs are often scans with OCR text, so the text is cleaned up before Importer's paste parsers read it:
//  - lines are rebuilt from where each word sits on the page (column, then top to bottom), not the stream order;
//  - letters OCR read in numbers (l/I → 1, o → 0) and mangled stat block words ("Multiattock", "AcrroNs") are fixed;
//  - names are matched against the SRD and the words on the same page ("Gnrll" → "Grell").
// Every entry gets a preview and warnings for what looked wrong, and nothing is saved until the DM picks it.
window.BookImport = (() => {
  // ---------- Small text helpers ----------
  function lev(a, b, max = 9) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // The same distance where letters this kind of OCR often swaps cost half (r/i, n/h, x/k…). For names.
  const CONF = new Set(['ri', 'rt', 'nh', 'xh', 'xk', 'ua', 'oa', 'cg', 'ce', 'li', 'il', 'rn', 'nr', 'ae', 'eo', 'tf', 'ln', 'ul', 'vy', 'cr', 'ec'].flatMap(p => [p, p[1] + p[0]]));
  function ocrDist(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : CONF.has(a[i - 1] + b[j - 1]) ? 0.5 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  const title = (s) => s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\b(Of|The|And|Or|In|On|To|A|An|With|From|For)\b(?!$)/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase());
  const letters = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

  // ---------- Lines from a page's words ----------
  // items: pdf.js text items. Words go to the left or right column by where they start, then into lines by height.
  function pageLines(items, width, page) {
    const words = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || Math.abs(i.transform[0]) || 10, w: i.width || 0 }));
    const out = [];
    [0, 1].forEach(col => {
      const ws = words.filter(w => (w.x < width / 2) === (col === 0)).sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      ws.forEach(w => {
        const l = lines.find(x => Math.abs(x.y - w.y) <= Math.max(2.5, Math.min(x.h, w.h) * 0.35));
        if (l) { l.ws.push(w); l.h = Math.max(l.h, w.h); } else lines.push({ y: w.y, h: w.h, ws: [w] });
      });
      lines.sort((a, b) => b.y - a.y).forEach(l => {
        l.ws.sort((a, b) => a.x - b.x);
        let t = '';
        l.ws.forEach((w, i) => { const p = l.ws[i - 1]; t += (i && (w.x - (p.x + p.w) > w.h * 0.12 || !p.w) && !/\s$/.test(t) && !/^\s/.test(w.s) ? ' ' : '') + w.s; });
        out.push({ page, col, y: l.y, h: l.h, t: t.replace(/\s+/g, ' ').trim() });
      });
    });
    return out.filter(l => l.t);
  }

  // ---------- OCR clean-up ----------
  // Letters read inside numbers, stray quotes before numbers, odd dashes.
  function fixNumbers(s) {
    s = s.replace(/\b[lI1|]nitiative\b/g, 'Initiative')
      .replace(/^(CR|Challenge)\s*['’]?([\dlIoO|/]{1,4})(?=\s|\(|$)/, (m, k, n) => `${k} ${n.replace(/[lI|]/g, '1').replace(/[oO]/g, '0')}`);
    if (/^(?:AC|HP|A[a-z]{3,5}\s+C[a-z]{3,4}|H[a-z]{1,2}\s+P[a-z]{4,6})(?=[\s\d'’]|$)/.test(s)) s = fixStatLine(s);
    return s.replace(/[–−—]/g, '-')
      .replace(/(^|[\s(;,])'(?=\d)/g, '$1')
      .replace(/\(\.(\d)/g, '($1')
      .replace(/([+-]\s?)[lI|!](?![a-z])/g, '$11')
      .replace(/(^|[\s(+-])\](?=\d)/g, '$11').replace(/\b[lI|](?=\d)/g, '1').replace(/(\d)[lI|](?![a-z])/g, '$11')
      .replace(/\b(?:ll|lI|Il|II)\b(?=\s*(?:[-+(]|ft|$))/g, '11')
      .replace(/(\d)[oO](?![a-z])/g, '$10').replace(/\b[oO](?=\d)/g, '0')
      .replace(/\bd[lI|]([0oO]{1,2})\b/g, (m, z) => 'd1' + z.replace(/[oO]/g, '0'))
      .replace(/\b[\dlI|]{0,2}d[\dlIoO|]{1,3}\b/g, (m) => /\d/.test(m) ? m.replace(/[lI|]/g, '1').replace(/[oO]/g, '0') : m)
      .replace(/\bD ?C\s*[lI|]?\s?(\d{1,2})\b/g, (m, n) => 'DC ' + (/[lI|]/.test(m) ? '1' : '') + n)
      .replace(/(^|[\s(;,])'(?=\d)/g, '$1')
      .replace(/\b(?:Uit|Hlt|Hil|Hii|Htt|Ht|Hit)\s*:\s*/g, 'Hit: ');
  }
  // AC, HP and initiative lines hold only numbers, so letters there are digits: r t l I ] → 1, s → 5, a → 4, o → 0
  // ("HP ls0 (20d10 + a0)" → "HP 150 (20d10 + 40)", "+a (la)" → "+4 (14)").
  const STAT_DIGIT = { r: '1', t: '1', l: '1', I: '1', '|': '1', ']': '1', '!': '1', s: '5', S: '5', a: '4', o: '0', O: '0' };
  function fixStatLine(s) {
    return s.replace(/(^|[\s(+\-'’])([\drstlaIoOS\]|!']{1,4})(?=$|[\s)+\-;,d])/g, (m, pre, tok) => {
      const t = tok.replace(/['’]/g, '');
      if (!t || (!/\d/.test(t) && !/[+\-(]$/.test(pre.trim() || pre) && pre !== ' ')) return m;
      if (!/\d/.test(t) && !/[+\-(]/.test(pre)) return m;                         // a word ("or", "as"), not a number
      return pre + t.replace(/[rstlaIoOS\]|!]/g, c => STAT_DIGIT[c]);
    }).replace(/\b(\d+)d([\drstlaIoOS\]|!']{1,3})\b/g, (m, n, d) => n + 'd' + d.replace(/['’]/g, '').replace(/[rstlaIoOS\]|!]/g, c => STAT_DIGIT[c]))
      .replace(/\b([rstlaIoOS\]|!']{1,2})d(\d{1,3})\b/g, (m, n, d) => n.replace(/['’]/g, '').replace(/[rstlaIoOS\]|!]/g, c => STAT_DIGIT[c]) + 'd' + d)
      .replace(/^(AC|HP)['’]?(?=\d)/, '$1 ').replace(/^(AC|HP)\s+(?=\d)/, '$1 ');
  }
  // OCR that spaced out a word's letters ("Pa ralyzi ng Te nta cles"). Only on lines that are mostly fragments, so
  // ordinary text ("half damage") is left alone.
  const COMMON = new Set('a an the is it its of to in on at or and as be by if has can for not but are was one two any all its you your each with that this from have they them then than when also into only more once upon onto end its'.split(' '));
  function unspace(t) {
    const toks = t.split(' '), frag = (w) => /^[A-Za-z]{1,4}[.,:;]?$/.test(w) && !COMMON.has(w.toLowerCase().replace(/[.,:;]$/, ''));
    if (toks.length < 5 || toks.filter(frag).length / toks.length < 0.45) return t;
    const out = [toks[0]];
    for (let i = 1; i < toks.length; i++) {
      const a = out[out.length - 1], b = toks[i];
      if (/[A-Za-z]$/.test(a) && /^[a-z]/.test(b) && (frag(a) || frag(b) || /^[A-Z][a-z]*$/.test(a) && a.length <= 6) && !COMMON.has(b.toLowerCase()) && !COMMON.has(a.toLowerCase())) out[out.length - 1] = a + b;
      else out.push(b);
    }
    return out.join(' ');
  }
  // Lone marks the scan left in a line ("ü immunities", "F") go.
  const tidy = (t) => t.replace(/^(?:[^A-Za-z0-9(*+-]+|[A-Za-zü] (?=[A-Za-z]{4}))\s*/, '')
    .replace(/\bI (?=(?:minute|hour|day|round|turn|foot|mile|week)\b)/g, '1 ')
    .replace(STRAY, '$1 ').trim();
  // A lone letter between words: specks of the page's art the scan read as text ("at the F end").
  const STRAY = /([a-z,]) (?:[B-HJ-Z]|[b-z]) (?=[a-z])/g;
  const fixText = (t) => fixWords(t).replace(STRAY, '$1 ');
  // Words every stat block, spell or item uses: an OCR'd word one or two letters away from one of these is that word.
  const VOCAB = ['Multiattack', 'Melee', 'Ranged', 'Attack', 'Roll', 'Hit', 'Miss', 'Failure', 'Success', 'Saving', 'Throw', 'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
    'Piercing', 'Slashing', 'Bludgeoning', 'Acid', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Poison', 'Psychic', 'Radiant', 'Thunder', 'damage', 'reach', 'range',
    'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
    'condition', 'creature', 'target', 'escape', 'Recharge', 'Legendary', 'Resistance', 'Immunities', 'Resistances', 'Vulnerabilities', 'Senses', 'Languages', 'Darkvision', 'Blindsight', 'Tremorsense', 'Truesight',
    'Passive', 'Perception', 'Stealth', 'Initiative', 'Spellcasting', 'Casting', 'Components', 'Duration', 'Concentration', 'attunement', 'Wondrous',
    // Real words close to the ones above, so they're left alone.
    'Ranger', 'Wizard', 'Sorcerer', 'Warlock', 'Paladin', 'Barbarian', 'Cleric', 'Fighter', 'charged', 'changed', 'creatures', 'ranges'];
  const VOCAB_L = VOCAB.filter(v => v.length >= 6).map(v => [v, v.toLowerCase()]);
  // Only words of six letters or more, one letter off (two for long words), and never another form of the same word
  // ("attacks" stays). A different first letter is allowed only in long words ("Crappled" → "Grappled").
  function fixWords(s) {
    return s.replace(/[A-Za-z][A-Za-z']{5,}/g, (w) => {
      const lw = w.toLowerCase(), max = w.length >= 8 ? 2 : 1;
      let best = null, bd = max + 1;
      for (const [v, lv] of VOCAB_L) {
        if (lv === lw || lw.startsWith(lv) || lv.startsWith(lw)) return w;
        if (Math.abs(lv.length - lw.length) > max || (lv[0] !== lw[0] && lw.length < 8)) continue;
        const d = lev(lw, lv, max); if (d < bd && (lv[0] === lw[0] || d === 1)) { bd = d; best = v; }
      }
      if (!best) return w;
      return /^[A-Z]/.test(w) ? best[0].toUpperCase() + best.slice(1) : best.toLowerCase();
    });
  }
  // Section headings in stat blocks, whatever the OCR made of them ("AcrroNs", "TRerrs").
  const SECTIONS = ['Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions', 'Lair Actions', 'Mythic Actions'];
  function heading(t) {
    if (t.length > 22 || /[.:\d]/.test(t)) return null;
    const lt = letters(t);
    let best = null, bd = 99;
    SECTIONS.forEach(s => { const d = ocrDist(lt, letters(s)); if (d < bd) { bd = d; best = s; } });
    return best && bd <= letters(best).length * 0.45 ? best : null;
  }

  // ---------- Finding entries ----------
  const AC_RE = /^(?:AC|A[a-z]{3,5}\s+C[a-z]{3,4})\s*\d{1,2}\b/;
  const HP_RE = /^(?:HP|H[a-z]{1,2}\s+P[a-z]{4,6})\b/;
  const ITEM_RE = /^(armor|weapon|wondrous\s*item|potion|ring|rod|scroll|staff|wand|shield|ammunition)\b[^,]{0,70},\s*(common|uncommon|rare|very\s*rare|legendary|artifact|rarity\s*varies)\b/i;
  const SPELL_RE = /^(level\s+\d\s+[a-z]+|[a-z]+\s+cantrip|\d(st|nd|rd|th)[- ]level\s+[a-z]+)/i;
  const short = (l) => l && l.t.length <= 48 && !/[.;:]$/.test(l.t);

  // Abilities, rewritten so Importer.parseMonster reads them: 2024 tables ("Srn 15 +2 +2", rows Str Dex Con / Int Wis Cha)
  // are named by row and first letter; a 2014 row of six "15 (+2)" gets its labels back.
  function fixAbilities(lines) {
    let row = 0;
    return lines.map(t => {
      const six = [...t.matchAll(/(\d{1,2})\s*\(\s*([+-]?\d+)\s*\)/g)];
      if (six.length === 6) return ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((k, i) => `${k} ${six[i][1]} (${six[i][2]})`).join(' ');
      const re = /(?:^|\s)([A-Za-z]{2,4})[^\w\s+-]?\s*(\d{1,2})\s+([+-]\d{1,2})\s+([+-]\d{1,2})(?=\s|$)/g, cells = [...t.matchAll(re)];
      if (!cells.length || /^(skills|saving|senses|cr\b)/i.test(t)) return t;
      const r = row++ ? 1 : 0;
      return cells.map(m => {
        const c = m[1].replace(/^[lI1|]/, 'I')[0].toUpperCase(), o = m[1][1] ? m[1][1].toLowerCase() : '';
        const k = r === 0 ? (c === 'S' ? 'Str' : c === 'D' ? 'Dex' : c === 'C' ? 'Con' : null) : (c === 'I' ? 'Int' : c === 'W' ? 'Wis' : c === 'C' ? 'Cha' : null)
          || (c === 'C' ? (/[oa0]/.test(o) && o !== 'h' ? 'Con' : 'Cha') : null);
        return k ? `${k} ${m[2]} ${m[3]} ${m[4]}` : m[0].trim();
      }).join(' ');
    });
  }

  // Lines from where an entry starts to just before the next one, a big heading, or a column where it clearly stopped.
  function takeBlock(all, from, isStart, max = 90) {
    const out = [all[from]];
    const bodyH = all[from].h;
    for (let j = from + 1; j < all.length && out.length < max; j++) {
      const l = all[j], prev = all[j - 1];
      if (isStart(j)) break;
      if (l.h >= Math.max(17, bodyH * 1.7) && l.t.length < 40) break;                       // a title
      if ((l.page !== prev.page || l.col !== prev.col) && /[.)]$/.test(prev.t) && !heading(l.t) && !/^[A-Z][\w' -]{1,40}\.\s/.test(l.t)) break; // the block ended with its column
      if (l.page > all[from].page + 1) break;
      out.push(l);
    }
    return out;
  }
  // Wrapped lines back into sentences ("Sov-" + "ing" → "Saving"), keeping lines that start something new.
  function joinWrapped(ls, keep) {
    const out = [];
    ls.forEach(t => {
      const last = out.length - 1;
      if (last >= 0 && !keep(t) && !keep(out[last], true)) {
        out[last] = /[a-z]-$/.test(out[last]) && /^[a-z]/.test(t) ? out[last].slice(0, -1) + t : out[last] + ' ' + t;
      } else out.push(t);
    });
    return out;
  }
  const ENTRY = /^[A-Z][\w'’\-/ ,]{0,58}?(?:\s*\([^)]{1,40}\))?\.\s/;

  // The name, checked against the SRD's names and the words on the page around it.
  // dictWords: the words of the dictionary's names ("dragon", "wyrmling"), tried for each word after the page's words.
  function fixName(raw, dict, pageWords, dictWords = new Set()) {
    const clean = raw.replace(/[^A-Za-z0-9+'’ ,()-]/g, '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
    if (!clean) return { name: raw.trim(), ok: false };
    const lc = clean.toLowerCase();
    const exact = dict.find(d => d.toLowerCase() === lc);
    if (exact) return { name: exact, ok: true };
    let best = null, bd = 99;
    for (const d of dict) { const dl = d.toLowerCase(); if (Math.abs(dl.length - lc.length) > 3) continue; const dist = ocrDist(lc, dl); if (dist < bd) { bd = dist; best = d; } }
    if (best && bd <= Math.min(3, lc.length * 0.25)) return { name: best, ok: true };
    let ok = true;
    const name = clean.split(' ').map(w => {
      const lw = w.toLowerCase().replace(/[^a-z]/g, '');
      if (lw.length < 4 || (pageWords.get(lw) || 0) >= 2) return w;
      let cand = null, cd = 99, cf = 0;
      pageWords.forEach((f, pw) => { if (f < 2 || Math.abs(pw.length - lw.length) > 2 || pw[0] !== lw[0]) return; const d = ocrDist(lw, pw); if (d <= lw.length * 0.4 && (d < cd || d === cd && f > cf)) { cd = d; cand = pw; cf = f; } });
      if (!cand) dictWords.forEach(pw => { if (Math.abs(pw.length - lw.length) > 2 || pw[0] !== lw[0]) return; const d = ocrDist(lw, pw); if (d <= lw.length * 0.4 && d < cd) { cd = d; cand = pw; } });
      if (!cand) { ok = false; return w; }
      return cand;
    }).join(' ');
    return { name: title(name), ok };
  }
  function wordsNear(all, i) {
    const m = new Map(), page = all[i].page;
    for (let j = Math.max(0, i - 150); j < Math.min(all.length, i + 150); j++) {
      if (Math.abs(all[j].page - page) > 1) continue;
      for (const w of all[j].t.toLowerCase().match(/[a-z]{3,}/g) || []) {
        const s = w.replace(/(es|s)$/, '');
        m.set(w, (m.get(w) || 0) + 1); if (s !== w && s.length >= 3) m.set(s, (m.get(s) || 0) + 1);
      }
    }
    return m;
  }

  // all: lines of the whole book (pageLines for every page). dict: { monster: [names], spell: [...], item: [...] }.
  // → [{ kind, name, page, text, warn: [] }], text ready for Importer.parseMonster / parseSpell / parseItem.
  function findEntries(all, dict = {}) {
    const lines = all.map(l => ({ ...l, t: tidy(fixNumbers(unspace(l.t))) })).filter(l => l.t.length > 1 || /\d/.test(l.t));
    const isMonster = (j) => AC_RE.test(lines[j].t) && (lines.slice(j + 1, j + 4).some(l => HP_RE.test(l.t)) || /nitiative/i.test(lines[j].t)) && j >= 2 && short(lines[j - 2]) && /,/.test(lines[j - 1].t) && lines[j - 1].t.length < 70;
    const isItem = (j) => ITEM_RE.test(lines[j].t) && j >= 1 && short(lines[j - 1]);
    const isSpell = (j) => SPELL_RE.test(lines[j].t) && lines[j].t.length < 70 && j >= 1 && short(lines[j - 1]) && lines.slice(j + 1, j + 4).some(l => /^casting time/i.test(l.t));
    const starts = [];
    lines.forEach((_, j) => {
      if (isMonster(j)) starts.push({ kind: 'monster', at: j - 2 });
      else if (isItem(j)) starts.push({ kind: 'item', at: j - 1 });
      else if (isSpell(j)) starts.push({ kind: 'spell', at: j - 1 });
    });
    // A name in capitals that wraps onto two lines ("AMULET OF PROOF AGAINST DETECTION" / "AND LOCATION").
    const caps = (l) => l && /[A-Z]{2}/.test(l.t) && !/[a-z]{2}/.test(l.t.replace(/\b(of|the|and|or|a)\b/g, ''));
    starts.forEach(s => {
      const a = lines[s.at - 1]; const n = lines[s.at];
      if (caps(n) && caps(a) && short(a) && a.page === n.page && a.col === n.col && a.y - n.y < Math.max(a.h, n.h) * 1.6 && letters(a.t) !== letters(n.t)) { s.at--; s.two = true; }
    });
    const startSet = new Set(starts.map(s => s.at));
    const dictWords = Object.fromEntries(Object.entries(dict).map(([k, names]) => [k, new Set(names.flatMap(n => n.toLowerCase().match(/[a-z]{3,}/g) || []))]));
    return starts.map(s => {
      const block = takeBlock(lines, s.at, (j) => startSet.has(j)).map(l => l.t);
      if (s.two) block.splice(0, 2, block[0] + ' ' + block[1]);
      const warn = [];
      const nm = fixName(block[0], dict[s.kind] || [], wordsNear(lines, s.at), dictWords[s.kind]);
      if (!nm.ok) warn.push('name');
      let body = block.slice(1).map(fixWords);
      if (s.kind === 'monster') {
        // Headings back to their names, and the space OCR dropped after an entry's name ("(Recharge 5-6).The").
        body = fixAbilities(body).map(t => heading(t) || t.replace(/^([A-Z][\w'’\-/ ]{1,40}(?:\s*\([^)]{1,40}\))?)\.(?=[A-Za-z])/, '$1. '));
        // Properties stay one per line; after them, each trait or action becomes one paragraph.
        const firstEntry = body.findIndex((t, i) => i > 2 && (ENTRY.test(t) || heading(t)));
        const props = firstEntry < 0 ? body : body.slice(0, firstEntry), rest = firstEntry < 0 ? [] : body.slice(firstEntry);
        body = [...props, ...joinWrapped(rest, (t, isPrev) => !isPrev && (ENTRY.test(t) || SECTIONS.includes(t)) || isPrev && SECTIONS.includes(t)).map(fixText)];
      } else {
        // A type line that wraps ("…rare (+2), or" / "very rare (+3)") is one line.
        while (body.length > 1 && /(,|\bor|\band)$/i.test(body[0])) body.splice(0, 2, body[0] + ' ' + body[1]);
        // Spell properties ("Casting Time: Action") stay one per line; paragraphs that start with a label ("Swamp Step.") too.
        const PROP = /^(casting time|range|components|duration|classes|spell lists?)\b[^.]{0,20}:/i;
        body = [body[0].replace(/^wondrous\s*item/i, 'Wondrous item').replace(/very\s*rare/i, 'very rare').replace(/rarity\s*varies/i, 'rarity varies'),
          ...joinWrapped(body.slice(1), (t, isPrev) => PROP.test(t) || !isPrev && /^[A-Z][\w' ]{1,30}\.\s/.test(t)).map(fixText)];
      }
      return { kind: s.kind, name: nm.name, page: lines[s.at].page, text: [nm.name, ...body].join('\n'), warn };
    });
  }

  // What looks wrong in a parsed monster, for the ⚠ next to it. A CR the parser couldn't read comes from the XP
  // next to it ("CR ?? (XP 7,200" → 11), when the app's XP table (SRD.XP) is loaded.
  function checkMonster(sb, text) {
    const w = [];
    if (!/^(CR|Challenge)\s+[\d/]+/m.test(text)) {
      const xp = /XP\s*([\d,.]+)/.exec(text), n = xp && Number(xp[1].replace(/[,.]/g, ''));
      const cr = n && window.SRD && Object.keys(SRD.XP).find(k => SRD.XP[k] === n);
      if (cr != null) sb.cr = cr; else w.push('CR unreadable');
    }
    const found = ['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(a => new RegExp(`\\b${a}\\b\\s*\\d`, 'i').test(text)).length;
    if (found < 6) w.push(`${6 - found} ability score${found === 5 ? '' : 's'} missing`);
    if (!sb.actions || !sb.actions.length) w.push('no actions');
    if (sb.speed && /[^\w\s.,;()'/+-]|\b\w*\d\w*[a-z]{2,}/i.test(sb.speed.replace(/\bft\b/g, ''))) w.push('speed unreadable');
    return w;
  }

  // ---------- Reading a PDF in the app ----------
  let loading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    const add = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Couldn\'t load the PDF reader')); document.head.append(s); });
    loading = loading || add('vendor/pdfjs/pdf.worker.min.js').then(() => add('vendor/pdfjs/pdf.min.js'));
    return loading.catch(e => { loading = null; throw e; });
  }
  // The book's lines. onPage(n, total) reports progress; cancelled() stops early.
  async function readLines(file, onPage, cancelled) {
    await loadPdfJs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    const all = [];
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelled && cancelled()) break;
        const page = await doc.getPage(p);
        all.push(...pageLines((await page.getTextContent()).items, page.getViewport({ scale: 1 }).width, p));
        page.cleanup();
        if (onPage) onPage(p, doc.numPages);
      }
    } finally { doc.destroy(); }
    return all;
  }

  return { pageLines, findEntries, fixNumbers, fixWords, unspace, fixName, heading, checkMonster, readLines, lev };
})();
