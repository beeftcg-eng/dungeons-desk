// Core 5e reference numbers (SRD) plus flavor data used by the monster generator.
window.SRD = (() => {
  const XP = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
    11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
    21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
  const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
  const crNum = (cr) => { cr = String(cr).trim(); if (cr.includes('/')) { const [a, b] = cr.split('/'); return Number(a) / Number(b); } return Number(cr) || 0; };
  const pb = (cr) => { const n = crNum(cr); return n < 5 ? 2 : Math.min(9, 2 + Math.ceil((n - 4) / 4)); };
  const xp = (cr) => XP[String(cr).trim()] ?? 0;

  const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  const HIT_DIE = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };
  const TOKEN_INCHES = { Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };

  const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
    'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Concentrating'];

  const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  // Flavor per creature type. dmg = signature damage type.
  const TYPES = {
    Aberration: { dmg: 'Psychic', senses: 'Darkvision 120 ft.', langs: 'Deep Speech, telepathy 60 ft.', primary: 'int',
      attacks: ['Tentacle', 'Mind Lash', 'Grasping Maw'], res: '', imm: '', cimm: '',
      traits: [['Alien Mind', 'The {n} has Advantage on saving throws against being Charmed or Frightened.'], ['Amorphous Senses', 'The {n} can perceive invisible creatures within 30 feet.']],
      special: ['Mind Blast', 'Each creature in a 30-foot Cone must make a DC {dc} Intelligence saving throw. *Failure:* {d} Psychic damage, and the target has the Stunned condition until the end of its next turn. *Success:* Half damage only.'],
      words: [['Gibbering', 'Elder', 'Void', 'Writhing', 'Star'], ['Mouther', 'Spawn', 'Gazer', 'Seer', 'Horror']] },
    Beast: { dmg: 'Piercing', senses: 'Darkvision 60 ft.', langs: '—', primary: 'str',
      attacks: ['Bite', 'Claw', 'Gore', 'Talons'], res: '', imm: '', cimm: '',
      traits: [['Keen Senses', 'The {n} has Advantage on Wisdom (Perception) checks that rely on hearing or smell.'], ['Pack Tactics', 'The {n} has Advantage on an attack roll against a creature if at least one of the {n}\'s allies is within 5 feet of the creature and the ally doesn\'t have the Incapacitated condition.'], ['Pounce', 'If the {n} moves at least 20 feet straight toward a creature and then hits it with a Claw attack on the same turn, the target must succeed on a DC {dc} Strength saving throw or have the Prone condition.']],
      special: ['Savage Roar', 'Each creature of the {n}\'s choice within 30 feet that can hear it must succeed on a DC {dc} Wisdom saving throw or have the Frightened condition until the end of the {n}\'s next turn.'],
      words: [['Dire', 'Thornback', 'Ash', 'Moon', 'Bristle', 'Razor'], ['Boar', 'Wolf', 'Stalker', 'Bear', 'Hound', 'Elk']] },
    Celestial: { dmg: 'Radiant', senses: 'Darkvision 120 ft.', langs: 'all, telepathy 120 ft.', primary: 'wis',
      attacks: ['Radiant Blade', 'Searing Touch', 'Holy Mace'], res: 'Radiant', imm: '', cimm: 'Charmed, Exhaustion, Frightened',
      traits: [['Divine Awareness', 'The {n} knows if it hears a lie.'], ['Magic Resistance', 'The {n} has Advantage on saving throws against spells and other magical effects.']],
      special: ['Blinding Radiance', 'Each creature of the {n}\'s choice in a 20-foot Emanation must make a DC {dc} Constitution saving throw. *Failure:* {d} Radiant damage, and the target has the Blinded condition until the end of its next turn. *Success:* Half damage only.'],
      words: [['Dawn', 'Solar', 'Halo', 'Seraph', 'Gilded'], ['Warden', 'Herald', 'Sentinel', 'Choir', 'Lantern']] },
    Construct: { dmg: 'Bludgeoning', senses: 'Darkvision 60 ft.', langs: 'understands its creator\'s languages but can\'t speak', primary: 'str',
      attacks: ['Slam', 'Piston Fist', 'Blade Arm'], res: '', imm: 'Poison, Psychic', cimm: 'Charmed, Exhaustion, Frightened, Paralyzed, Petrified, Poisoned',
      traits: [['Immutable Form', 'The {n} can\'t shape-shift.'], ['Constructed Nature', 'The {n} doesn\'t require air, food, drink, or sleep.']],
      special: ['Overload Pulse', 'Each creature in a 15-foot Emanation must make a DC {dc} Dexterity saving throw. *Failure:* {d} Lightning damage. *Success:* Half damage.'],
      words: [['Iron', 'Clockwork', 'Brass', 'Runic', 'Stone'], ['Sentinel', 'Golem', 'Automaton', 'Warden', 'Juggernaut']] },
    Dragon: { dmg: 'Fire', senses: 'Blindsight 30 ft., Darkvision 120 ft.', langs: 'Common, Draconic', primary: 'str',
      attacks: ['Rend', 'Bite', 'Tail'], res: '', imm: 'Fire', cimm: '',
      traits: [['Amphibious', 'The {n} can breathe air and water.'], ['Draconic Presence', 'Creatures that start their turn within 30 feet of the {n} and can see it have Disadvantage on saving throws against being Frightened.']],
      special: ['Fire Breath (Recharge 5–6)', '*Dexterity Saving Throw:* DC {dc}, each creature in a 30-foot Cone. *Failure:* {d} Fire damage. *Success:* Half damage.'],
      words: [['Ember', 'Cinder', 'Scorch', 'Crimson', 'Ash'], ['Drake', 'Wyrmling', 'Wyvern', 'Dragon', 'Wyrm']] },
    Elemental: { dmg: 'Fire', senses: 'Darkvision 60 ft.', langs: 'Primordial', primary: 'con',
      attacks: ['Slam', 'Elemental Lash', 'Burning Touch'], res: 'Bludgeoning, Piercing, Slashing', imm: 'Poison', cimm: 'Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious',
      traits: [['Elemental Nature', 'The {n} doesn\'t require air, food, drink, or sleep.'], ['Fire Aura', 'At the end of each of the {n}\'s turns, each creature in a 5-foot Emanation takes {small} Fire damage.']],
      special: ['Whirlwind (Recharge 4–6)', 'Each creature in the {n}\'s space or within 10 feet must succeed on a DC {dc} Strength saving throw or take {d} Bludgeoning damage and be flung up to 20 feet away.'],
      words: [['Magma', 'Storm', 'Tide', 'Dust', 'Frost'], ['Spirit', 'Elemental', 'Mote', 'Vortex', 'Heart']] },
    Fey: { dmg: 'Psychic', senses: 'Darkvision 60 ft.', langs: 'Common, Elvish, Sylvan', primary: 'cha',
      attacks: ['Thorn Lash', 'Fey Blade', 'Enchanted Touch'], res: '', imm: '', cimm: 'Charmed',
      traits: [['Fey Step', 'Bonus action: the {n} teleports up to 30 feet to an unoccupied space it can see.'], ['Magic Resistance', 'The {n} has Advantage on saving throws against spells and other magical effects.']],
      special: ['Beguiling Song', 'One creature the {n} can see within 60 feet must succeed on a DC {dc} Wisdom saving throw or have the Charmed condition for 1 minute. The target repeats the save at the end of each of its turns.'],
      words: [['Briar', 'Moonpetal', 'Hollow', 'Gloaming', 'Thistle'], ['Sprite', 'Hag', 'Trickster', 'Dryad', 'Knight']] },
    Fiend: { dmg: 'Fire', senses: 'Darkvision 120 ft.', langs: 'Abyssal, Infernal, telepathy 60 ft.', primary: 'str',
      attacks: ['Hellfire Claw', 'Barbed Tail', 'Infernal Blade'], res: 'Cold, Fire', imm: 'Poison', cimm: 'Poisoned',
      traits: [['Devil\'s Sight', 'Magical Darkness doesn\'t impede the {n}\'s Darkvision.'], ['Magic Resistance', 'The {n} has Advantage on saving throws against spells and other magical effects.']],
      special: ['Brimstone Burst', '*Dexterity Saving Throw:* DC {dc}, each creature in a 15-foot-radius Sphere centered on a point within 60 feet. *Failure:* {d} Fire damage. *Success:* Half damage.'],
      words: [['Brimstone', 'Chain', 'Hell', 'Barbed', 'Pit'], ['Fiend', 'Imp', 'Tormentor', 'Reaver', 'Devil']] },
    Giant: { dmg: 'Bludgeoning', senses: 'Passive Perception only', langs: 'Giant', primary: 'str',
      attacks: ['Greatclub', 'Fist', 'Stomp'], res: '', imm: '', cimm: '',
      traits: [['Mountain Born', 'The {n} has Advantage on saving throws against being knocked Prone.'], ['Siege Monster', 'The {n} deals double damage to objects and structures.']],
      special: ['Rock (Ranged)', '*Ranged Attack Roll:* +{atk}, range 60/240 ft. *Hit:* {d} Bludgeoning damage. If the target is Large or smaller, it has the Prone condition.'],
      words: [['Hill', 'Frost', 'Stone', 'Moss', 'Cliff'], ['Giant', 'Ogre', 'Troll', 'Titan', 'Brute']] },
    Humanoid: { dmg: 'Slashing', senses: '—', langs: 'Common plus one other language', primary: 'str',
      attacks: ['Longsword', 'Shortsword', 'Spear', 'Mace'], res: '', imm: '', cimm: '',
      traits: [['Martial Advantage', 'Once per turn, the {n} deals an extra {small} damage to a creature it hits if an ally is within 5 feet of the target.'], ['Brave', 'The {n} has Advantage on saving throws against being Frightened.']],
      special: ['Light Crossbow', '*Ranged Attack Roll:* +{atk}, range 80/320 ft. *Hit:* {d} Piercing damage.'],
      words: [['Bandit', 'Cult', 'Watch', 'Mercenary', 'Raider'], ['Captain', 'Fanatic', 'Sergeant', 'Thug', 'Scout']] },
    Monstrosity: { dmg: 'Slashing', senses: 'Darkvision 60 ft.', langs: '—', primary: 'str',
      attacks: ['Rend', 'Bite', 'Stinger', 'Pincer'], res: '', imm: '', cimm: '',
      traits: [['Spider Climb', 'The {n} can climb difficult surfaces, including along ceilings, without making an ability check.'], ['Ambusher', 'The {n} has Advantage on attack rolls against any creature it has surprised.']],
      special: ['Petrifying Gaze', 'One creature within 30 feet must make a DC {dc} Constitution saving throw. *Failure:* The target has the Restrained condition and repeats the save at the end of its next turn, becoming Petrified on a second failure.'],
      words: [['Grave', 'Bone', 'Chitin', 'Mire', 'Shrieking'], ['Chimera', 'Basilisk', 'Mantis', 'Lurker', 'Maw']] },
    Ooze: { dmg: 'Acid', senses: 'Blindsight 60 ft. (blind beyond this radius)', langs: '—', primary: 'con',
      attacks: ['Pseudopod', 'Engulf'], res: 'Acid', imm: 'Acid', cimm: 'Blinded, Charmed, Deafened, Exhaustion, Frightened, Prone',
      traits: [['Amorphous', 'The {n} can move through a space as narrow as 1 inch without expending extra movement to do so.'], ['Corrosive Form', 'A creature that touches the {n} or hits it with a melee attack takes {small} Acid damage.']],
      special: ['Engulf', 'The {n} moves up to its Speed. Each Large or smaller creature in its path must succeed on a DC {dc} Dexterity saving throw or be engulfed, taking {d} Acid damage and having the Restrained condition.'],
      words: [['Gelatinous', 'Ochre', 'Black', 'Grey', 'Crystal'], ['Ooze', 'Pudding', 'Slime', 'Jelly', 'Cube']] },
    Plant: { dmg: 'Bludgeoning', senses: 'Blindsight 60 ft.', langs: '—', primary: 'str',
      attacks: ['Vine Lash', 'Slam', 'Thorn Spray'], res: '', imm: '', cimm: 'Blinded, Deafened',
      traits: [['False Appearance', 'If the {n} is motionless at the start of combat, it has Advantage on its Initiative roll.'], ['Regrowth', 'The {n} regains {small} Hit Points at the start of its turn if it has at least 1 Hit Point and isn\'t standing on burnt ground.']],
      special: ['Spore Cloud (Recharge 5–6)', '*Constitution Saving Throw:* DC {dc}, each creature in a 15-foot Emanation. *Failure:* {d} Poison damage and the Poisoned condition until the end of its next turn. *Success:* Half damage only.'],
      words: [['Blight', 'Thorn', 'Rot', 'Mossy', 'Weeping'], ['Shambler', 'Treant', 'Bloom', 'Creeper', 'Mandrake']] },
    Undead: { dmg: 'Necrotic', senses: 'Darkvision 60 ft.', langs: 'understands the languages it knew in life', primary: 'str',
      attacks: ['Grave Claw', 'Rusted Blade', 'Life Drain', 'Bite'], res: 'Necrotic', imm: 'Poison', cimm: 'Exhaustion, Poisoned',
      traits: [['Undead Fortitude', 'If damage reduces the {n} to 0 Hit Points, it makes a Constitution saving throw (DC 5 plus the damage taken) unless the damage is Radiant or from a Critical Hit. On a success, it drops to 1 Hit Point instead.'], ['Sunlight Sensitivity', 'While in sunlight, the {n} has Disadvantage on ability checks and attack rolls.']],
      special: ['Dreadful Wail', 'Each creature within 30 feet that can hear the {n} must succeed on a DC {dc} Wisdom saving throw or take {d} Psychic damage and have the Frightened condition until the end of its next turn.'],
      words: [['Grave', 'Hollow', 'Barrow', 'Pale', 'Bone', 'Wailing'], ['Wight', 'Ghoul', 'Revenant', 'Wraith', 'Knight', 'Shade']] },
  };

  const ROLES = {
    Brute: 'Hits hard, soaks damage, lower AC.',
    Soldier: 'High AC, holds the line.',
    Skirmisher: 'Fast and mobile, hit-and-run.',
    Artillery: 'Ranged damage from a distance.',
    Controller: 'Hinders foes with save-based effects.',
    Lurker: 'Hides and strikes from ambush.',
    Leader: 'Bolsters allies and commands.',
  };

  return { XP, CRS, crNum, pb, xp, SIZES, HIT_DIE, TOKEN_INCHES, CONDITIONS, ABILITIES, TYPES, ROLES };
})();
