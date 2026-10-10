// 5e (2024-style) stat block: parse from YAML, render to HTML, and edit with a form.
window.Statblock = (() => {
  const { h, esc, mod, sign } = U;
  const SECTIONS = [['traits', 'Traits'], ['actions', 'Actions'], ['bonus_actions', 'Bonus Actions'], ['reactions', 'Reactions'], ['legendary_actions', 'Legendary Actions']];

  const parse = (yamlText) => {
    const data = jsyaml.load(yamlText) || {};
    if (typeof data !== 'object') throw new Error('Stat block must be key: value pairs');
    return data;
  };

  const inline = (s) => marked.parseInline(String(s ?? '')).replace(/\n+/g, '<br>');
  const list = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '');

  function initMod(sb) {
    if (sb.initiative != null && sb.initiative !== '') return Number(String(sb.initiative).replace('+', '')) || 0;
    return mod(sb.dex ?? 10);
  }

  function render(sb) {
    const pb = SRD.pb(sb.cr ?? 0);
    const saves = (Array.isArray(sb.saves) ? sb.saves : String(sb.saves || '').split(/[,\s]+/)).map(s => s.toLowerCase().slice(0, 3));
    const im = initMod(sb);
    const abil = (k) => {
      const score = Number(sb[k] ?? 10), m = mod(score), sv = m + (saves.includes(k) ? pb : 0);
      return `<div class="sb-ab"><b>${k.toUpperCase()}</b><span>${score}</span><span class="sb-mod roll" data-d20="1" data-roll="1d20${m >= 0 ? '+' : ''}${m}" data-label="${k.toUpperCase()} check">${sign(m)}</span><span class="sb-mod roll" data-d20="1" data-roll="1d20${sv >= 0 ? '+' : ''}${sv}" data-label="${k.toUpperCase()} save">${sign(sv)}</span></div>`;
    };
    const abHead = '<div class="sb-ab sb-ab-head"><b></b><span></span><span>MOD</span><span>SAVE</span></div>';
    let senses = list(sb.senses);
    if (!/passive perception/i.test(senses)) senses = (senses && senses !== '—' ? senses + '; ' : '') + `Passive Perception ${sb.passive ?? 10 + mod(sb.wis ?? 10)}`;
    const imm = [list(sb.immunities), list(sb.condition_immunities)].filter(Boolean).join('; ');
    const line = (label, val) => val ? `<div class="sb-prop"><b>${label}</b> ${inline(val)}</div>` : '';
    const hp = `${sb.hp ?? '—'}${sb.hit_dice ? ` (${esc(sb.hit_dice)})` : ''}`;

    let html = `<div class="statblock">
      <div class="sb-name">${esc(sb.name || 'Unnamed Creature')}</div>
      <div class="sb-meta">${esc([sb.size, sb.type].filter(Boolean).join(' ') || 'Medium Creature')}${sb.alignment ? ', ' + esc(sb.alignment) : ''}</div>
      <div class="sb-rule"></div>
      <div class="sb-prop"><b>AC</b> ${esc(sb.ac ?? 10)}${sb.ac_note ? ` <span class="sb-dim">(${esc(sb.ac_note)})</span>` : ''}<span class="sb-right"><b>Initiative</b> <span class="roll" data-d20="1" data-roll="1d20${im >= 0 ? '+' : ''}${im}" data-label="Initiative">${sign(im)}</span> (${10 + im})</span></div>
      <div class="sb-prop"><b>HP</b> ${hp}</div>
      <div class="sb-prop"><b>Speed</b> ${esc(sb.speed || '30 ft.')}</div>
      <div class="sb-rule"></div>
      <div class="sb-abilities">${abHead.repeat(3)}${SRD.ABILITIES.map(abil).join('')}</div>
      <div class="sb-rule"></div>
      ${line('Skills', list(sb.skills))}${line('Vulnerabilities', list(sb.vulnerabilities))}${line('Resistances', list(sb.resistances))}${line('Immunities', imm)}
      ${line('Gear', list(sb.gear))}${line('Senses', senses)}${line('Languages', list(sb.languages) || '—')}
      <div class="sb-prop"><b>CR</b> ${esc(sb.cr ?? '0')} <span class="sb-dim">(XP ${SRD.xp(sb.cr ?? 0).toLocaleString()}; PB ${sign(pb)})</span></div>`;

    for (const [key, title] of SECTIONS) {
      const items = sb[key];
      if (!items || (Array.isArray(items) && !items.length)) continue;
      html += `<div class="sb-section">${title}</div>`;
      if (key === 'legendary_actions' && sb.legendary_desc) html += `<p class="sb-entry">${inline(sb.legendary_desc)}</p>`;
      for (const it of (Array.isArray(items) ? items : [items])) {
        if (typeof it === 'string') html += `<p class="sb-entry">${inline(it)}</p>`;
        else html += `<p class="sb-entry"><b><i>${esc(it.name || '')}.</i></b> ${inline(it.desc || '')}</p>`;
      }
    }
    return html + '</div>';
  }

  // Find the first ```statblock fence in a note.
  const FENCE = /```statblock\s*\n([\s\S]*?)```/;
  function fromNote(content) {
    const m = FENCE.exec(content || '');
    if (!m) return null;
    try { return parse(m[1]); } catch { return null; }
  }
  const toYaml = (sb) => jsyaml.dump(sb, { lineWidth: 120, noRefs: true });
  const fence = (sb) => '```statblock\n' + toYaml(sb) + '```';
  function replaceInNote(content, sb) {
    return FENCE.test(content) ? content.replace(FENCE, () => fence(sb)) : content.trimEnd() + '\n\n' + fence(sb) + '\n';
  }

  // ----- Form builder -----
  function entriesToText(items) {
    return (items || []).map(it => typeof it === 'string' ? it : `${it.name}. ${it.desc}`).join('\n\n');
  }
  function textToEntries(text) {
    return text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).map(p => {
      const m = /^([^.\n]{1,60}?(?:\([^)]*\))?)\.\s+([\s\S]+)$/.exec(p);
      return m ? { name: m[1].trim(), desc: m[2].trim() } : p;
    });
  }

  function openBuilder(sb, onSave) {
    sb = { size: 'Medium', type: 'Humanoid', alignment: 'Neutral', ac: 12, hp: 11, hit_dice: '2d8 + 2', speed: '30 ft.', str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, cr: '1/4', ...sb };
    const f = {};
    const field = (key, label, opts = {}) => {
      const input = opts.select
        ? h('select', opts.select.map(o => h('option', { value: o, selected: String(sb[key]) === String(o) }, o)))
        : h(opts.area ? 'textarea' : 'input', { value: list(sb[key]) ?? '', placeholder: opts.ph || '', rows: opts.rows || 6 });
      f[key] = input;
      return h('label.field' + (opts.cls ? '.' + opts.cls : ''), h('span', label), input);
    };
    const savesSel = new Set((Array.isArray(sb.saves) ? sb.saves : String(sb.saves || '').split(/[,\s]+/)).map(s => s.toLowerCase().slice(0, 3)));
    const preview = h('div.sb-preview');
    const collect = () => {
      const out = { ...sb };
      for (const [k, el] of Object.entries(f)) {
        let v = el.value.trim();
        if (SECTIONS.some(s => s[0] === k)) { out[k] = textToEntries(el.value); if (!out[k].length) delete out[k]; continue; }
        if (['str', 'dex', 'con', 'int', 'wis', 'cha', 'ac', 'hp'].includes(k) && /^\d+$/.test(v)) v = Number(v);
        if (v === '') delete out[k]; else out[k] = v;
      }
      out.saves = SRD.ABILITIES.filter(a => savesSel.has(a));
      if (!out.saves.length) delete out.saves;
      return out;
    };
    const refresh = () => { try { preview.innerHTML = render(collect()); } catch (e) { preview.textContent = e.message; } };

    const form = h('div.sb-form', { oninput: refresh, onchange: refresh },
      h('div.grid3', field('name', 'Name', { cls: 'span2' }), field('cr', 'Challenge Rating', { select: SRD.CRS })),
      h('div.grid3', field('size', 'Size', { select: SRD.SIZES }), field('type', 'Type', { ph: 'Undead, Humanoid (Elf)…' }), field('alignment', 'Alignment')),
      h('div.grid3', field('ac', 'Armor Class'), field('ac_note', 'AC note', { ph: 'natural armor' }), field('initiative', 'Initiative bonus', { ph: 'auto from DEX' })),
      h('div.grid3', field('hp', 'Hit Points'), field('hit_dice', 'Hit Dice', { ph: '4d8 + 4' }), field('speed', 'Speed', { ph: '30 ft., fly 60 ft.' })),
      h('div.grid6', SRD.ABILITIES.map(a => field(a, a.toUpperCase()))),
      h('div.saves', h('span', 'Proficient saves:'), SRD.ABILITIES.map(a => h('label.chk', h('input', { type: 'checkbox', checked: savesSel.has(a), onchange: (e) => { e.target.checked ? savesSel.add(a) : savesSel.delete(a); refresh(); } }), a.toUpperCase()))),
      h('div.grid2', field('skills', 'Skills', { ph: 'Perception +4, Stealth +6' }), field('senses', 'Senses', { ph: 'Darkvision 60 ft.' })),
      h('div.grid2', field('resistances', 'Resistances'), field('vulnerabilities', 'Vulnerabilities')),
      h('div.grid2', field('immunities', 'Damage immunities'), field('condition_immunities', 'Condition immunities')),
      h('div.grid2', field('languages', 'Languages'), field('gear', 'Gear')),
      h('p.hint', 'For each section below: one entry per paragraph, written as "Name. Description". Leave a blank line between entries.'),
      field('traits', 'Traits', { area: true, rows: 4 }),
      field('actions', 'Actions', { area: true, rows: 6, ph: 'Scimitar. *Melee Attack Roll:* +4, reach 5 ft. *Hit:* 5 (1d6 + 2) Slashing damage.' }),
      field('bonus_actions', 'Bonus Actions', { area: true, rows: 3 }),
      field('reactions', 'Reactions', { area: true, rows: 3 }),
      field('legendary_desc', 'Legendary intro', { ph: 'Legendary Action Uses: 3. Immediately after another creature\'s turn…' }),
      field('legendary_actions', 'Legendary Actions', { area: true, rows: 3 }),
    );
    for (const [k] of SECTIONS) f[k].value = entriesToText(sb[k]);
    const m = U.modal('Stat Block Builder', [h('div.sb-builder', form, preview),
      h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: () => { onSave(collect()); m.close(); } }, 'Save stat block'))], { wide: true });
    refresh();
  }

  return { parse, render, fromNote, toYaml, fence, replaceInNote, openBuilder, initMod };
})();
