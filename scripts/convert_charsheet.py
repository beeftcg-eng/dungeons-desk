# Builds shared/charsheet-data.js (classes, species, backgrounds, feats, equipment, spells, magic items)
# from the 2024 SRD files of 5e-bits/5e-database. Used by the character sheet on phones and in the DM app.
# Usage: python3 scripts/convert_charsheet.py <folder with 2024-*.json> shared/charsheet-data.js
# The files are 5e-database's src/2024/en/5e-SRD-<Name>.json saved as 2024-<Name>.json.
import json, sys, re
D, OUT = sys.argv[1], sys.argv[2]
L = lambda f: json.load(open(f"{D}/2024-{f}.json"))
# The SRD PDF text keeps line-break hyphens ("ex- pended"); join them back up.
fix = lambda s: re.sub(r'([a-z])- ([a-z])', r'\1\2', s or '').strip()
text = lambda d: fix(d if isinstance(d, str) else '\n\n'.join(d or []))
ABIL = {'STR': 'str', 'DEX': 'dex', 'CON': 'con', 'INT': 'int', 'WIS': 'wis', 'CHA': 'cha'}
SKILLS = {s['name']: ABIL[s['ability_score']['name']] for s in L('Skills')}

features = {f['index']: f for f in L('Features')}
equipment = {e['index']: e for e in L('Equipment')}

def equip_options(opts):
    # Each choice is {label, items: [{name, count}], gp}; "(a) … or (b) 75 GP" style.
    out = []
    for o in opts or []:
        choices = []
        for i, opt in enumerate(o['from'].get('options', [])):
            parts = opt['items'] if opt['option_type'] == 'multiple' else [opt]
            items, gp = [], 0
            for p in parts:
                if p['option_type'] == 'money': gp += p['count'] if p['unit'] == 'gp' else 0
                elif p['option_type'] == 'counted_reference':
                    nm = p['of']['name'] + (f" ({p['of']['note']})" if p['of'].get('note') else '')
                    items.append({'name': nm, 'ref': p['of']['name'], 'count': p['count']})
            choices.append({'label': chr(65 + i), 'items': items, 'gp': gp})
        out.append({'desc': o['desc'], 'choices': choices})
    return out

levels = {}
for l in L('Levels'):
    if l.get('subclass'): continue
    levels.setdefault(l['class']['index'], []).append(l)

subclasses = {}
for s in L('Subclasses'):
    subclasses.setdefault(s['class']['index'], []).append({'name': s['name'], 'summary': s.get('summary', ''),
        'features': [{'name': f['name'], 'level': f['level'], 'desc': fix(f['description'])} for f in s['features']]})

classes = []
for c in L('Classes'):
    profs = [p['name'] for p in c['proficiencies'] if not p['name'].startswith('Saving Throw')]
    ch = (c.get('proficiency_choices') or [{}])[0]
    skill_from = [o['item']['name'].replace('Skill: ', '') for o in ch.get('from', {}).get('options', []) if o.get('item', {}).get('name', '').startswith('Skill: ')]
    lv = []
    for l in sorted(levels[c['index']], key=lambda l: l['level']):
        sc = l.get('spellcasting')
        e = {'pb': l['prof_bonus'], 'features': [{'name': f['name'], 'desc': text(features.get(f['index'], {}).get('description', ''))} for f in l['features']]}
        if sc:
            slots = [sc.get(f'spell_slots_level_{i}', 0) for i in range(1, 10)]
            while slots and not slots[-1]: slots.pop()
            e['slots'] = slots
            e['cantrips'] = sc.get('cantrips_known', 0)
            e['prepared'] = sc.get('prepared_spells', 0)
        if l.get('class_specific'): e['specific'] = l['class_specific']
        lv.append(e)
    sp = c.get('spellcasting')
    classes.append({'name': c['name'], 'hitDie': c['hit_die'], 'saves': [ABIL[s['name']] for s in c['saving_throws']],
                    'primary': c['primary_ability']['desc'], 'profs': profs, 'skillChoose': ch.get('choose', 0), 'skillFrom': skill_from,
                    'spellAbility': ABIL[sp['spellcasting_ability']['name']] if sp else None,
                    'equipment': equip_options(c.get('starting_equipment_options')), 'levels': lv,
                    'multiProfs': [p['name'] for p in (c.get('multi_classing') or {}).get('proficiencies', [])],
                    'subclasses': subclasses.get(c['index'], [])})

traits = {t['index']: t for t in L('Traits')}
subspecies = {s['index']: s for s in L('Subspecies')}
species = []
for s in L('Species'):
    species.append({'name': s['name'], 'size': s.get('size') or ' or '.join(o['size'] for o in s.get('size_options', {}).get('from', {}).get('options', [])) or 'Medium', 'speed': s['speed'], 'type': s.get('type', 'Humanoid'),
                    'traits': [{'name': t['name'], 'desc': text(traits.get(t['index'], {}).get('description', ''))} for t in s.get('traits', [])],
                    'subspecies': [{'name': subspecies[x['index']]['name'],
                                    'traits': [{'name': t['name'], 'level': t.get('level', 1), 'desc': text(traits.get(t['index'], {}).get('description', ''))} for t in subspecies[x['index']].get('traits', [])]}
                                   for x in s.get('subspecies', []) if x['index'] in subspecies]})

