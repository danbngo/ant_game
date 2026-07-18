// Global config / constants. Plain globals since we use loose <script> tags.

const CONFIG = {
  // Grid dimensions (in tiles). A big underground field with room for colonies.
  COLS: 72,
  ROWS: 54,

  // Pixel size of a single tile.
  TILE: 20,

  // Tile types.
  TILE_DIRT: 0,
  TILE_TUNNEL: 1, // dug-out / empty space ants can occupy
  TILE_WALL: 2,   // a built wall: impassable, but can be dug through
  TILE_WATER: 3,  // surface ocean: impassable (not a tunnel), can't be dug

  // Entity types.
  ANT_QUEEN: 'queen',
  ANT_WORKER: 'worker',
  ANT_WARRIOR: 'warrior',
  ANT_NURSERY: 'nursery',
  ANT_FORAGER: 'forager',
  ANT_BUILDER: 'builder',
  ANT_DRONE: 'drone',
  ANT_CARETAKER: 'caretaker',
  ANT_BEEHATER: 'beehater',
  ANT_BEEWARRIOR: 'beewarrior',
  ANT_FOODCOLLECTOR: 'foodcollector',
  ANT_GUARD: 'guard',
  ANT_RENTER: 'renter',
  ANT_VINCANT: 'vincant',
  EGG: 'egg',
  FOOD: 'food',

  // Movement speed in tiles per second.
  WORKER_SPEED: 4.5,
  WARRIOR_SPEED: 3.8,
  NURSERY_SPEED: 4.0,
  FORAGER_SPEED: 4.6,
  BUILDER_SPEED: 4.0,
  DRONE_SPEED: 4.2,
  CARETAKER_SPEED: 4.2,
  BEEHATER_SPEED: 4.3,
  BEEWARRIOR_SPEED: 4.0,
  FOODCOLLECTOR_SPEED: 4.5, // fast, like workers
  GUARD_SPEED: 3.6,
  RENTER_SPEED: 4.5,
  VINCANT_SPEED: 7.5,   // super speed
  QUEEN_SPEED: 2.0,

  // Combat. `defense` is the fraction of incoming damage ignored (0..1).
  WORKER_HP: 20,
  WORKER_DAMAGE: 4,
  WORKER_DEFENSE: 0,
  WARRIOR_HP: 50,
  WARRIOR_DAMAGE: 10,
  WARRIOR_DEFENSE: 0.4,
  NURSERY_HP: 15,
  NURSERY_DAMAGE: 0,
  NURSERY_DEFENSE: 0,
  FORAGER_HP: 28,
  FORAGER_DAMAGE: 5,
  FORAGER_DEFENSE: 0.1,
  BUILDER_HP: 26,
  BUILDER_DAMAGE: 3,
  BUILDER_DEFENSE: 0.15,
  DRONE_HP: 12,
  DRONE_DAMAGE: 0,
  DRONE_DEFENSE: 0,
  CARETAKER_HP: 16,
  CARETAKER_DAMAGE: 0,
  CARETAKER_DEFENSE: 0,
  // Bee-haters are all talk and the single weakest ant in the game: the lowest
  // HP of any caste, no real attack, no armor.
  BEEHATER_HP: 5,
  BEEHATER_DAMAGE: 0,
  BEEHATER_DEFENSE: 0,
  // Bee-warriors: warriors with a single-minded hatred of bees. Combat-capable
  // (so they can actually kill bees) but they ignore everything that isn't a bee.
  BEEWARRIOR_HP: 40,
  BEEWARRIOR_DAMAGE: 8,
  BEEWARRIOR_DEFENSE: 0.3,
  // Food-collectors: dedicated gatherers that also raid the hive for honey.
  FOODCOLLECTOR_HP: 24,
  FOODCOLLECTOR_DAMAGE: 3,
  FOODCOLLECTOR_DEFENSE: 0.1,
  // Guards: elite queen's bodyguards. Spawned at the start only (never hatched),
  // stronger and better-armored than warriors. They never leave the queen's side.
  GUARD_HP: 80,
  GUARD_DAMAGE: 13,
  GUARD_DEFENSE: 0.55,   // more damage reduction than a warrior's 0.4
  GUARD_DEFEND_RANGE: 8, // attack enemies within this many tiles of the queen
  GUARD_GUARD_DIST: 2.5, // how close guards hover to the queen when idle
  // Renting ants: spend colony food to rent assassin bugs (speeding their arrival).
  RENTER_HP: 18,
  RENTER_DAMAGE: 1,
  RENTER_DEFENSE: 0,
  // Vincant: the immortal special drone, one against all. Spawns only for the
  // player's colony, never from an egg.
  VINCANT_HP: 250,
  VINCANT_DAMAGE: 22,        // strong
  VINCANT_DEFENSE: 0.7,
  VINCANT_ACID_DAMAGE: 12,   // acid splinter: splash damage to nearby bugs
  VINCANT_SPLINTER_RANGE: 2.6,
  VINCANT_CHAT_INTERVAL: 12, // seconds between trips to the hive to chat with Beena
  VINCANT_CHAT_FIRST: 5,     // his first visit comes quickly so you don't miss it
  VINCANT_VISIT_DURATION: 3.5, // seconds he spends tucked INSIDE the hive each visit
  // While chatting inside the hive, Vincant draws his glock and pops off rounds
  // at any enemies that stray near it.
  VINCANT_GLOCK_INTERVAL: 0.4, // seconds between glock shots
  VINCANT_GLOCK_RANGE: 8,      // tiles around the hive he'll shoot at
  VINCANT_GLOCK_DMG: 14,       // damage per bullet
  VINCANT_BULLET_SPEED: 22,    // tiles/sec the bullet travels
  VINCANT_BULLET_LIFE: 1.2,    // seconds before a bullet fizzles out
  VINCANT_FEED_INTERVAL: 18, // seconds between trips underground to feed eggs
  VINCANT_TALK_MIN: 3.5,
  VINCANT_TALK_MAX: 7,
  VINCANT_TAUNTS: [
    "One against all!",
    "Is that all you've got?",
    "Nobody beats Vincant.",
    "Too slow, bugs.",
    "Acid time.",
    "I AM the colony.",
    "Get splintered.",
    "Long live the crown.",
    "Catch me if you can.",
    "Bow to Vincant.",
  ],
  VINCANT_CHAT: [
    "Hey Beena! How's the hive?",
    "Beena, you're the best sis.",
    "Just checking in, Beena!",
    "Stay safe in there, Beena.",
    "Beena! Miss you out here.",
  ],
  BEENA_REPLIES: [
    "Hi Vincant!",
    "Buzz off the beetles for me!",
    "Thanks for visiting!",
    "Be careful out there!",
    "The hive is buzzing, bro!",
  ],

  HONEY_MIN_VALUE: 2,    // honey is worth at least this much colony food
  HONEY_MAX_VALUE: 3,    // ...up to this much

  // Bee-bullying: unleashed bee-haters mob the hive and trash-talk until a bee
  // gets depressed, retreats inside to stress-make honey, then returns neutral.
  DEPRESSED_DURATION: 10,        // seconds a sad bee hides in the hive
  DEPRESSED_HONEY_INTERVAL: 2,   // a sad bee drops a honey glob this often
  QUEEN_HP: 150,
  QUEEN_DAMAGE: 8,
  QUEEN_DEFENSE: 0,
  ATTACK_RANGE: 1.6,     // tiles (center-to-center)
  ATTACK_COOLDOWN: 0.6,  // seconds between hits
  HEAL_RATE: 1.5,        // hp regenerated per second when out of combat
  HEAL_DELAY: 4,         // seconds after taking damage before healing resumes

  // How laid/spawned eggs split between castes (must sum to ~1).
  CASTE_WEIGHTS: { warrior: 0.12, nursery: 0.1, forager: 0.12, builder: 0.1, drone: 0.08, caretaker: 0.08, beehater: 0.07, beewarrior: 0.07, foodcollector: 0.1, renter: 0.06, worker: 0.1 },

  // Bee-haters: ants whose entire personality is hating bees. They periodically
  // blurt one of these out in a speech bubble.
  BEE_HATE_PHRASES: [
    "Ugh, bees. The WORST.",
    "I hate bees so much.",
    "Bees? Don't get me started.",
    "Stupid buzzing menaces.",
    "Bees ruin everything.",
    "If I see one more bee...",
    "Bees have it way too easy.",
    "Down with bees!",
    "Bees are NOT our friends.",
    "Wasps are bad. Bees are worse.",
    "Somebody should DO something about bees.",
    "All buzz, no substance.",
    "Honey? Overrated. Like bees.",
    "Not a fan of bees, personally.",
    "Bees, am I right?",
  ],
  BEEHATER_TALK_MIN: 2.5,   // min seconds between rants
  BEEHATER_TALK_MAX: 6.0,   // max seconds between rants
  SPEECH_DURATION: 3.0,     // how long a speech bubble lingers

  // Warriors turn toxic the moment they get a kill and trash-talk the corpse.
  WARRIOR_TAUNTS: [
    "EZ",
    "NOOB",
    "LLLL",
    "BRO CANT EVEN BEAT ME LOLLL",
    "GET REKT",
    "GG EZ",
    "TOO EASY",
    "SKILL ISSUE",
    "RATIO",
    "L + BOZO",
    "CRY ABOUT IT",
    "SIT DOWN",
    "OUTPLAYED LOL",
    "IMAGINE LOSING TO ME",
    "L+RATIO+HOMELESS",
  ],

  // Bee-warriors mix trash-talk with pure anti-bee venom while on patrol.
  BEE_WARRIOR_TAUNTS: [
    "DIE BEE SCUM",
    "I HATE BEES",
    "NO MORE BEES",
    "EZ BEE",
    "BEES GET THE STINGER",
    "BORN TO SQUASH BEES",
    "STAY MAD, BEE",
    "ANOTHER BEE DOWN LOL",
    "BEES = CANCELLED",
    "BUZZ OFF AND DIE",
    "GET REKT, BEE",
    "THIS IS BEE-FREE TERRITORY",
  ],

  // Drones: fly to the queen, mate (heart!), and speed up her egg-laying.
  MATE_RANGE: 1.6,          // how close a drone must get to the queen
  LAY_BOOST_DURATION: 16,   // seconds the queen lays faster after mating
  LAY_BOOST_FACTOR: 0.4,    // lay-interval multiplier while boosted (lower = faster)
  HEART_DURATION: 1.6,      // seconds a mating heart floats before fading

  // Surface (outside) world.
  SURFACE_ROWS: 42,         // total height of the surface (tall sky above)
  SURFACE_GROUND_BAND: 13,  // bottom rows that are walkable "ground" (food/critters)

  // Ocean + island: a body of water cuts off a far island reachable only by a
  // single bridge. A food generator on the island steadily produces bounty.
  OCEAN_WIDTH: 5,             // columns of water between mainland and island
  ISLAND_WIDTH: 8,           // columns of grassy island beyond the ocean
  FOODGEN_FOOD_INTERVAL: 2,  // seconds between the generator's plain-food drops
  FOODGEN_HONEY_INTERVAL: 3, // seconds between the generator's honey drops
  FOODGEN_RADIUS: 3,         // tiles around the generator that drops can appear
  FOODGEN_MAX: 8,            // cap on generator bounty sitting on the island at once
  SMOKE_INTERVAL: 0.45,      // seconds between smoke puffs from the machine's spout
  SMOKE_LIFE: 2.6,           // seconds a puff rises and fades before vanishing
  SMOKE_RISE: 1.3,           // tiles/sec a puff drifts upward

  // Critters: neutral wildlife that roam the surface.
  CRITTER_GRASSHOPPER: 'grasshopper',
  CRITTER_BEETLE: 'beetle',
  CRITTER_LADYBUG: 'ladybug',
  CRITTER_BEE: 'bee',
  CRITTER_ARMORED_BEE: 'armoredbee',
  CRITTER_MAJOR_BEE: 'majorbee',
  CRITTER_STICKBUG: 'stickbug',
  CRITTER_ASSASSIN: 'assassin',
  CRITTER_COUNT: 9,         // wandering surface critters maintained at once
  CRITTER_SPAWN_INTERVAL: 6,
  CRITTER_FLEE_RANGE: 4,    // grasshopper flees ants within this
  BEETLE_AGGRO: 5,          // beetle attacks ants within this
  CRITTER_WANDER_INTERVAL: 3,
  CRITTER_STATS: {
    grasshopper: { hp: 12, dmg: 0, def: 0,    speed: 6.5, food: 1 },
    beetle:      { hp: 45, dmg: 6, def: 0.3,  speed: 2.4, food: 3 },
    ladybug:     { hp: 10, dmg: 0, def: 0,    speed: 3.2, food: 1 },
    bee:         { hp: 8,  dmg: 3, def: 0,    speed: 6.2, food: 1 },
    armoredbee:  { hp: 50, dmg: 5, def: 0.55, speed: 4.0, food: 3 },
    // Major bees: the hive's elite. Big, strong, and tough — the heaviest hitters
    // of the swarm, dropping a generous haul of honey-rich food when they fall.
    majorbee:    { hp: 120, dmg: 12, def: 0.5, speed: 4.4, food: 5 },
    stickbug:    { hp: 16, dmg: 0, def: 0.2,  speed: 2.0, food: 2 },
    assassin:    { hp: 22, dmg: 8, def: 0.1,  speed: 5.5, food: 2 },
  },

  // Assassin bugs: hired killers that hunt the hive's bees. Spawn on a timer
  // that renting ants can speed up.
  ASSASSIN_SPAWN_INTERVAL: 15, // seconds between assassin spawns
  ASSASSIN_MAX: 7,             // most assassin bugs alive on the surface at once
  RENT_INTERVAL: 4,            // seconds between a renting ant's rentals
  RENT_COST: 1,               // food a renting ant spends per rental
  RENT_SPEEDUP: 0.001,        // fraction of the spawn interval advanced per rental (0.1% sooner)

  // Beehive in the tree: bees swarm anyone who gets too close.
  HIVE_GUARD_RANGE: 6,      // bees attack ants within this of the hive
  BEE_COUNT: 5,             // regular bees kept around the hive
  ARMORED_BEE_COUNT: 2,     // tanky armored bees kept around the hive
  MAJOR_BEE_COUNT: 2,       // large, powerful major bees kept around the hive

  // Builders: mining dirt, digging the surface shaft, and walling the queen.
  DIG_TIME_BUILD: 1.0,      // seconds to place one wall
  DIRT_PER_DIG: 2,          // dirt gained per tile a builder digs
  BUILDER_MAX_DIRT: 6,      // how much dirt a builder can carry
  WALL_COST: 1,             // dirt spent per wall tile
  WALL_RADIUS: 3,           // wall ring distance from the queen

  // Food & foraging.
  FOOD_SPAWN_INTERVAL: 4,   // seconds between food respawn ticks
  FOOD_TARGET: 22,          // ground food is replenished toward this each tick
  FOOD_MAX: 40,             // hard cap on ground food at once
  FORAGE_RANGE: 40,         // tiles an idle worker will look for food
  FOOD_BOOST: 2.0,          // extra egg growth/sec when a fed nursery tends it
  FOOD_CONSUME_RATE: 0.5,   // food units/sec a nursery spends feeding an egg

  // Queen wandering.
  QUEEN_WANDER_INTERVAL: 6, // seconds a queen rests before wandering again
  QUEEN_AVOID_DIST: 14,     // queens won't wander within this of another nest
  QUEEN_WANDER_RADIUS: 7,   // queens stay within this many tiles of their nest

  // Digging.
  DIG_TIME: 1.2,         // seconds to dig one dirt tile

  // Enemy AI.
  AGGRO_RANGE: 9,        // tiles; enemies chase player ants within this
  AUTO_ENGAGE_RANGE: 4,  // tiles; any idle ant auto-attacks an enemy this close
  WARRIOR_HUNT_RANGE: 12, // tiles; off-patrol warriors actively seek enemies this far

  // Eggs & breeding.
  EGG_HATCH_TIME: 30,    // seconds for an egg to hatch into a worker
  LAY_INTERVAL: 30,      // seconds between a queen laying eggs
  TEND_RANGE: 2.5,       // tiles; a same-color ant this close "tends" an egg
};

