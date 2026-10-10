// Quick NPC and monster generators.
window.Generators = (() => {
  const { h, pick, pickN, rand, clamp, cap, esc, sign, toast } = U;
  const N = NAMES;

  // ================= Monster generator =================
  const DMG_BY_WORD = [[/claw|rend|talon|blade|sword|scimitar|pincer|axe/i, 'Slashing'], [/bite|gore|spear|stinger|thorn|crossbow|rock(?!et)/i, 'Piercing'], [/slam|fist|club|mace|tail|stomp|piston|pseudopod/i, 'Bludgeoning']];
  const dmgType = (attack, fallback) => (DMG_BY_WORD.find(([re]) => re.test(attack)) || [null, fallback])[1];
  const dieFor = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 12 };
  const words2 = ['two', 'two', 'three', 'four'];

  const ALIGN = { Fiend: ['Lawful Evil', 'Chaotic Evil', 'Neutral Evil'], Celestial: ['Lawful Good', 'Neutral Good'], Undead: ['Neutral Evil', 'Chaotic Evil', 'Lawful Evil'],
    Beast: ['Unaligned'], Ooze: ['Unaligned'], Plant: ['Unaligned', 'Neutral'], Construct: ['Unaligned', 'Lawful Neutral'], Fey: ['Chaotic Neutral', 'Neutral', 'Chaotic Good'],
    Monstrosity: ['Unaligned', 'Neutral Evil', 'Chaotic Evil'], Dragon: ['Chaotic Evil', 'Lawful Evil', 'Neutral'], Aberration: ['Lawful Evil', 'Chaotic Evil', 'Neutral Evil'] };
  const ALIGN_ANY = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];

  const SPELLS = [
    [0, 'At Will: *Light*, *Mage Hand*, *Prestidigitation*\n1/Day Each: *Charm Person*, *Sleep*'],
    [3, 'At Will: *Mage Hand*, *Minor Illusion*, *Ray of Frost*\n2/Day Each: *Hold Person*, *Misty Step*, *Shield*\n1/Day: *Fireball*'],
    [7, 'At Will: *Detect Magic*, *Mage Hand*, *Fire Bolt*\n2/Day Each: *Counterspell*, *Fireball*, *Fly*\n1/Day Each: *Cone of Cold*, *Greater Invisibility*'],
    [12, 'At Will: *Detect Magic*, *Fire Bolt*, *Mage Hand*\n2/Day Each: *Counterspell*, *Fireball*, *Lightning Bolt*, *Scrying*\n1/Day Each: *Chain Lightning*, *Teleport*, *Globe of Invulnerability*'],
  ];

  function dice(target, die) {
    const n = Math.max(1, Math.round(target / ((die + 1) / 2)));
    return { n, avg: Math.floor(n * (die + 1) / 2), str: `${n}d${die}` };
  }

  function genMonster(o) {
    const T = SRD.TYPES[o.type] || SRD.TYPES.Monstrosity;
    const cr = String(o.cr), c = SRD.crNum(cr), pb = SRD.pb(cr), role = o.role, size = o.size;
    const name = (o.name || '').trim() || `${pick(T.words[0])} ${pick(T.words[1])}`;
    const n = name.toLowerCase();
    const pm = clamp(Math.round(1 + c * 0.3 + (c < 1 ? 0 : 1)), 0, 10); // primary modifier
    const atkAb = ['Skirmisher', 'Artillery', 'Lurker'].includes(role) ? 'dex' : 'str';
    const castAb = ['int', 'wis', 'cha'].includes(T.primary) ? T.primary : 'cha';
    const isCaster = role === 'Controller' || role === 'Leader';

    const sc = {};
    const sm = (m) => clamp(10 + 2 * m + rand(2), 1, 30);
    sc.str = sm(atkAb === 'str' ? pm : rand(Math.max(1, Math.ceil(pm / 2)) + 1) - 1);
    sc.dex = sm(atkAb === 'dex' ? pm : rand(Math.max(1, Math.ceil(pm / 2)) + 1) - 1);
    sc.con = sm(Math.round(pm * (role === 'Brute' ? 0.9 : 0.7)));
    const mental = ['int', 'wis', 'cha'];
    for (const a of mental) sc[a] = sm(rand(Math.ceil(pm / 2) + 2) - 1);
    if (isCaster) sc[castAb] = sm(pm);
    if (['Beast', 'Ooze', 'Plant'].includes(o.type)) sc.int = 1 + rand(4);
    if (o.type === 'Ooze') sc.cha = 1 + rand(3);
    if (size === 'Huge' || size === 'Gargantuan') sc.str = Math.max(sc.str, sm(pm + 1));
    // Make sure the attack stat really is the attack mod we planned.
    sc[atkAb] = 10 + 2 * pm + (sc[atkAb] % 2);
    const M = (a) => Math.floor((sc[a] - 10) / 2);
    const atk = pb + M(atkAb), dc = 8 + pb + M(isCaster ? castAb : (T.primary === 'con' ? 'con' : atkAb));

    // Defense
    let ac = c < 1 ? 11 + rand(3) : Math.round(12 + c / 3);
    ac += { Soldier: 2, Brute: -1, Skirmisher: 1 }[role] || 0;
    ac = clamp(ac, 10, 22);
    const lowHp = { 0: 3, 0.125: 7, 0.25: 11, 0.5: 18 };
    let hpT = c < 1 ? lowHp[c] : 15 * c + 12;
    hpT *= { Brute: 1.25, Soldier: 1.1, Artillery: 0.75, Skirmisher: 0.9, Lurker: 0.85 }[role] || 1;
    if (o.legendary) hpT *= 1.15;
    const hd = SRD.HIT_DIE[size], cm = M('con');
    const hdN = Math.max(1, Math.round(hpT / ((hd + 1) / 2 + cm)));
    const hp = Math.max(1, Math.floor(hdN * (hd + 1) / 2) + hdN * cm);

    // Offense
    let dpr = c < 1 ? { 0: 1, 0.125: 3, 0.25: 5, 0.5: 7 }[c] : 6 * c + 4;
    dpr *= { Brute: 1.15, Artillery: 1.1, Controller: 0.8, Leader: 0.85 }[role] || 1;
    const nAtk = c < 2 ? 1 : c < 6 ? 2 : c < 16 ? 2 + (role === 'Brute' ? 1 : 0) : 3;
    const die = dieFor[size];
    const atkM = M(atkAb);
    const reach = ['Large', 'Huge', 'Gargantuan'].includes(size) ? 10 : 5;
    const atkNames = pickN(T.attacks, 2);
    const actions = [];
    const mkAtk = (aName, ranged) => {
      const per = Math.max(1, dpr / nAtk - atkM);
      const d = dice(per, ranged ? 8 : die);
      const avg = Math.max(1, d.avg + atkM);
      const kind = ranged ? `*Ranged Attack Roll:* ${sign(atk)}, range ${c >= 5 ? '120/480' : '60/240'} ft.` : `*Melee Attack Roll:* ${sign(atk)}, reach ${reach} ft.`;
      return { name: aName, desc: `${kind} *Hit:* ${avg} (${d.str}${atkM ? ` ${atkM >= 0 ? '+' : '−'} ${Math.abs(atkM)}` : ''}) ${ranged ? T.dmg : dmgType(aName, T.dmg)} damage.` };
    };
    const main = role === 'Artillery' ? (o.type === 'Humanoid' ? 'Longbow' : `${T.dmg} Bolt`) : atkNames[0];
    if (nAtk > 1) {
      const second = role === 'Artillery' ? null : atkNames[1];
      actions.push({ name: 'Multiattack', desc: second && nAtk === 2 && second !== main
        ? `The ${n} makes one ${main} attack and one ${second} attack.`
        : `The ${n} makes ${words2[nAtk - 2]} ${main} attacks.` });
    }
    actions.push(mkAtk(main, role === 'Artillery'));
    if (nAtk > 1 && role !== 'Artillery' && atkNames[1] && atkNames[1] !== main) actions.push(mkAtk(atkNames[1], false));
    if (role === 'Artillery') actions.push(mkAtk(atkNames[0], false));

    const big = dice(Math.max(4, dpr * 0.9), c < 3 ? 6 : 8);
    const small = dice(Math.max(2, 2 + c), 6);
    const fill = (s) => s.replace(/\{n\}/g, n).replace(/\{dc\}/g, dc).replace(/\{atk\}/g, atk).replace(/\{d\}/g, `${big.avg} (${big.str})`).replace(/\{small\}/g, `${small.avg} (${small.str})`);
    if (isCaster && o.type === 'Humanoid') {
      const sp = [...SPELLS].reverse().find(([min]) => c >= min)[1];
      actions.push({ name: 'Spellcasting', desc: `The ${n} casts one of the following spells, requiring no Material components and using ${{ int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }[castAb]} as the spellcasting ability (spell save DC ${dc}):\n\n${sp}` });
    } else if (c >= 1 || isCaster) {
      // Area damage is only fair every few rounds.
      const needsRecharge = T.special[1].includes('{d}') && !/recharge|ranged/i.test(T.special[0]);
      actions.push({ name: T.special[0] + (needsRecharge ? ' (Recharge 5–6)' : ''), desc: fill(T.special[1]) });
    }

    const traits = pickN(T.traits, c >= 3 ? 2 : 1).map(([a, b]) => ({ name: a, desc: fill(b) }));
    if (o.legendary) traits.unshift({ name: `Legendary Resistance (${c >= 15 ? 4 : 3}/Day)`, desc: `If the ${n} fails a saving throw, it can choose to succeed instead.` });
    if (role === 'Lurker') traits.push({ name: 'Ambusher', desc: `The ${n} has Advantage on attack rolls against any creature that hasn't taken a turn yet in the combat. Once per turn, it deals an extra ${dice(Math.max(3, c * 3.5), 6).avg} (${dice(Math.max(3, c * 3.5), 6).str}) damage when it hits with Advantage.` });
    if (role === 'Brute') traits.push({ name: 'Brutal Momentum', desc: `If the ${n} moves at least 20 feet straight toward a target before hitting it, the attack deals an extra ${small.avg} (${small.str}) damage.` });

    const bonus = [], reactions = [];
    if (role === 'Skirmisher') bonus.push({ name: 'Nimble Escape', desc: `The ${n} takes the Disengage or Hide action.` });
    if (role === 'Leader') {
      bonus.push({ name: 'Commanding Shout', desc: `One ally within 30 feet that can hear the ${n} can use its Reaction to make one attack.` });
      reactions.push({ name: 'Leadership', desc: `*Trigger:* An ally within 30 feet makes an attack roll or saving throw. *Response:* The ally adds 1d4 to the roll.` });
    }
    if (role === 'Soldier') reactions.push({ name: 'Parry', desc: `*Trigger:* The ${n} is hit by a melee attack roll while holding a weapon. *Response:* The ${n} adds ${pb} to its AC against that attack, possibly causing it to miss.` });
    if (role === 'Controller' && !(isCaster && o.type === 'Humanoid')) bonus.push({ name: 'Hindering Gaze', desc: `One creature the ${n} can see within 60 feet must succeed on a DC ${dc} Wisdom saving throw or its Speed is halved until the end of its next turn.` });

    const sb = {
      name, size, type: o.type, alignment: pick(ALIGN[o.type] || ALIGN_ANY),
      ac, ...(ac >= 15 && ['Humanoid', 'Giant'].includes(o.type) ? { ac_note: ac >= 18 ? 'plate armor' : 'chain shirt, shield' } : ac > 12 ? { ac_note: 'natural armor' } : {}),
      hp, hit_dice: `${hdN}d${hd}${cm ? ` ${cm > 0 ? '+' : '−'} ${Math.abs(hdN * cm)}` : ''}`,
      speed: speedFor(o.type, size, role),
      ...sc,
    };
    sb.saves = c >= 3 ? [atkAb, 'con', ...(isCaster ? [castAb] : [])].filter((v, i, a) => a.indexOf(v) === i) : undefined;
    const skills = [`Perception ${sign(M('wis') + pb)}`];
    if (['Lurker', 'Skirmisher'].includes(role)) skills.push(`Stealth ${sign(M('dex') + pb * (role === 'Lurker' ? 2 : 1))}`);
    if (role === 'Leader') skills.push(`Persuasion ${sign(M('cha') + pb)}`);
    sb.skills = skills.join(', ');
    if (T.res) sb.resistances = T.res;
    if (T.imm) sb.immunities = T.imm;
    if (T.cimm) sb.condition_immunities = T.cimm;
    sb.senses = T.senses === 'Passive Perception only' || T.senses === '—' ? undefined : T.senses;
    sb.passive = 10 + M('wis') + pb;
    sb.languages = T.langs;
    sb.cr = cr;
    sb.traits = traits;
    sb.actions = actions;
    if (bonus.length) sb.bonus_actions = bonus;
    if (reactions.length) sb.reactions = reactions;
    if (o.legendary) {
      sb.legendary_desc = `*Legendary Action Uses:* 3. Immediately after another creature's turn, the ${n} can expend a use to take one of the following actions. The ${n} regains all expended uses at the start of each of its turns.`;
      sb.legendary_actions = [
        { name: 'Strike', desc: `The ${n} makes one ${main} attack.` },
        { name: 'Shift', desc: `The ${n} moves up to half its Speed without provoking Opportunity Attacks.` },
        { name: `Overwhelm (Costs 2 Uses)`, desc: `Each creature within 10 feet of the ${n} must succeed on a DC ${dc} Strength saving throw or have the Prone condition.` },
      ];
    }
    Object.keys(sb).forEach(k => sb[k] === undefined && delete sb[k]);
    return sb;
  }

  function speedFor(type, size, role) {
    const base = size === 'Tiny' ? 20 : size === 'Small' ? 25 : size === 'Medium' ? 30 : 40;
    const fast = role === 'Skirmisher' ? 10 : 0;
    const extra = { Dragon: `, Fly ${base * 2} ft.`, Celestial: `, Fly ${base + 20} ft.`, Elemental: pick(['', `, Fly ${base + 30} ft. (hover)`, `, Burrow ${base} ft.`, `, Swim ${base + 10} ft.`]),
      Fiend: pick(['', `, Fly ${base + 10} ft.`]), Fey: pick(['', `, Fly ${base} ft.`]), Ooze: ', Climb 10 ft.', Monstrosity: pick(['', `, Climb ${base} ft.`, `, Burrow 20 ft.`]),
      Aberration: pick(['', `, Fly 20 ft. (hover)`, `, Swim ${base} ft.`]), Beast: pick(['', `, Climb ${base} ft.`, `, Swim ${base} ft.`]) }[type] || '';
    if (type === 'Ooze') return `10 ft.${extra}`;
    return `${base + fast} ft.${extra}`;
  }

  // ================= NPC generator =================
  const AGES = ['young', 'adult', 'adult', 'middle-aged', 'middle-aged', 'old', 'venerable'];
  const ROLE_STATS = [
    [/guard|watch|soldier|knight/i, { role: 'Soldier', cr: (o) => /knight|captain/.test(o) ? '3' : '1/8' }],
    [/mercenary|sellsword|pit fighter|bounty/i, { role: 'Brute', cr: () => '2' }],
    [/thief|smuggler|spy|fence|urchin/i, { role: 'Lurker', cr: (o) => /spy/.test(o) ? '1' : '1/8' }],
    [/wizard|alchemist|sage|fortune|cultist/i, { role: 'Controller', cr: (o) => /cultist/.test(o) ? '1/8' : '2' }],
    [/priest|acolyte|noble|courtier|magistrate|captain|master/i, { role: 'Leader', cr: (o) => /acolyte|courtier/.test(o) ? '1/4' : '1' }],
    [/hunter|ranger|scout/i, { role: 'Artillery', cr: () => '1/2' }],
    [/retired adventurer|monk/i, { role: 'Skirmisher', cr: () => '3' }],
  ];

  function genNPC(o = {}) {
    const species = o.species && o.species !== 'Any' ? o.species : pick(Object.keys(N.species));
    const S = N.species[species];
    const g = o.gender && o.gender !== 'Any' ? o.gender : pick(['masc', 'fem', 'masc', 'fem', 'neut']);
    const first = pick(S[g] || S.masc), last = pick(S.last);
    const ideal = pick(N.ideals);
    const ethic = ideal[2] === 'Lawful' || ideal[2] === 'Chaotic' ? ideal[2] : pick(['Lawful', 'Neutral', 'Chaotic']);
    const moral = ideal[2] === 'Good' || ideal[2] === 'Evil' ? ideal[2] : pick(['Good', 'Neutral', 'Neutral', 'Evil']);
    return {
      name: last ? `${first} ${last}` : first,
      species, pronouns: { masc: 'he/him', fem: 'she/her', neut: 'they/them' }[g], gender: g,
      age: pick(AGES),
      occupation: o.occupation || pick(N.occupations),
      appearance: pickN(N.appearance, 2),
      personality: pick(N.personality),
      ideal: `${ideal[0]}. ${ideal[1]}`,
      alignment: ethic === 'Neutral' && moral === 'Neutral' ? 'Neutral' : `${ethic} ${moral}`,
      bond: pick(N.bonds), flaw: pick(N.flaws), mannerism: pick(N.mannerisms), voice: pick(N.voice),
      secret: pick(N.secrets), hook: pick(N.hooks),
    };
  }
  const REROLL = {
    name: (p) => { const S = N.species[p.species]; const f = pick(S[p.gender] || S.masc), l = pick(S.last); return l ? `${f} ${l}` : f; },
    occupation: () => pick(N.occupations), appearance: () => pickN(N.appearance, 2), personality: () => pick(N.personality),
    ideal: () => { const i = pick(N.ideals); return `${i[0]}. ${i[1]}`; }, bond: () => pick(N.bonds), flaw: () => pick(N.flaws),
    mannerism: () => pick(N.mannerisms), voice: () => pick(N.voice), secret: () => pick(N.secrets), hook: () => pick(N.hooks), age: () => pick(AGES),
  };

  function npcStatblock(p, mode) {
    if (mode === 'none') return null;
    let role = 'Soldier', cr = '0';
    if (mode === 'auto') {
      const hit = ROLE_STATS.find(([re]) => re.test(p.occupation));
      if (hit) { role = hit[1].role; cr = hit[1].cr(p.occupation); } else { role = 'Soldier'; cr = '0'; }
    } else cr = mode;
    const sb = genMonster({ name: p.name, cr, type: 'Humanoid', size: ['Halfling', 'Gnome'].includes(p.species) ? 'Small' : 'Medium', role });
    // Named people are "Helja", not "the helja fireforge".
    const first = p.name.split(' ')[0];
    const lower = p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const key of ['traits', 'actions', 'bonus_actions', 'reactions']) {
      (sb[key] || []).forEach(e => { e.desc = e.desc.replace(new RegExp(`\\b[Tt]he ${lower}('s)?\\b`, 'g'), (_, poss) => first + (poss || '')); });
    }
    sb.type = `Humanoid (${p.species})`;
    sb.alignment = p.alignment;
    if (cr === '0') { sb.actions = [{ name: 'Club', desc: `*Melee Attack Roll:* +2, reach 5 ft. *Hit:* 2 (1d4) Bludgeoning damage.` }]; delete sb.traits; delete sb.bonus_actions; delete sb.reactions; }
    sb.languages = `Common, ${{ Elf: 'Elvish', Dwarf: 'Dwarvish', Halfling: 'Halfling', Gnome: 'Gnomish', Orc: 'Orc', Tiefling: 'Infernal', Dragonborn: 'Draconic', Goliath: 'Giant' }[p.species] || 'one other language'}`;
    return sb;
  }

  function npcNote(p, sb) {
    return `---
type: npc
tags: [npc, ${p.species.toLowerCase()}]
species: ${p.species}
occupation: ${p.occupation}
pronouns: ${p.pronouns}
alignment: ${p.alignment}
status: alive
---
# ${p.name}

**Species & Occupation:** ${p.age} ${p.species.toLowerCase()} ${p.occupation} (${p.pronouns})
**High Concept:** A ${p.personality} ${p.occupation} who ${p.bond}.
**Role in the Story:**

## Appearance
${p.appearance.map(a => '- ' + cap(a)).join('\n')}

## Roleplaying
| | |
|---|---|
| **Personality** | ${cap(p.personality)} |
| **Ideal** | ${p.ideal} |
| **Bond** | ${cap(p.bond)} |
| **Flaw** | ${cap(p.flaw)} |
| **Mannerism** | ${cap(p.mannerism)} |
| **Voice** | ${cap(p.voice)} |

> [!secret] DM Only
> ${cap(p.secret)}.

## Plot Hooks
- ${cap(p.hook)}.
${sb ? '\n## Statistics\n' + Statblock.fence(sb) + '\n' : ''}
## Notes
`;
  }

  function monsterNote(sb, o) {
    return `---
type: monster
tags: [monster, ${String(sb.type).split(' ')[0].toLowerCase()}]
cr: '${sb.cr}'
role: ${o.role}
environment:
---
# ${sb.name}

*Describe what this ${String(sb.type).toLowerCase()} looks like and where it lurks.*

${Statblock.fence(sb)}
## Tactics
- **Role:** ${o.role}. ${SRD.ROLES[o.role]}

## Lore
`;
  }

  // ================= UI =================
  let npc = null, npcSb = null, mon = null, monOpts = null;

  function mount(root) {
    const tabs = h('div.tabs');
    const panes = h('div.tab-panes');
    const addTab = (id, label, pane) => {
      const b = h('button.tab', { onclick: () => { U.$$('.tab', tabs).forEach(t => t.classList.remove('on')); U.$$('.tab-pane', panes).forEach(p => p.classList.remove('on')); b.classList.add('on'); pane.classList.add('on'); } }, label);
      tabs.append(b); panes.append(pane);
      return b;
    };
    addTab('npc', '🧑 NPC Generator', npcPane()).click();
    addTab('monster', '🐉 Monster Generator', monsterPane());
    addTab('names', '🔤 Quick Names', namesPane());
    root.append(h('div.page', h('header.page-head', h('h1', 'Generators'), tabs), panes));
  }

  function npcPane() {
    const species = h('select', ['Any', ...Object.keys(N.species)].map(s => h('option', s)));
    const gender = h('select', [['Any', 'Any'], ['masc', 'Masculine name'], ['fem', 'Feminine name'], ['neut', 'Neutral name']].map(([v, l]) => h('option', { value: v }, l)));
    const occ = h('input', { placeholder: 'Any occupation', list: 'occ-list' });
    const occList = h('datalist#occ-list', N.occupations.map(o => h('option', { value: o })));
    const stats = h('select', [['none', 'No stat block'], ['auto', 'Stat block from occupation'], ...['0', '1/8', '1/4', '1/2', '1', '2', '3', '5', '8', '10'].map(c => [c, `Stat block CR ${c}`])].map(([v, l]) => h('option', { value: v }, l)));
    const out = h('div.gen-out');
    const gen = () => { npc = genNPC({ species: species.value, gender: gender.value, occupation: occ.value.trim() }); npcSb = npcStatblock(npc, stats.value); draw(); };
    const draw = () => {
      const row = (label, key, val) => h('div.npc-row', h('span.k', label), h('span.v', val ?? (Array.isArray(npc[key]) ? npc[key].map(cap).join('; ') : cap(npc[key]))),
        REROLL[key] ? h('button.reroll', { title: 'Reroll', onclick: () => { npc[key] = REROLL[key](npc); if (key === 'name' && npcSb) npcSb.name = npc.name; draw(); } }, '🎲') : h('span'));
      out.innerHTML = '';
      out.append(h('div.card.npc-card',
        h('div.npc-name', npc.name, h('button.reroll', { title: 'Reroll name', onclick: () => { npc.name = REROLL.name(npc); if (npcSb) npcSb.name = npc.name; draw(); } }, '🎲')),
        h('div.npc-sub', `${cap(npc.age)} ${npc.species} ${npc.occupation} · ${npc.pronouns} · ${npc.alignment}`),
        row('Occupation', 'occupation'), row('Age', 'age'), row('Appearance', 'appearance'), row('Personality', 'personality'), row('Ideal', 'ideal'), row('Bond', 'bond'),
        row('Flaw', 'flaw'), row('Mannerism', 'mannerism'), row('Voice', 'voice'), row('Secret', 'secret'), row('Plot hook', 'hook'),
        h('div.row',
          h('button.primary', { onclick: async () => { await Notes.create(npc.name, npcNote(npc, npcSb), null, 'NPCs'); toast('Saved to NPCs'); } }, '💾 Save to Notes'),
          npcSb ? h('button', { onclick: () => Initiative.addFromStatblock(npcSb) }, '⏳ Add to initiative') : null,
          h('button', { onclick: () => Tokens.quick(npc.name) }, '🪙 Make token'),
          h('button', { onclick: () => U.copy(npcNote(npc, npcSb)) }, '📋 Copy markdown'))),
        npcSb ? h('div', { html: Statblock.render(npcSb) }) : null);
    };
    const pane = h('div.tab-pane.gen-layout',
      h('div.card.gen-form', h('h3', 'Options'),
        h('label.field', h('span', 'Species'), species), h('label.field', h('span', 'Name style'), gender),
        h('label.field', h('span', 'Occupation'), occ, occList), h('label.field', h('span', 'Statistics'), stats),
        h('button.primary.big', { onclick: gen }, '🎲 Generate NPC'),
        h('p.hint', 'Click 🎲 next to any line to reroll just that part.')),
      out);
    setTimeout(gen, 0);
    return pane;
  }

  function monsterPane() {
    const name = h('input', { placeholder: 'Random if blank' });
    const cr = h('select', SRD.CRS.map(c => h('option', { value: c, selected: c === '2' }, `CR ${c}`)));
    const type = h('select', Object.keys(SRD.TYPES).map(t => h('option', { selected: t === 'Undead' }, t)));
    const size = h('select', SRD.SIZES.map(s => h('option', { selected: s === 'Medium' }, s)));
    const role = h('select', Object.entries(SRD.ROLES).map(([r, d]) => h('option', { value: r, title: d }, `${r} — ${d}`)));
    const legendary = h('input', { type: 'checkbox' });
    const out = h('div.gen-out');
    const gen = () => {
      monOpts = { name: name.value, cr: cr.value, type: type.value, size: size.value, role: role.value, legendary: legendary.checked };
      mon = genMonster(monOpts); draw();
    };
    const draw = () => {
      out.innerHTML = '';
      out.append(h('div.row',
        h('button.primary', { onclick: async () => { await Notes.create(mon.name, monsterNote(mon, monOpts), null, 'Bestiary'); toast('Saved to Bestiary'); } }, '💾 Save to Bestiary'),
        h('button', { onclick: () => Statblock.openBuilder(mon, (sb) => { mon = sb; draw(); }) }, '✏ Edit'),
        h('button', { onclick: () => Initiative.addFromStatblock(mon) }, '⏳ Add to initiative'),
        h('button', { onclick: () => Tokens.quick(mon.name) }, '🪙 Make token'),
        h('button', { onclick: () => U.copy(Statblock.fence(mon)) }, '📋 Copy')),
        h('div', { html: Statblock.render(mon) }));
    };
    const pane = h('div.tab-pane.gen-layout',
      h('div.card.gen-form', h('h3', 'Options'),
        h('label.field', h('span', 'Name'), name), h('label.field', h('span', 'Challenge rating'), cr),
        h('label.field', h('span', 'Creature type'), type), h('label.field', h('span', 'Size'), size),
        h('label.field', h('span', 'Combat role'), role), h('label.chk', legendary, ' Legendary (adds Legendary Resistance & Actions)'),
        h('button.primary.big', { onclick: gen }, '🎲 Generate Monster'),
        h('p.hint', 'Numbers follow typical 5e values for the chosen CR (AC, HP, attack bonus, damage per round, save DC). Tweak with ✏ Edit.')),
      out);
    setTimeout(gen, 0);
    return pane;
  }

  function namesPane() {
    const out = h('div.names-grid');
    const TAVERN_A = ['Prancing', 'Rusty', 'Drunken', 'Gilded', 'Sleeping', 'Laughing', 'Crooked', 'Salty', 'Wandering', 'Silver', 'Broken', 'Jolly', 'Howling', 'Golden'];
    const TAVERN_B = ['Pony', 'Dragon', 'Griffon', 'Flagon', 'Barrel', 'Goblin', 'Mermaid', 'Stag', 'Lantern', 'Anchor', 'Boar', 'Raven', 'Tankard', 'Wyvern'];
    const TOWN_A = ['Oak', 'Raven', 'Stone', 'Mill', 'Ash', 'Thorn', 'Elder', 'Frost', 'Wolf', 'Briar', 'Iron', 'Salt', 'Black', 'Green'];
    const TOWN_B = ['ford', 'brook', 'haven', 'wick', 'stead', 'hollow', 'moor', 'vale', 'barrow', 'gate', 'fall', 'reach', 'mere', 'crest'];
    const gen = () => {
      out.innerHTML = '';
      const col = (title, items) => h('div.card', h('h3', title), h('ul.name-list', items.map(i => h('li', { onclick: () => U.copy(i), title: 'Click to copy' }, i))));
      out.append(
        col('People', Array.from({ length: 10 }, () => { const p = genNPC(); return `${p.name} (${p.species})`; })),
        col('Taverns & Inns', Array.from({ length: 10 }, () => `The ${pick(TAVERN_A)} ${pick(TAVERN_B)}`)),
        col('Towns & Villages', Array.from({ length: 10 }, () => pick(TOWN_A) + pick(TOWN_B))),
        col('Monsters', Array.from({ length: 10 }, () => { const T = SRD.TYPES[pick(Object.keys(SRD.TYPES))]; return `${pick(T.words[0])} ${pick(T.words[1])}`; })));
    };
    setTimeout(gen, 0);
    return h('div.tab-pane', h('div.row', h('button.primary', { onclick: gen }, '🎲 Generate names'), h('span.hint', 'Click any name to copy it.')), out);
  }

  // An NPC as a section to drop inside another note (no properties, headings one level down).
  const npcSection = (p) => MD.splitFrontmatter(npcNote(p, null)).body.replace(/^(#{1,5}) /gm, '#$1 ').trim();

  return { mount, genMonster, genNPC, npcSection };
})();