backgrounds = []
for b in L('Backgrounds'):
    backgrounds.append({'name': b['name'], 'abilities': [ABIL[a['name']] for a in b.get('ability_scores', [])],
                        'feat': (b['feat']['name'] + (f" ({b['feat']['note']})" if b['feat'].get('note') else '')) if b.get('feat') else None,
                        'skills': [p['name'].replace('Skill: ', '') for p in b.get('proficiencies', []) if p['name'].startswith('Skill: ')],
                        'tools': [p['name'].replace('Tool: ', '') for p in b.get('proficiencies', []) if not p['name'].startswith('Skill: ')],
                        'equipment': equip_options(b.get('equipment_options'))})

feats = [{'name': f['name'], 'type': f.get('type', ''), 'desc': text(f.get('description', ''))} for f in L('Feats')]

def kind(e):
    cats = {c['index'] for c in e.get('equipment_categories', [])}
    if 'shields' in cats: return 'shield'
    if 'armor' in cats: return 'armor'
    if 'weapons' in cats or 'melee-weapons' in cats or 'ranged-weapons' in cats: return 'weapon'
    if 'ammunition' in cats: return 'ammo'
    if cats & {'artisans-tools', 'other-tools', 'gaming-sets', 'musical-instruments'}: return 'tool'
    return 'gear'

gear = []
for e in L('Equipment'):
    cats = {c['index'] for c in e.get('equipment_categories', [])}
    g = {'name': e['name'], 'kind': kind(e)}
    if e.get('weight'): g['weight'] = e['weight']
    if e.get('cost'): g['cost'] = f"{e['cost']['quantity']} {e['cost']['unit']}"
    if e.get('damage'):
        g['dmg'] = e['damage']['damage_dice']; g['dmgType'] = e['damage']['damage_type']['name']
    if e.get('two_handed_damage'): g['versatile'] = e['two_handed_damage']['damage_dice']
    if e.get('range') and g['kind'] == 'weapon':
        r = e['range']; g['range'] = f"{r['normal']}/{r['long']}" if r.get('long') else str(r.get('normal', 5))
    if e.get('throw_range'): g['thrown'] = f"{e['throw_range']['normal']}/{e['throw_range']['long']}"
    if e.get('properties'): g['props'] = [p['name'] for p in e['properties']]
    if e.get('mastery'): g['mastery'] = e['mastery']['name']
    if g['kind'] == 'weapon':
        g['martial'] = bool(cats & {'martial-weapons', 'martial-melee-weapons', 'martial-ranged-weapons'})
        g['ranged'] = bool(cats & {'ranged-weapons', 'simple-ranged-weapons', 'martial-ranged-weapons'})
    if e.get('armor_class'):
        a = e['armor_class']; g['ac'] = a['base']
        if g['kind'] == 'armor':
            g['armorType'] = 'Heavy' if 'heavy-armor' in cats else 'Medium' if 'medium-armor' in cats else 'Light'
            g['dex'] = bool(a.get('dex_bonus')); g['maxDex'] = a.get('max_bonus')
            if e.get('stealth_disadvantage'): g['stealthDis'] = True
            if e.get('str_minimum'): g['strMin'] = e['str_minimum']
    if e.get('contents'): g['contents'] = [{'name': c['item']['name'], 'count': c['quantity']} for c in e['contents']]
    d = text(e.get('description') or e.get('desc'))
    if d: g['desc'] = d
    gear.append(g)

spells = []
for s in L('Spells'):
    sp = {'name': s['name'], 'level': s['level'], 'school': s['school']['name'], 'time': s['casting_time'], 'range': s['range'],
          'comp': ', '.join(s['components']) + (f" ({s['material']})" if s.get('material') else ''), 'dur': s['duration'],
          'classes': [c['name'] for c in s['classes']], 'desc': text(s['description'])}
    if s['concentration']: sp['conc'] = True
    if s['ritual']: sp['ritual'] = True
    h = text(s.get('higher_level')) if isinstance(s.get('higher_level'), list) else fix(s.get('higher_level') or '')
    if h: sp['higher'] = h
    if s.get('attack_type'): sp['attack'] = s['attack_type']
    if s.get('dc'): sp['save'] = ABIL.get(s['dc']['dc_type']['name'], s['dc']['dc_type']['name'].lower())
    dm = s.get('damage') or {}
    if dm.get('damage_type'): sp['dmgType'] = dm['damage_type']['name']
    if dm.get('damage_at_slot_level'): sp['dmgSlot'] = dm['damage_at_slot_level']
    if dm.get('damage_at_character_level'): sp['dmgChar'] = dm['damage_at_character_level']
    hl = s.get('heal_at_slot_level')
    if hl: sp['healSlot'] = hl
    spells.append(sp)

magic = [{'name': i['name'], 'rarity': i['rarity']['name'], 'type': i['equipment_category']['name'], 'desc': text(i['desc'])} for i in L('Magic-Items')]

data = {'skills': SKILLS, 'classes': classes, 'species': species, 'backgrounds': backgrounds, 'feats': feats,
        'equipment': gear, 'spells': spells, 'magicItems': magic}
with open(OUT, 'w') as f:
    f.write('// Generated from the 5e SRD 5.2 (CC-BY-4.0) via 5e-bits/5e-database by scripts/convert_charsheet.py. Do not edit by hand.\n')
    f.write('window.CHARDATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(classes), 'classes,', len(species), 'species,', len(backgrounds), 'backgrounds,', len(feats), 'feats,', len(gear), 'items,', len(spells), 'spells,', len(magic), 'magic items')