// Color palette, grouped for easy tweaking later.
const COLORS = {
  dirtBase: '#5a3d28',
  dirtDark: '#4a3120',
  dirtLight: '#6b4a30',
  dirtSpeck: '#3a2616',

  tunnelBase: '#2a1d14',
  tunnelEdge: '#1f150e',

  eggShell: '#f3ead8',
  eggShade: '#d9ccb2',

  food: '#8cc63f',
  foodDark: '#5e9220',

  // Built walls = packed dirt (underground).
  wallBase: '#6e4d31',
  wallLight: '#87603e',
  wallShade: '#48301d',

  // Surface (outside).
  sky: '#8fc7e8',
  skyLight: '#a6d6f0',
  skyDark: '#7bb8de',
  grassBase: '#4f7a32',
  grassDark: '#436a2a',
  grassLight: '#5f9040',
  grassBlade: '#3a5c24',
  rock: '#7a7468',

  // Ocean, bridge, and the island's food generator.
  water: '#2f6fae',
  waterDark: '#235d97',
  waterLight: '#4a8bcb',
  waterFoam: '#d3eaf8',
  bridgePlank: '#9c6b35',
  bridgePlankDark: '#794f25',
  bridgeRope: '#e0d2a6',
  genPot: '#7a4a2a',
  genPotDark: '#5d3920',
  genLeaf: '#3f8f4a',
  genLeafDark: '#2c6e36',
  genFruit: '#e2552f',
  genHoney: '#f2b21f',

  // Tree + beehive.
  treeTrunk: '#6b4a2a',
  treeTrunkDark: '#523619',
  treeLeaf: '#3f7a34',
  treeLeafDark: '#2f5e26',
  hiveBase: '#d9a441',
  hiveStripe: '#a9742a',
  bee: '#f2c12e',
  beeStripe: '#1a1410',
};

// Ant color tints. Each tint defines the body fill, a lighter highlight, and a
// leg/antenna color. An ant's `tint` key selects one of these. Add more here.
const TINTS = {
  darkRed: { body: '#5a1f1f', light: '#7a2e2e', leg: '#8a3a3a' },
  black:   { body: '#1c1814', light: '#332c24', leg: '#5a5048' },
  white:   { body: '#d8d2c4', light: '#efe9dc', leg: '#7a7268' },
  blue:    { body: '#1f3a5a', light: '#2e567a', leg: '#4a78a8' },
};

// Default tint applied to ants when none is specified.
const DEFAULT_TINT = 'darkRed';
