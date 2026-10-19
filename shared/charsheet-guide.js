// Guided character creation: a step-by-step walk through class, species, background, ability scores, skills,
// starting equipment and spells, with a short explanation of each choice for players who are new to D&D.
// Used by every character sheet (CharSheet.mount's ✨ button, and the sheet app opens it for a new character).
// CharGuide.open(model, { onDone(model) }) works on a copy and only hands it back when the player finishes.
// CharGuide.levelUp(model, { part, live, onDone(model, result) }) does the same for one new level (hit points, subclass,
// ability scores or a feat, new features and spells), using CharSheet.levelPlan/levelUp like the sheet's quick dialog.
window.CharGuide = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sgn = (n) => (n >= 0 ? '+' : '') + n;
  const mod = (v) => Math.floor((v - 10) / 2);
  const ord = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
  const ARRAY = [15, 14, 13, 12, 10, 8];

  // [icon, what it is, who enjoys it]
  const CLASS_INFO = {
    Barbarian: ['🪓', 'A fierce warrior who flies into a Rage, shrugging off blows and hitting harder.', 'You want to charge in first and be very hard to bring down.'],
    Bard: ['🎻', 'A performer whose music and words are magic: healing friends, charming foes, knowing a bit of everything.', 'You like talking your way through things and helping the party shine.'],
    Cleric: ['✨', 'A priest who channels a god\'s power to heal, protect and smite.', 'You want to keep everyone alive and still hold your own in a fight.'],
    Druid: ['🌿', 'A keeper of nature who casts elemental spells and can turn into animals.', 'You like versatile magic and the idea of becoming a bear.'],
    Fighter: ['⚔', 'A master of weapons and armor, with tricks to act again and get back up.', 'You want simple, strong choices every turn. A great first character.'],
    Monk: ['👊', 'A martial artist who strikes fast with fists and feet, powered by inner focus.', 'You like moving quickly around the battlefield and hitting many times.'],
    Paladin: ['🛡', 'A holy knight bound by an oath, with heavy armor, healing hands and divine smites.', 'You want to protect people and deliver big, dramatic hits.'],
    Ranger: ['🏹', 'A hunter and tracker who mixes weapons with nature magic.', 'You like bows, exploring the wild and marking your prey.'],
    Rogue: ['🗡', 'A sneaky expert who strikes where it hurts with Sneak Attack and is good at many skills.', 'You like stealth, locks, traps and clever plans.'],
    Sorcerer: ['🔥', 'A spellcaster with magic in their blood who can bend and twist their spells.', 'You want raw, flashy magic and few things to keep track of.'],
    Warlock: ['👁', 'A caster who made a pact with a powerful being, with few but strong spells that come back on a Short Rest.', 'You like a mysterious patron and blasting with Eldritch Blast.'],
    Wizard: ['📖', 'A scholar of magic with the biggest list of spells, learned from a spellbook.', 'You like having the right spell for every problem.'],
  };
  const SPECIES_INFO = {
    Dragonborn: ['🐉', 'Descended from dragons: a breath weapon and resistance to one kind of damage.'],
    Dwarf: ['⛏', 'Tough and stout, with extra hit points, darkvision and resistance to poison.'],
    Elf: ['🧝', 'Graceful and long-lived, with keen senses, darkvision and a little innate magic.'],
    Gnome: ['🔧', 'Small, clever and curious, hard to fool with magic.'],
    Goliath: ['🗻', 'Huge and strong, descended from giants, with a giant-born power.'],
    Halfling: ['🍀', 'Small and nimble, and lucky: you can reroll a 1.'],
    Human: ['🧑', 'Adaptable and ambitious: an extra skill, an extra feat and Heroic Inspiration after a Long Rest.'],
    Orc: ['💪', 'Strong and enduring: when you drop to 0 HP, you can stay standing once per Long Rest.'],
    Tiefling: ['😈', 'Touched by the fiends, with fire, necrotic or poison magic in your blood.'],
  };
  const BG_INFO = {
    Acolyte: '🕯 You served in a temple, studying the faith and its rituals.',
    Criminal: '🗝 You lived outside the law: thief, smuggler or cutpurse.',
    Sage: '📜 You spent years in libraries and universities learning lore.',
    Soldier: '🎖 You trained and fought in an army.',
  };
  // Where to put the best scores, for "Suggest for me".
  const PRIORITY = {
    Barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'], Bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'], Cleric: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
    Druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'], Fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'], Monk: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    Paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'], Ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'], Rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
    Sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'], Warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'], Wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
  };
  const ABOUT_AB = { str: 'lifting, climbing, hitting with heavy weapons', dex: 'agility, stealth, bows, dodging', con: 'toughness and hit points',
    int: 'memory, reasoning, wizard magic', wis: 'perception, insight, cleric and druid magic', cha: 'persuasion, presence, bard and warlock magic' };

  function open(model, opts = {}) {
    const CS = window.CharSheet, D = CS.data(), AB = CS.AB, AB_NAME = CS.AB_NAME;
    const byName = (list, n) => (list || []).find(x => x.name.toLowerCase() === String(n || '').trim().toLowerCase()) || null;
    const base = CS.prepare(JSON.parse(JSON.stringify(model || {})));
    const s0 = base.sheet, c0 = byName(D.classes, base.cls);
    const scores = AB.map(a => s0.abilities[a]);
    const st = {
      step: 0, cls: c0 ? c0.name : '', level: base.level || 1, subclass: s0.subclass || '',
      species: (byName(D.species, s0.species) || {}).name || '', subspecies: s0.subspecies || '', background: (byName(D.backgrounds, s0.background) || {}).name || '',
      // Ability scores before the background's bonus. A sheet that already has scores starts in "type them".
      method: scores.every(v => v === 10) ? 'array' : 'manual', assign: scores.every(v => v === 10) ? {} : { ...s0.abilities }, rolled: null,
      bonus: scores.every(v => v === 10) ? '21' : 'none', plus2: '', plus1: '',
      skills: new Set(Object.keys(s0.skills)), equip: {}, spells: new Set(), alignment: s0.alignment || '', bio: { ...s0.bio },
    };
    const cls = () => byName(D.classes, st.cls), sp = () => byName(D.species, st.species), bg = () => byName(D.backgrounds, st.background);
    const L = () => { const c = cls(); return c ? c.levels[Math.min(20, st.level) - 1] : null; };
    const casts = () => { const l = L(); return !!(cls() && cls().spellAbility && l && ((l.cantrips || 0) + (l.prepared || 0))); };
    const steps = () => ['welcome', 'class', 'species', 'background', 'abilities', 'skills', 'equipment', ...(casts() ? ['spells'] : []), 'details', 'done'];

    const pool = () => st.method === 'roll' ? (st.rolled || []) : ARRAY;
    const baseScore = (a) => st.method === 'manual' ? Number(st.assign[a]) || 10 : st.assign[a] ?? null;
    function bonusOf(a) {
      const b = bg(); if (!b || st.bonus === 'none') return 0;
      if (st.bonus === '111') return b.abilities.includes(a) ? 1 : 0;
      return a === st.plus2 ? 2 : a === st.plus1 ? 1 : 0;
    }
    const finalScore = (a) => Math.min(20, (baseScore(a) ?? 10) + bonusOf(a));
    function suggest() {
      const pr = PRIORITY[st.cls] || AB, vals = [...pool()].sort((x, y) => y - x);
      st.assign = {}; pr.forEach((a, i) => { st.assign[a] = vals[i]; });
    }
    function defaultBonus() {
      const b = bg(); if (!b) return;
      const pr = PRIORITY[st.cls] || AB, mine = [...b.abilities].sort((x, y) => pr.indexOf(x) - pr.indexOf(y));
      if (!b.abilities.includes(st.plus2)) st.plus2 = mine[0];
      if (!b.abilities.includes(st.plus1) || st.plus1 === st.plus2) st.plus1 = mine.find(a => a !== st.plus2);
    }
    const roll4d6 = () => { const r = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x); return r[0] + r[1] + r[2]; };

    // The model the choices make. Only what the guide asks about changes; the rest of the sheet stays.
    function build(withExtras = true) {
      const m = JSON.parse(JSON.stringify(base)), s = m.sheet, c = cls(), b = bg();
      m.cls = st.cls; m.level = st.level; s.subclass = st.level >= 3 ? st.subclass : '';
      s.species = st.species; s.subspecies = st.subspecies; s.background = st.background;
      AB.forEach(a => { s.abilities[a] = finalScore(a); });
      s.saves = null; s.auto = { ac: true, hp: true, init: true, speed: true };
      if (c) c.skillFrom.forEach(k => { if (!st.skills.has(k)) delete s.skills[k]; });
      st.skills.forEach(k => { s.skills[k] = Math.max(1, s.skills[k] || 0); });
      if (b) b.skills.forEach(k => { s.skills[k] = Math.max(1, s.skills[k] || 0); });
      if (withExtras) {
        equipSets().forEach(set => {
          const ch = set.choices[st.equip[set.key] ?? 0];
          if (!ch) return;
          ch.items.forEach(x => CS.addItemTo(m, x.ref, x.count, x.name));
          s.coins.gp = (s.coins.gp || 0) + (ch.gp || 0);
        });
        const have = new Set(s.spells.map(x => x.name.toLowerCase()));
        st.spells.forEach(n => { const d = byName(D.spells, n); if (d && !have.has(d.name.toLowerCase())) s.spells.push({ id: Math.random().toString(36).slice(2, 10), name: d.name, level: d.level, prepared: d.level > 0, desc: '' }); });
      }
      s.alignment = st.alignment;
      Object.assign(s.bio, st.bio);
      return CS.applyAuto(CS.clean(m));
    }
    const equipSets = () => [...(cls() ? cls().equipment.map((o, i) => ({ key: 'c' + i, from: cls().name, ...o })) : []), ...(bg() ? bg().equipment.map((o, i) => ({ key: 'b' + i, from: bg().name, ...o })) : [])];
    const spellLists = () => {
      const l = L(), maxLv = Math.max(0, (l && l.slots ? l.slots.filter(Boolean).length : 0));
      const mine = D.spells.filter(x => x.classes.includes(st.cls));
      return { cantrips: mine.filter(x => x.level === 0), leveled: mine.filter(x => x.level > 0 && x.level <= Math.max(1, maxLv)), nC: (l && l.cantrips) || 0, nP: (l && l.prepared) || 0 };
    };

    const wrap = document.createElement('div');
    wrap.className = 'cg cs';
    document.body.append(wrap);
    document.body.classList.add('cg-open');
    const close = () => { wrap.remove(); document.body.classList.remove('cg-open'); };
    const card = (on, act, v, icon, title, text, extra = '') => `<button class="cg-pick${on ? ' on' : ''}" data-g="${act}" data-v="${esc(v)}"><span class="cg-ico">${icon}</span><span><b>${esc(title)}</b><small>${text}</small>${extra}</span></button>`;
    const tip = (html) => `<div class="cg-tip">💡 ${html}</div>`;

    const VIEWS = {
      welcome: () => `<h2>Let's make your character</h2>
        <p>A D&amp;D character is built from a few big choices. This guide takes you through them one at a time and explains each one. It takes about five minutes, and the sheet does all the math.</p>
        <ol class="cg-list"><li><b>Class</b>: what you do (fight, sneak, cast spells…)</li><li><b>Species</b>: what you are (elf, dwarf, human…)</li><li><b>Background</b>: what you did before adventuring</li>
        <li><b>Ability scores</b>: how strong, quick, smart… you are</li><li><b>Skills, gear and spells</b></li></ol>
        ${tip('Not sure what to pick? Ask your DM what kind of game it is, or just choose what sounds fun. Nothing here is permanent: you can change everything later with ✏ Edit.')}
        <div class="cg-row"><button class="cs-btn primary big" data-g="next">✨ Guide me through it</button></div>
        <button class="cs-btn ghost" data-g="close">I know what I'm doing, I'll fill it in myself</button>`,

      class: () => {
        const c = cls();
        return `<h2>Choose a class</h2><p class="cs-hint">Your class is the biggest choice: it decides what you're good at and what you do on your turn.</p>
          <div class="cg-picks">${D.classes.map(x => { const i = CLASS_INFO[x.name] || ['🎲', '', '']; return card(x.name === st.cls, 'cls', x.name, i[0], x.name, esc(i[1]), `<em>Hit die d${x.hitDie} · Best in ${esc(x.primary)}</em>`); }).join('')}</div>
          ${c ? tip(`<b>${esc(c.name)}</b>: ${esc((CLASS_INFO[c.name] || [])[2] || '')}`) : ''}
          <div class="cs-card"><h4>Starting level</h4><p class="cs-hint">Most campaigns start at level 1. Ask your DM if you're not sure.</p>
            <span class="cs-step"><button class="cs-btn small" data-g="lvl" data-v="-1">−</button><b class="cg-lvl">${st.level}</b><button class="cs-btn small" data-g="lvl" data-v="1">＋</button></span>
            ${c && st.level >= 3 ? `<label class="cs-field"><span>Subclass (chosen at level 3)</span><select data-gf="subclass"><option value="">Choose…</option>${c.subclasses.map(x => `<option${x.name === st.subclass ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
              ${c.subclasses.map(x => `<p class="cs-hint"><b>${esc(x.name)}</b>: ${esc(x.summary || '')}</p>`).join('')}` : ''}</div>`;
      },

      species: () => {
        const s = sp();
        return `<h2>Choose a species</h2><p class="cs-hint">Your species gives you a few special traits, like seeing in the dark or a breath weapon. It doesn't change your ability scores.</p>
          <div class="cg-picks">${D.species.map(x => { const i = SPECIES_INFO[x.name] || ['🧑', '']; return card(x.name === st.species, 'species', x.name, i[0], x.name, esc(i[1]), `<em>${esc(x.size)} · Speed ${x.speed} ft.</em>`); }).join('')}</div>
          ${s ? `<div class="cs-card"><h4>${esc(s.name)} traits</h4>${s.traits.map(t => `<details><summary>${esc(t.name)}</summary><div class="cs-dlg-text">${CS.fmt(t.desc)}</div></details>`).join('')}
            ${s.subspecies.length ? `<label class="cs-field"><span>Lineage</span><select data-gf="subspecies"><option value="">Choose…</option>${s.subspecies.map(x => `<option${x.name === st.subspecies ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
              ${st.subspecies ? (byName(s.subspecies, st.subspecies) || { traits: [] }).traits.map(t => `<p class="cs-hint"><b>${esc(t.name)}</b>: ${esc(t.desc)}</p>`).join('') : ''}` : ''}</div>` : ''}`;
      },

      background: () => {
        const b = bg();
        return `<h2>Choose a background</h2><p class="cs-hint">Your background is what you did before becoming an adventurer. It raises your ability scores, and gives you two skills, a tool and a starting feat.</p>
          <div class="cg-picks">${D.backgrounds.map(x => card(x.name === st.background, 'bg', x.name, x.homebrew ? '★' : (BG_INFO[x.name] || '📜').slice(0, 2), x.name,
            esc(BG_INFO[x.name] ? BG_INFO[x.name].slice(2).trim() : String(x.desc || '').replace(/[*_#>]/g, '').split(/(?<=\.)\s/)[0].slice(0, 160)),
            `<em>${x.abilities.length ? `Boosts ${x.abilities.map(a => AB_NAME[a]).join(', ')} · ` : ''}Skills: ${esc(x.skills.join(', ') || '—')} · Feat: ${esc(x.feat || '—')}${x.homebrew ? ' · from your DM' : ''}</em>`)).join('')}</div>
          ${b ? tip(`Your DM may allow other backgrounds. You can type any background on the sheet later; the ones here come with their rules built in.`) : ''}`;
      },

      abilities: () => {
        const b = bg(), used = (v, a) => Object.entries(st.assign).some(([k, x]) => k !== a && x === v) && pool().filter(x => x === v).length <= Object.entries(st.assign).filter(([k, x]) => k !== a && x === v).length;
        return `<h2>Ability scores</h2><p class="cs-hint">Six numbers describe your character. The modifier (the small ±) is what gets added to your dice rolls, so a 15 gives +2 and an 8 gives −1.</p>
          <div class="cs-seg">${[['array', 'Standard set'], ['roll', 'Roll dice'], ['manual', 'Type them']].map(([k, l]) => `<button data-g="method" data-v="${k}" class="${st.method === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${st.method === 'array' ? '<p class="cs-hint">Give each of 15, 14, 13, 12, 10 and 8 to one ability. This is the usual choice.</p>' : ''}
          ${st.method === 'roll' ? `<p class="cs-hint">Roll four six-sided dice and add the highest three, six times. ${st.rolled ? `You rolled <b>${st.rolled.join(', ')}</b>.` : 'Ask your DM first: some tables don\'t roll.'}</p><button class="cs-btn" data-g="roll">🎲 ${st.rolled ? 'Roll again' : 'Roll six scores'}</button>` : ''}
          ${st.method !== 'manual' && pool().length ? `<button class="cs-btn" data-g="suggest">✨ Suggest for ${esc(st.cls || 'me')}</button>` : ''}
          <div class="cg-abils">${AB.map(a => `<div class="cg-ab"><b>${AB_NAME[a]}</b><small>${ABOUT_AB[a]}</small>
            ${st.method === 'manual' ? `<input type="number" inputmode="numeric" min="3" max="20" data-gf="score" data-a="${a}" value="${esc(st.assign[a] ?? '')}" placeholder="10">`
              : `<select data-gf="score" data-a="${a}" ${pool().length ? '' : 'disabled'}><option value="">—</option>${pool().map((v, i) => pool().indexOf(v) === i ? `<option value="${v}"${st.assign[a] === v ? ' selected' : ''}${used(v, a) ? ' class="cg-used"' : ''}>${v}</option>` : '').join('')}</select>`}
            <span class="cg-final">${baseScore(a) == null ? '' : `${finalScore(a)} <i>${sgn(mod(finalScore(a)))}</i>${bonusOf(a) ? ` <em>(+${bonusOf(a)})</em>` : ''}`}</span></div>`).join('')}</div>
          ${b && b.abilities.length ? `<div class="cs-card"><h4>Background bonus (${esc(b.name)})</h4><p class="cs-hint">Your background raises ${b.abilities.map(a => AB_NAME[a]).join(', ')}: +2 to one and +1 to another, or +1 to all three.</p>
            <div class="cs-seg small"><button data-g="bonus" data-v="21" class="${st.bonus === '21' ? 'on' : ''}">+2 and +1</button><button data-g="bonus" data-v="111" class="${st.bonus === '111' ? 'on' : ''}">+1 to all three</button>${st.method === 'manual' ? `<button data-g="bonus" data-v="none" class="${st.bonus === 'none' ? 'on' : ''}">Already in my scores</button>` : ''}</div>
            ${st.bonus === '21' ? `<div class="cg-row">+2 <select data-gf="plus2">${b.abilities.map(a => `<option value="${a}"${a === st.plus2 ? ' selected' : ''}>${AB_NAME[a]}</option>`).join('')}</select>
              +1 <select data-gf="plus1">${b.abilities.filter(a => a !== st.plus2).map(a => `<option value="${a}"${a === st.plus1 ? ' selected' : ''}>${AB_NAME[a]}</option>`).join('')}</select></div>` : ''}</div>` : ''}
          ${st.cls && PRIORITY[st.cls] ? tip(`${esc(st.cls)}s want their best score in <b>${AB_NAME[PRIORITY[st.cls][0]]}</b>, then <b>${AB_NAME[PRIORITY[st.cls][1]]}</b>.`) : ''}`;
      },

      skills: () => {
        const c = cls(), b = bg(), from = b ? b.skills : [], picked = c ? c.skillFrom.filter(k => st.skills.has(k) && !from.includes(k)).length : 0;
        return `<h2>Skills</h2><p class="cs-hint">Skills are what you're trained in. When you try something tricky, like sneaking past a guard, you add your proficiency bonus to the roll if you're trained.</p>
          ${b ? `<div class="cs-card"><h4>From your background</h4><p>${b.skills.map(k => `● ${esc(k)}`).join(' &nbsp; ')}</p></div>` : ''}
          ${c ? `<div class="cs-card"><h4>From your class <small>pick ${c.skillChoose} · ${picked}/${c.skillChoose}</small></h4><div class="cg-checks">${c.skillFrom.map(k => {
            const bgk = from.includes(k), on = bgk || st.skills.has(k);
            return `<label class="${bgk ? 'cg-dim' : ''}"><input type="checkbox" data-gf="skill" data-v="${esc(k)}"${on ? ' checked' : ''}${bgk || (!on && picked >= c.skillChoose) ? ' disabled' : ''}> ${esc(k)} <small>${(D.skills[k] || '').toUpperCase()}${bgk ? ' · from background' : ''}</small></label>`;
          }).join('')}</div></div>` : ''}
          ${tip('Perception (noticing things) and Stealth come up in almost every game. Persuasion and Insight are great if you like talking to people.')}`;
      },

      equipment: () => `<h2>Starting equipment</h2><p class="cs-hint">Your class and background each give you a kit of gear, or gold to buy your own. Packs are unpacked so you can track each torch and ration.</p>
        ${equipSets().map(set => `<div class="cs-card"><h4>${esc(set.from)}</h4><div class="cg-checks">${set.choices.map((ch, i) => `<label><input type="radio" name="eq-${set.key}" data-gf="equip" data-k="${set.key}" data-v="${i}"${(st.equip[set.key] ?? 0) === i ? ' checked' : ''}>
          <span><b>Option ${esc(ch.label)}</b>: ${ch.items.length ? esc(ch.items.map(x => (x.count > 1 ? x.count + ' × ' : '') + x.name).join(', ')) : ''}${ch.items.length && ch.gp ? ' and ' : ''}${ch.gp ? ch.gp + ' GP' : ''}</span></label>`).join('')}
          <label><input type="radio" name="eq-${set.key}" data-gf="equip" data-k="${set.key}" data-v="-1"${st.equip[set.key] === -1 ? ' checked' : ''}> <span>Nothing, I'll add my own gear</span></label></div></div>`).join('') || '<p class="cs-hint">Choose a class and background first.</p>'}
        ${tip('Not sure? Take option A: it\'s a complete kit chosen for your class. Weapons and armor are equipped for you, so your Armor Class and attacks fill in.')}`,

      spells: () => {
        const { cantrips, leveled, nC, nP } = spellLists(), nc = cantrips.filter(x => st.spells.has(x.name)).length, np = leveled.filter(x => st.spells.has(x.name)).length;
        const row = (x, full) => `<label class="cg-spell"><input type="checkbox" data-gf="spell" data-v="${esc(x.name)}"${st.spells.has(x.name) ? ' checked' : ''}${!st.spells.has(x.name) && full ? ' disabled' : ''}>
          <details><summary><b>${esc(x.name)}</b> <small>${x.level ? ord(x.level) + ' · ' : ''}${esc(x.school)}${x.dmgType ? ' · ' + esc(x.dmgType) : ''}</small></summary><div class="cs-dlg-text">${CS.fmt(x.desc || '')}</div></details></label>`;
        return `<h2>Spells</h2><p class="cs-hint">Cantrips are spells you can cast as often as you like. Other spells use a spell slot, and you get your slots back after a Long Rest. Tap a spell's name to read it.</p>
          ${nC ? `<div class="cs-card"><h4>Cantrips <small>pick ${nC} · ${nc}/${nC}</small></h4>${cantrips.map(x => row(x, nc >= nC)).join('')}</div>` : ''}
          ${nP ? `<div class="cs-card"><h4>Prepared spells <small>pick ${nP} · ${np}/${nP}</small></h4>${leveled.map(x => row(x, np >= nP)).join('')}</div>` : ''}
          ${tip(`A good start: one cantrip that deals damage, and spells that solve problems (healing, shields, sleep, light). ${st.cls === 'Wizard' || st.cls === 'Cleric' || st.cls === 'Druid' ? 'You can change your prepared spells after a Long Rest.' : ''}`)}`;
      },

      details: () => `<h2>Personality <small class="cs-hint">(optional)</small></h2><p class="cs-hint">A few words here help you roleplay and give the DM hooks for your story. Skip anything you like.</p>
        <label class="cs-field"><span>Alignment</span><select data-gf="alignment"><option value="">Not sure yet</option>${CS.ALIGN.map(a => `<option${a === st.alignment ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
        ${[['personality', 'Personality', 'I quote old proverbs for every occasion.'], ['ideals', 'Ideals', 'Freedom. Everyone deserves a choice.'], ['bonds', 'Bonds', 'I would die to protect my little sister.'], ['flaws', 'Flaws', 'I can\'t resist a shiny trinket.']]
          .map(([k, l, ph]) => `<label class="cs-field"><span>${l}</span><textarea rows="2" data-gf="bio" data-k="${k}" placeholder="${esc(ph)}">${esc(st.bio[k] || '')}</textarea></label>`).join('')}`,

      done: () => {
        const m = build(false), X = CS.derive(m);
        return `<h2>Ready to play!</h2>
          <div class="cs-tiles cs-tiles3"><div class="cs-tile"><b>${X.ac}</b><span>AC</span></div><div class="cs-tile"><b>${X.maxHp ?? '—'}</b><span>Hit points</span></div><div class="cs-tile"><b>${sgn(X.init)}</b><span>Initiative</span></div></div>
          <p>Level ${st.level} ${esc(st.cls)}${st.species ? ' · ' + esc(st.species) : ''}${st.background ? ' · ' + esc(st.background) : ''}</p>
          <div class="cs-card"><h4>Your sheet in 30 seconds</h4><ul class="cg-list">
            <li><b>Tap almost anything to roll it</b>: an ability, save, skill, attack or spell.</li>
            <li><b>Stats</b> has your abilities and skills, <b>Actions</b> your attacks and rests, <b>Spells</b>, <b>Gear</b> and <b>Features</b> what they say.</li>
            <li><b>Tap your HP</b> when you take damage or heal.</li>
            <li><b>⬆ Level up</b> on Features walks you through each new level.</li>
            <li><b>✏ Edit</b> changes anything, any time, and adds a picture of your character.</li></ul></div>
          <button class="cs-btn primary big" data-g="finish">✓ Start playing</button>`;
      },
    };

    // Each step says what's missing before Next works.
    function blocker(id) {
      if (id === 'class' && !st.cls) return 'Choose a class';
      if (id === 'species' && !st.species) return 'Choose a species';
      if (id === 'background' && !st.background) return 'Choose a background';
      if (id === 'abilities' && AB.some(a => baseScore(a) == null)) return 'Give every ability a score';
      return '';
    }
    function draw(keepScroll) {
      const list = steps(), id = list[st.step], body = wrap.querySelector('.cg-body'), y = keepScroll && body ? body.scrollTop : 0;
      if (id === 'abilities') defaultBonus();
      const first = st.step === 0, last = id === 'done';
      wrap.innerHTML = `<div class="cg-head"><div class="cg-dots">${list.slice(1).map((_, i) => `<i class="${i + 1 <= st.step ? 'on' : ''}"></i>`).join('')}</div><button class="cg-x" data-g="close">Skip guide ✕</button></div>
        <div class="cg-body">${VIEWS[id]()}</div>
        ${first || last ? '' : `<div class="cg-foot"><button class="cs-btn" data-g="back">← Back</button><span class="cg-why">${esc(blocker(id))}</span><button class="cs-btn primary" data-g="next" ${blocker(id) ? 'disabled' : ''}>Next →</button></div>`}`;
      wrap.querySelector('.cg-body').scrollTop = y;
    }
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const g = b.dataset.g, v = b.dataset.v;
      if (g === 'close') { if (st.step === 0 || confirm('Leave the guide? Nothing you picked here is saved.')) close(); return; }
      if (g === 'next') { if (!blocker(steps()[st.step])) st.step = Math.min(steps().length - 1, st.step + 1); return draw(); }
      if (g === 'back') { st.step = Math.max(0, st.step - 1); return draw(); }
      if (g === 'finish') { const m = build(true); close(); if (opts.onDone) opts.onDone(m); return; }
      if (g === 'cls') { if (st.cls !== v) { st.cls = v; st.subclass = ''; st.spells.clear(); } }
      else if (g === 'lvl') st.level = Math.max(1, Math.min(20, st.level + Number(v)));
      else if (g === 'species') { if (st.species !== v) { st.species = v; st.subspecies = ''; } }
      else if (g === 'bg') st.background = v;
      else if (g === 'method') { st.method = v; st.assign = {}; if (st.bonus === 'none') st.bonus = '21'; }
      else if (g === 'roll') { st.rolled = Array.from({ length: 6 }, roll4d6).sort((x, y) => y - x); st.assign = {}; }
      else if (g === 'suggest') suggest();
      else if (g === 'bonus') st.bonus = v;
      else return;
      draw(true);
    });
    wrap.addEventListener('change', (e) => {
      const t = e.target, f = t.dataset.gf; if (!f) return;
      if (f === 'subclass') st.subclass = t.value;
      else if (f === 'subspecies') st.subspecies = t.value;
      else if (f === 'score') {
        const a = t.dataset.a;
        if (st.method === 'manual') st.assign[a] = t.value === '' ? null : Math.max(3, Math.min(20, Math.round(Number(t.value)) || 10));
        else {
          // Picking a number another ability already has swaps the two.
          const v = t.value === '' ? null : Number(t.value), other = AB.find(x => x !== a && st.assign[x] === v && v != null);
          const count = pool().filter(x => x === v).length, taken = AB.filter(x => x !== a && st.assign[x] === v).length;
          if (other && taken >= count) st.assign[other] = st.assign[a] ?? null;
          st.assign[a] = v;
        }
      }
      else if (f === 'plus2') { st.plus2 = t.value; if (st.plus1 === st.plus2) st.plus1 = ''; }
      else if (f === 'plus1') st.plus1 = t.value;
      else if (f === 'skill') { if (t.checked) st.skills.add(t.dataset.v); else st.skills.delete(t.dataset.v); }
      else if (f === 'equip') st.equip[t.dataset.k] = Number(t.dataset.v);
      else if (f === 'spell') { if (t.checked) st.spells.add(t.dataset.v); else st.spells.delete(t.dataset.v); }
      else if (f === 'alignment') { st.alignment = t.value; return; }
      else if (f === 'bio') return;
      draw(true);
    });
    wrap.addEventListener('input', (e) => { if (e.target.dataset.gf === 'bio') st.bio[e.target.dataset.k] = e.target.value.slice(0, 1500); });
    draw();
    return { close };
  }
  // ---------- Level up, step by step ----------
  function levelUp(model, opts = {}) {
    const CS = window.CharSheet, AB = CS.AB, AB_NAME = CS.AB_NAME;
    const base = CS.prepare(JSON.parse(JSON.stringify(model || {})));
    const plan = (i) => CS.levelPlan(base, i, opts.live);
    let P = plan(opts.part || 0);
    if (P.blocked) return null;
    const pr = () => PRIORITY[P.c.name] || AB;
    const st = { step: 0, rolled: null, kept: null, roll: '', subclass: '', asi: 'two', a: '', b: '', feat: '', spells: new Set() };
    const bestUp = () => pr().find(a => P.D.score[a] < 20) || 'con';
    const resetAsi = () => { st.a = bestUp(); st.b = pr().find(a => a !== st.a && P.D.score[a] < 20) || AB.find(a => a !== st.a); };
    resetAsi();

    // Spells: new picks are what the next level adds, or more if the sheet has fewer than it should.
    const spellPicks = () => {
      const { A, D, c } = P, have = D.spells || [];
      const maxLv = Math.max(0, ...A.slots.map(x => x.level), A.pact ? A.pact.level : 0);
      const mine = CS.data().spells.filter(x => x.classes.includes(c.name) && !have.some(h => h.name.toLowerCase() === x.name.toLowerCase()));
      const nC = Math.max(A.counts.cantrips - D.counts.cantrips, A.counts.cantrips - have.filter(x => x.level === 0).length, 0);
      const nP = Math.max(A.counts.prepared - D.counts.prepared, A.counts.prepared - have.filter(x => x.level > 0).length, 0);
      return { cantrips: mine.filter(x => x.level === 0), leveled: mine.filter(x => x.level > 0 && x.level <= Math.max(1, maxLv)), nC: Math.min(nC, 4), nP: Math.min(nP, 6), maxLv };
    };
    const subNow = () => P.needSub && st.subclass ? (P.c.subclasses.find(x => x.name === st.subclass) || null) : null;
    const newFeatures = () => {
      const sc = subNow();
      return sc ? [...P.feats.filter(f => !/Subclass$/i.test(f.name)), ...sc.features.filter(f => f.level === P.newLvl).map(f => ({ ...f, src: sc.name }))] : P.feats;
    };
    const steps = () => ['start', 'hp', ...(P.needSub ? ['subclass'] : []), ...(P.asi ? ['asi'] : []), ...(newFeatures().length ? ['features'] : []),
      ...(P.c.spellAbility && (spellPicks().nC || spellPicks().nP) ? ['spells'] : []), 'done'];
    const choice = () => ({ rolled: st.rolled, subclass: st.subclass,
      asi: { mode: st.asi, a: st.a, b: st.b, feat: st.feat }, spells: [...st.spells] });
    function build() {
      const m = JSON.parse(JSON.stringify(base)), r = CS.levelUp(m, CS.levelPlan(m, P.partIdx, opts.live), choice());
      return { m: CS.applyAuto(CS.clean(m)), r };
    }

    const wrap = document.createElement('div');
    wrap.className = 'cg cs';
    document.body.append(wrap);
    document.body.classList.add('cg-open');
    const close = () => { wrap.remove(); document.body.classList.remove('cg-open'); };
    const card = (on, act, v, icon, title, text, extra = '') => `<button class="cg-pick${on ? ' on' : ''}" data-g="${act}" data-v="${esc(v)}"><span class="cg-ico">${icon}</span><span><b>${esc(title)}</b><small>${text}</small>${extra}</span></button>`;
    const tip = (html) => `<div class="cg-tip">💡 ${html}</div>`;
    const feature = (f, openIt) => `<details${openIt ? ' open' : ''}><summary>${esc(f.name)}${f.src ? ` <small>${esc(f.src)}</small>` : ''}</summary><div class="cs-dlg-text">${CS.fmt(f.desc || '')}</div></details>`;
    const after = (a) => st.asi === 'two' ? (a === st.a ? 2 : 0) : st.asi === 'split' ? (a === st.a ? 1 : 0) + (a === st.b ? 1 : 0) : 0;

    const VIEWS = {
      start: () => {
        const { D, c, newLvl, A } = P, info = CLASS_INFO[c.name] || ['🎲'];
        return `<h2>${info[0]} Level ${D.lvl + 1}!</h2>
          <p>Every new level makes your character tougher and gives them something new. This guide shows you what you get and helps with any choices, one at a time.</p>
          ${D.multi ? `<div class="cs-card"><h4>Which class goes up?</h4><p class="cs-hint">You have more than one class. The new level goes to one of them.</p>
            <div class="cs-seg">${D.parts.map((x, i) => `<button data-g="part" data-v="${i}" class="${i === P.partIdx ? 'on' : ''}">${esc(x.c ? x.c.name : x.name)} ${x.lvl} → ${x.lvl + (i === P.partIdx ? 1 : 0)}</button>`).join('')}</div></div>` : ''}
          <div class="cs-card"><h4>What ${esc(c.name)} level ${newLvl} brings</h4><ul class="cg-list">
            <li><b>More hit points</b>, so you can take more hits.</li>
            ${A.pb !== D.pb ? `<li><b>Proficiency bonus +${D.pb} → +${A.pb}</b>: every attack, save and skill you're trained in gets better.</li>` : ''}
            ${P.needSub ? '<li><b>Your subclass</b>: you choose how your class specializes.</li>' : ''}
            ${P.asi ? '<li><b>Ability Score Improvement</b>: raise your scores, or take a feat.</li>' : ''}
            ${newFeatures().filter(f => !/^Ability Score Improvement$|Subclass$/i.test(f.name)).map(f => `<li>${esc(f.name)}</li>`).join('')}
            ${P.c.spellAbility && (spellPicks().nC || spellPicks().nP) ? '<li><b>New spells</b> to choose</li>' : ''}</ul></div>
          ${tip('Level up when your DM says so, usually at the end of a session or after a long rest. Nothing changes on your sheet until the last step.')}`;
      },

      hp: () => {
        const { c, avg, D } = P;
        return `<h2>Hit points</h2><p class="cs-hint">Your maximum hit points go up every level: one roll of your hit die (a d${c.hitDie} for a ${esc(c.name)}) plus your Constitution modifier (${sgn(D.md.con)}).</p>
          <div class="cg-picks">${card(st.rolled == null, 'hp', 'avg', '⚖', `Take the average: +${avg}`, 'Safe and steady. Most players do this.')}
          ${card(st.rolled != null, 'hp', 'roll', '🎲', st.rolled != null ? `You rolled: +${st.rolled}` : `Roll 1d${c.hitDie}${D.md.con ? sgn(D.md.con) : ''}`, st.rolled != null ? esc(st.roll) + ' · one roll per level, no rerolls' : 'Could be more than the average, or less.')}</div>
          <p>Maximum HP: <b>${D.maxHp ?? '—'} → ${(D.maxHp || 0) + (st.rolled != null ? st.rolled : avg)}</b></p>
          ${tip('Ask your DM whether your table rolls for hit points. If they don\'t say, take the average.')}`;
      },

      subclass: () => {
        const { c } = P, sc = subNow();
        return `<h2>Choose your subclass</h2><p class="cs-hint">Your subclass is your own take on being a ${esc(c.name)}. It gives you features now and at later levels, so pick the one that sounds most like your character.</p>
          <div class="cg-picks">${c.subclasses.map(x => card(x.name === st.subclass, 'sub', x.name, x.homebrew ? '★' : (CLASS_INFO[c.name] || ['🎲'])[0], x.name, esc(x.summary || ''))).join('')}</div>
          ${sc ? `<div class="cs-card"><h4>What ${esc(sc.name)} gives you</h4>${sc.features.filter(f => f.level === P.newLvl).map(f => feature(f, true)).join('')}
            ${sc.features.some(f => f.level > P.newLvl) ? `<p class="cs-hint">Later: ${sc.features.filter(f => f.level > P.newLvl).map(f => `${esc(f.name)} (level ${f.level})`).join(', ')}</p>` : ''}</div>` : ''}
          <label class="cs-field"><span>Or type one your DM allows</span><input data-gf="subtext" value="${esc(c.subclasses.some(x => x.name === st.subclass) ? '' : st.subclass)}" placeholder="Subclass name"></label>`;
      },

      asi: () => {
        const { D } = P, feats = CS.data().feats.filter(f => f.type === 'general' || f.type === 'origin' || (f.type === 'epic-boon' && P.D.lvl + 1 >= 19)).sort((x, y) => (x.type === 'general' ? 0 : 1) - (y.type === 'general' ? 0 : 1) || x.name.localeCompare(y.name));
        const sel = (k, skip) => `<select data-gf="${k}">${AB.filter(a => a !== skip).map(a => `<option value="${a}"${st[k] === a ? ' selected' : ''}${D.score[a] >= 20 ? ' disabled' : ''}>${AB_NAME[a]} (${D.score[a]})</option>`).join('')}</select>`;
        const odd = AB.filter(a => D.score[a] % 2 === 1 && D.score[a] < 20);
        return `<h2>Ability Score Improvement</h2><p class="cs-hint">You can raise your ability scores, or learn a <b>feat</b> instead: a special talent, like being extra tough or a sharpshooter.</p>
          <div class="cs-seg">${[['two', '+2 to one'], ['split', '+1 to two'], ['feat', 'A feat']].map(([k, l]) => `<button data-g="asi" data-v="${k}" class="${st.asi === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${st.asi === 'two' ? `<div class="cg-row">+2 ${sel('a')}</div>` : ''}
          ${st.asi === 'split' ? `<div class="cg-row">+1 ${sel('a')} +1 ${sel('b', st.a)}</div>` : ''}
          ${st.asi !== 'feat' ? `<div class="cg-abils">${AB.map(a => `<div class="cg-ab"><b>${AB_NAME[a]}</b><small>${ABOUT_AB[a]}</small><span></span>
            <span class="cg-final">${Math.min(20, D.score[a] + after(a))} <i>${sgn(mod(Math.min(20, D.score[a] + after(a))))}</i>${after(a) ? ` <em>(+${after(a)})</em>` : ''}</span></div>`).join('')}</div>
            ${tip(`${esc(P.c.name)}s get the most from <b>${AB_NAME[bestUp()]}</b>. A modifier only goes up at even scores${odd.length ? `, so your odd ones (${odd.map(a => AB_NAME[a]).join(', ')}) are worth a +1` : ''}. Scores can't go above 20.`)}`
          : `<div class="cg-picks">${feats.map(f => `<label class="cg-spell"><input type="radio" name="cg-feat" data-gf="feat" data-v="${esc(f.name)}"${st.feat === f.name ? ' checked' : ''}>
              <details><summary><b>${f.homebrew ? '★ ' : ''}${esc(f.name)}</b> <small>${esc(f.type.replace('-', ' '))} feat${f.prereq ? ' · needs ' + esc(f.prereq) : ''}</small></summary><div class="cs-dlg-text">${CS.fmt(f.desc || '')}</div></details></label>`).join('')}</div>
            <label class="cs-field"><span>Or type a feat your DM allows</span><input data-gf="feattext" value="${esc(feats.some(f => f.name === st.feat) ? '' : st.feat)}" placeholder="Feat name"></label>
            ${tip('Tap a feat\'s name to read it. Many feats also give +1 to an ability score; the sheet lists it under Features, and you can raise the score in ✏ Edit.')}`}`;
      },

      features: () => `<h2>New features</h2><p class="cs-hint">These are new things your character can do. They'll be on your <b>Features</b> tab; tap one there any time to read it again.</p>
        <div class="cs-card">${newFeatures().map((f, i) => feature(f, i < 3)).join('')}</div>
        ${tip('Features with uses (like "twice per Long Rest") get dots on the Actions tab so you can tick them off.')}`,

      spells: () => {
        const { cantrips, leveled, nC, nP, maxLv } = spellPicks(), nc = cantrips.filter(x => st.spells.has(x.name)).length, np = leveled.filter(x => st.spells.has(x.name)).length;
        const row = (x, full) => `<label class="cg-spell"><input type="checkbox" data-gf="spell" data-v="${esc(x.name)}"${st.spells.has(x.name) ? ' checked' : ''}${!st.spells.has(x.name) && full ? ' disabled' : ''}>
          <details><summary><b>${x.homebrew ? '★ ' : ''}${esc(x.name)}</b> <small>${x.level ? ord(x.level) + ' · ' : ''}${esc(x.school)}</small></summary><div class="cs-dlg-text">${CS.fmt(x.desc || '')}</div></details></label>`;
        return `<h2>New spells</h2><p class="cs-hint">Your magic grows: ${maxLv ? `you can now cast spells up to <b>${ord(maxLv)} level</b>. ` : ''}Choose your new spells. Tap a name to read it. You can skip this and add spells on the Spells tab later.</p>
          ${nC ? `<div class="cs-card"><h4>New cantrips <small>pick ${nC} · ${nc}/${nC}</small></h4>${cantrips.map(x => row(x, nc >= nC)).join('')}</div>` : ''}
          ${nP ? `<div class="cs-card"><h4>New prepared spells <small>pick ${nP} · ${np}/${nP}</small></h4>${leveled.slice().sort((x, y) => y.level - x.level || x.name.localeCompare(y.name)).map(x => row(x, np >= nP)).join('')}</div>` : ''}
          ${tip('Your highest-level spells are listed first. A spell that solves a problem (flying, healing, getting past a door) is often worth more than another damage spell.')}`;
      },

      done: () => {
        const { m, r } = build(), X = CS.derive(m, opts.live), D = P.D;
        return `<h2>Ready for level ${m.level}</h2>
          <div class="cs-tiles cs-tiles3"><div class="cs-tile"><b>${D.maxHp ?? '—'} → ${X.maxHp ?? '—'}</b><span>Max HP</span></div><div class="cs-tile"><b>+${X.pb}</b><span>Proficiency</span></div><div class="cs-tile"><b>${X.ac}</b><span>AC</span></div></div>
          <div class="cs-card"><h4>What changes</h4><ul class="cg-list">
            <li>${esc(r.cls)} level ${r.newLvl}: +${r.gain} hit points${r.rolled ? ' (rolled)' : ''}</li>
            ${st.subclass && P.needSub ? `<li>Subclass: <b>${esc(st.subclass)}</b></li>` : ''}
            ${r.asiText ? `<li>${esc(r.asiText)}</li>` : P.asi ? '<li>Ability Score Improvement: nothing chosen yet (you can go back)</li>' : ''}
            ${r.features.length ? `<li>New: ${esc(r.features.join(', '))}</li>` : ''}
            ${r.spells.length ? `<li>Spells: ${esc(r.spells.join(', '))}</li>` : ''}</ul></div>
          ${tip('Your DM sees a card saying you levelled up, with what you chose.')}
          <button class="cs-btn primary big" data-g="finish">⬆ Level up</button>`;
      },
    };
    function blocker(id) {
      if (id === 'subclass' && !st.subclass) return 'Choose a subclass';
      if (id === 'asi' && st.asi === 'feat' && !st.feat) return 'Choose a feat';
      return '';
    }
    function draw(keepScroll) {
      const list = steps(); st.step = Math.min(st.step, list.length - 1);
      const id = list[st.step], body = wrap.querySelector('.cg-body'), y = keepScroll && body ? body.scrollTop : 0;
      wrap.innerHTML = `<div class="cg-head"><div class="cg-dots">${list.slice(1).map((_, i) => `<i class="${i + 1 <= st.step ? 'on' : ''}"></i>`).join('')}</div><button class="cg-x" data-g="close">Close ✕</button></div>
        <div class="cg-body">${VIEWS[id]()}</div>
        ${id === 'done' && st.step ? `<div class="cg-foot"><button class="cs-btn" data-g="back">← Back</button><span class="cg-why"></span><span></span></div>`
          : `<div class="cg-foot">${st.step ? '<button class="cs-btn" data-g="back">← Back</button>' : '<span></span>'}<span class="cg-why">${esc(blocker(id))}</span><button class="cs-btn primary" data-g="next" ${blocker(id) ? 'disabled' : ''}>Next →</button></div>`}`;
      wrap.querySelector('.cg-body').scrollTop = y;
    }
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const g = b.dataset.g, v = b.dataset.v;
      if (g === 'close') { if (st.step === 0 || confirm('Stop levelling up? Nothing changes on your sheet.')) close(); return; }
      if (g === 'next') { if (!blocker(steps()[st.step])) st.step++; return draw(); }
      if (g === 'back') { st.step = Math.max(0, st.step - 1); return draw(); }
      if (g === 'finish') { const { m, r } = build(); close(); if (opts.onDone) opts.onDone(m, r); return; }
      if (g === 'part') { P = plan(Number(v)); Object.assign(st, { rolled: null, kept: null, roll: '', subclass: '', feat: '', spells: new Set() }); resetAsi(); }
      else if (g === 'hp') {
        // One roll per level: going back to the average and rolling again gives the same result.
        if (v === 'avg') st.rolled = null;
        else if (st.rolled == null) {
          if (st.kept == null) { const r = CS.rollDice(`1d${P.c.hitDie}${P.D.md.con ? sgn(P.D.md.con) : ''}`); st.kept = Math.max(1, r.total); st.roll = r.detail; }
          st.rolled = st.kept;
        }
      }
      else if (g === 'sub') st.subclass = v;
      else if (g === 'asi') { st.asi = v; if (v !== 'feat') st.feat = ''; }
      else return;
      draw(true);
    });
    wrap.addEventListener('change', (e) => {
      const t = e.target, f = t.dataset.gf; if (!f) return;
      if (f === 'a') { st.a = t.value; if (st.b === st.a) st.b = AB.find(x => x !== st.a && P.D.score[x] < 20) || ''; }
      else if (f === 'b') st.b = t.value;
      else if (f === 'feat') st.feat = t.dataset.v;
      else if (f === 'spell') { if (t.checked) st.spells.add(t.dataset.v); else st.spells.delete(t.dataset.v); }
      else return;
      draw(true);
    });
    wrap.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.gf === 'subtext') { st.subclass = t.value.trim().slice(0, 80); wrap.querySelectorAll('[data-g="sub"]').forEach(x => x.classList.remove('on')); }
      else if (t.dataset.gf === 'feattext') { st.feat = t.value.trim().slice(0, 80); wrap.querySelectorAll('[data-gf="feat"]').forEach(x => { x.checked = false; }); }
      else return;
      const id = steps()[st.step], nx = wrap.querySelector('[data-g="next"]'), why = wrap.querySelector('.cg-why');
      if (nx) nx.disabled = !!blocker(id);
      if (why) why.textContent = blocker(id);
    });
    draw();
    return { close };
  }
  return { open, levelUp };
})();
