import json, sys, re
D, OUT = sys.argv[1], sys.argv[2]
L = lambda f: json.load(open(f"{D}/{f}.json"))
cap = lambda s: s[:1].upper() + s[1:] if s else s
title = lambda s: ' '.join(w.capitalize() for w in s.split())
CR = {0.125: '1/8', 0.25: '1/4', 0.5: '1/2'}
ITAL = re.compile(r'(Melee or Ranged Attack Roll:|Melee Attack Roll:|Ranged Attack Roll:|Hit or Miss:|Hit:|Miss:|Failure or Success:|Failure:|Success:|First Failure:|Second Failure:|Trigger:|Response:|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:)')
ital = lambda s: ITAL.sub(lambda m: f'*{m.group(1)}*', s or '')
def entries(lst):
    return [{'name': e['name'], 'desc': ital(e.get('desc', ''))} for e in (lst or []) if e.get('name')]

monsters = []
for x in L('2024-Monsters'):
    sb = {'name': x['name'], 'size': x['size'], 'type': cap(x['type']), 'alignment': title(x['alignment'])}
    ac = x['armor_class'][0]; sb['ac'] = ac['value']
    hp_roll = (x.get('hit_points_roll') or x.get('hit_dice') or '').replace('+', ' + ').replace('-', ' − ')
    sb['hp'] = x['hit_points']; sb['hit_dice'] = hp_roll
    sp = x['speed']; parts = []
    for k, v in sp.items():
        if k == 'hover': continue
        parts.append(v if k == 'walk' else f"{cap(k)} {v}")
    sb['speed'] = ', '.join(parts) + (' (hover)' if sp.get('hover') else '')
    for a, k in zip(['strength','dexterity','constitution','intelligence','wisdom','charisma'], ['str','dex','con','int','wis','cha']): sb[k] = x[a]
    saves = [p['proficiency']['name'].split(': ')[1].lower() for p in x['proficiencies'] if p['proficiency']['name'].startswith('Saving')]
    if saves: sb['saves'] = saves
    skills = [f"{p['proficiency']['name'].split(': ')[1]} +{p['value']}" for p in x['proficiencies'] if p['proficiency']['name'].startswith('Skill')]
    if skills: sb['skills'] = ', '.join(skills)
    for src, dst in [('damage_vulnerabilities','vulnerabilities'),('damage_resistances','resistances'),('damage_immunities','immunities')]:
        if x[src]: sb[dst] = ', '.join(cap(v) for v in x[src])
    if x['condition_immunities']: sb['condition_immunities'] = ', '.join(c['name'] for c in x['condition_immunities'])
    if x.get('gear'): sb['gear'] = x['gear']
    sen = [f"{cap(k)} {v}" for k, v in x['senses'].items() if k != 'passive_perception']
    if sen: sb['senses'] = ', '.join(sen)
    sb['passive'] = x['senses'].get('passive_perception', 10)
    sb['languages'] = x['languages'] or '—'
    sb['cr'] = CR.get(x['challenge_rating'], str(int(x['challenge_rating'])))
    for src, dst in [('special_abilities','traits'),('actions','actions'),('bonus_actions','bonus_actions'),('reactions','reactions'),('legendary_actions','legendary_actions')]:
        e = entries(x.get(src))
        if e: sb[dst] = e
    if sb.get('legendary_actions'):
        sb['legendary_desc'] = f"Immediately after another creature's turn, the {x['name'].lower()} can expend a use to take one of the following actions. It regains all expended uses at the start of each of its turns."
    monsters.append(sb)

spells = [{'name': s['name'], 'level': s['level'], 'school': s['school']['name'], 'time': s['casting_time'], 'range': s['range'],
           'comp': ', '.join(s['components']) + (f" ({s['material']})" if s.get('material') else ''), 'dur': s['duration'],
           'conc': s['concentration'], 'ritual': s['ritual'], 'classes': [c['name'] for c in s['classes']],
           'desc': s['description'] if isinstance(s['description'], str) else '\n\n'.join(s['description']),
           'higher': ' '.join(s['higher_level']) if isinstance(s.get('higher_level'), list) else (s.get('higher_level') or '')} for s in L('2024-Spells')]
items = [{'name': i['name'], 'rarity': i['rarity']['name'], 'type': i['equipment_category']['name'], 'desc': i['desc'] if isinstance(i['desc'], str) else '\n\n'.join(i['desc'])} for i in L('2024-Magic-Items')]
conditions = [{'name': c['name'], 'desc': c['description'] if isinstance(c['description'], str) else '\n'.join(c['description'])} for c in L('2024-Conditions')]
rules = [{'name': r['name'], 'desc': r['desc']} for r in L('2014-Rule-Sections')]

data = {'attribution': 'This work includes material from the System Reference Document 5.2 ("SRD 5.2") and SRD 5.1 by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD is licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). Data via the 5e-bits/5e-database project (MIT).',
        'conditions': conditions, 'spells': spells, 'items': items, 'monsters': monsters, 'rules': rules}
with open(OUT, 'w') as f:
    f.write('// Generated from the 5e SRD (CC-BY-4.0) via 5e-bits/5e-database. Do not edit by hand.\n')
    f.write('window.SRDREF = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(monsters), len(spells), len(items), len(conditions), len(rules))
