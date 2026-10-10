// Treasure reference data. Magic item names are from the 5e SRD.
window.LOOT = {
  tiers: [
    { label: 'CR 0–4', max: 4,
      individual: [[30, { cp: '5d6' }], [60, { sp: '4d6' }], [70, { ep: '3d6' }], [95, { gp: '3d6' }], [100, { pp: '1d6' }]],
      hoard: { cp: '6d6*100', sp: '3d6*100', gp: '2d6*10' }, gems: [10, 50], art: [25], items: { common: 50, uncommon: 40, rare: 10 }, itemRolls: '1d4-1', gemRolls: '2d4' },
    { label: 'CR 5–10', max: 10,
      individual: [[30, { cp: '4d6*100', ep: '1d6*10' }], [60, { sp: '6d6*10', gp: '2d6*10' }], [70, { ep: '3d6*10', gp: '2d6*10' }], [95, { gp: '4d6*10' }], [100, { gp: '2d6*10', pp: '3d6' }]],
      hoard: { cp: '2d6*100', sp: '2d6*1000', gp: '6d6*100', pp: '3d6*10' }, gems: [50, 100, 500], art: [25, 250], items: { common: 15, uncommon: 50, rare: 30, 'very rare': 5 }, itemRolls: '1d4', gemRolls: '3d6' },
    { label: 'CR 11–16', max: 16,
      individual: [[20, { sp: '4d6*100', gp: '1d6*100' }], [35, { ep: '1d6*100', gp: '1d6*100' }], [75, { gp: '2d6*100', pp: '1d6*10' }], [100, { gp: '2d6*100', pp: '2d6*10' }]],
      hoard: { gp: '4d6*1000', pp: '5d6*100' }, gems: [500, 1000], art: [250, 750], items: { uncommon: 20, rare: 45, 'very rare': 30, legendary: 5 }, itemRolls: '1d4+1', gemRolls: '3d6' },
    { label: 'CR 17+', max: 99,
      individual: [[15, { ep: '2d6*1000', gp: '8d6*100' }], [55, { gp: '1d6*1000', pp: '1d6*100' }], [100, { gp: '1d6*1000', pp: '2d6*100' }]],
      hoard: { gp: '12d6*1000', pp: '8d6*1000' }, gems: [1000, 5000], art: [2500, 7500], items: { rare: 25, 'very rare': 45, legendary: 30 }, itemRolls: '1d6+1', gemRolls: '3d6' },
  ],
  gems: {
    10: ['azurite', 'banded agate', 'blue quartz', 'eye agate', 'hematite', 'lapis lazuli', 'malachite', 'moss agate', 'obsidian', 'rhodochrosite', 'tiger eye', 'turquoise'],
    50: ['bloodstone', 'carnelian', 'chalcedony', 'chrysoprase', 'citrine', 'jasper', 'moonstone', 'onyx', 'quartz', 'sardonyx', 'star rose quartz', 'zircon'],
    100: ['amber', 'amethyst', 'chrysoberyl', 'coral', 'garnet', 'jade', 'jet', 'pearl', 'spinel', 'tourmaline'],
    500: ['alexandrite', 'aquamarine', 'black pearl', 'blue spinel', 'peridot', 'topaz'],
    1000: ['black opal', 'blue sapphire', 'emerald', 'fire opal', 'opal', 'star ruby', 'star sapphire', 'yellow sapphire'],
    5000: ['black sapphire', 'diamond', 'jacinth', 'ruby'],
  },
  art: {
    25: ['silver ewer', 'carved bone statuette', 'small gold bracelet', 'cloth-of-gold vestments', 'black velvet mask stitched with silver', 'copper chalice with silver filigree', 'pair of engraved bone dice', 'small mirror in a painted wooden frame', 'embroidered silk handkerchief', 'gold locket with a painted portrait'],
    250: ['gold ring set with bloodstones', 'carved ivory statuette', 'large gold bracelet', 'silver necklace with a gemstone pendant', 'bronze crown', 'silk robe with gold embroidery', 'large well-made tapestry', 'brass mug with jade inlay', 'box of turquoise animal figurines', 'gold bird cage with electrum filigree'],
    750: ['silver chalice set with moonstones', 'silver-plated longsword with jet in the hilt', 'carved harp of exotic wood with ivory inlay', 'small gold idol', 'gold dragon comb set with red garnets', 'bottle stopper cork embossed with gold leaf and amethysts', 'ceremonial electrum dagger with a black pearl', 'silver and gold brooch', 'obsidian statuette with gold fittings', 'painted gold war mask'],
    2500: ['fine gold chain set with a fire opal', 'old masterpiece painting', 'embroidered silk and velvet mantle set with moonstones', 'platinum bracelet set with a sapphire', 'embroidered glove set with jewel chips', 'jeweled anklet', 'gold music box', 'gold circlet set with four aquamarines', 'eye patch with a mock eye of sapphire and moonstone', 'necklace string of small pink pearls'],
    7500: ['jeweled gold crown', 'jeweled platinum ring', 'small gold statuette set with rubies', 'gold cup set with emeralds', 'gold jewelry box with platinum filigree', 'painted gold child\'s sarcophagus', 'jade game board with solid gold playing pieces', 'bejeweled ivory drinking horn with gold filigree'],
  },
  magic: {
    common: ['Potion of Healing', 'Potion of Climbing', 'Spell Scroll (Cantrip)', 'Spell Scroll (1st level)', 'Driftglobe', 'Moon-Touched Sword', 'Cloak of Many Fashions', 'Candle of the Deep', 'Pot of Awakening', 'Wand of Smiles', 'Charlatan\'s Die', 'Clockwork Amulet'],
    uncommon: ['Potion of Greater Healing', 'Bag of Holding', 'Boots of Elvenkind', 'Cloak of Elvenkind', 'Cloak of Protection', 'Decanter of Endless Water', 'Gauntlets of Ogre Power', 'Goggles of Night', 'Immovable Rod', 'Pearl of Power',
      'Ring of Jumping', 'Ring of Water Walking', 'Rope of Climbing', 'Sending Stones', 'Wand of Magic Missiles', 'Wand of Web', 'Weapon +1', 'Shield +1', 'Alchemy Jug', 'Hat of Disguise', 'Javelin of Lightning', 'Bracers of Archery',
      'Boots of Striding and Springing', 'Spell Scroll (2nd level)', 'Spell Scroll (3rd level)', 'Potion of Fire Breath', 'Periapt of Wound Closure', 'Amulet of Proof against Detection and Location'],
    rare: ['Potion of Superior Healing', 'Amulet of Health', 'Armor +1', 'Belt of Dwarvenkind', 'Boots of Speed', 'Bracers of Defense', 'Cape of the Mountebank', 'Cloak of Displacement', 'Flame Tongue', 'Necklace of Fireballs',
      'Ring of Protection', 'Ring of Evasion', 'Ring of Spell Storing', 'Rod of the Pact Keeper +2', 'Staff of the Woodlands', 'Sun Blade', 'Wand of Fireballs', 'Wand of Lightning Bolts', 'Weapon +2', 'Shield +2', 'Wings of Flying',
      'Mace of Disruption', 'Folding Boat', 'Portable Hole', 'Spell Scroll (4th level)', 'Spell Scroll (5th level)', 'Dagger of Venom', 'Periapt of Proof against Poison'],
    'very rare': ['Potion of Supreme Healing', 'Armor +2', 'Weapon +3', 'Shield +3', 'Belt of Fire Giant Strength', 'Carpet of Flying', 'Cloak of the Bat', 'Dancing Sword', 'Dwarven Thrower', 'Frost Brand', 'Manual of Bodily Health',
      'Ring of Regeneration', 'Ring of Telekinesis', 'Rod of Absorption', 'Staff of Fire', 'Staff of Thunder and Lightning', 'Tome of Clear Thought', 'Spell Scroll (6th level)', 'Spell Scroll (7th level)', 'Spell Scroll (8th level)', 'Nine Lives Stealer', 'Oathbow'],
    legendary: ['Armor +3', 'Belt of Storm Giant Strength', 'Cloak of Invisibility', 'Defender', 'Holy Avenger', 'Ring of Three Wishes', 'Robe of the Archmagi', 'Rod of Lordly Might', 'Staff of the Magi', 'Vorpal Sword',
      'Sphere of Annihilation', 'Well of Many Worlds', 'Ioun Stone (Mastery)', 'Talisman of Pure Good', 'Spell Scroll (9th level)', 'Luck Blade'],
  },
  // Starter custom tables. Entries: [weight, text]. Dice in text get rolled; [[Table Name]] rolls another table.
  defaultTables: [
    { id: 'trinkets', name: 'Trinkets', die: 'weighted', entries: [
      [1, 'A mummified goblin hand'], [1, 'A crystal that faintly glows in moonlight'], [1, 'A gold coin minted in an unknown land'], [1, 'A diary written in a language you don\'t know'],
      [1, 'A brass ring that never tarnishes'], [1, 'An old chess piece made from glass'], [1, 'A pair of knucklebone dice, each with a skull symbol on the side that would normally show six pips'],
      [1, 'A small idol depicting a nightmarish creature'], [1, 'A rope necklace with four mummified elf fingers on it'], [1, 'A tiny silver bell without a clapper'],
      [1, 'A glass orb filled with moving smoke'], [1, 'A key that fits no known lock'], [1, 'A pressed flower between two pages of a torn book'], [1, 'A vial of dragon blood (allegedly)']] },
    { id: 'goblin-pockets', name: 'Goblin Pockets', die: 'weighted', entries: [
      [4, '1d6 cp and some lint'], [3, '2d4 sp wrapped in a dirty rag'], [2, 'A half-eaten rat on a stick'], [2, 'A crude map scratched on bark'], [1, '1d4 gp and a shiny button'],
      [1, '[[Trinkets]]'], [1, 'A Potion of Healing (it smells off, but it works)']] },
    { id: 'forest-forage', name: 'Forest Foraging', die: 'weighted', entries: [
      [5, '1d4 rations worth of berries and roots'], [3, 'Healing herbs (enough for 1d4 uses of a Healer\'s Kit)'], [2, 'A patch of nightshade (poisonous if eaten)'],
      [1, 'A wild owlbear egg'], [1, 'A lost traveler\'s pack containing 2d6 gp'], [1, 'Silverleaf: worth 25 gp to an alchemist']] },
  ],
};
