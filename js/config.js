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

  // Entity types.
  ANT_QUEEN: 'queen',
  ANT_WORKER: 'worker',
  ANT_WARRIOR: 'warrior',
  ANT_NURSERY: 'nursery',
  ANT_FORAGER: 'forager',
  ANT_BUILDER: 'builder',
  ANT_DRONE: 'drone',
  EGG: 'egg',
  FOOD: 'food',

  // Movement speed in tiles per second.
  WORKER_SPEED: 4.5,
  WARRIOR_SPEED: 3.8,
  NURSERY_SPEED: 4.0,
  FORAGER_SPEED: 4.6,
  BUILDER_SPEED: 4.0,
  DRONE_SPEED: 4.2,
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
  QUEEN_HP: 150,
  QUEEN_DAMAGE: 8,
  QUEEN_DEFENSE: 0,
  ATTACK_RANGE: 1.6,     // tiles (center-to-center)
  ATTACK_COOLDOWN: 0.6,  // seconds between hits
  HEAL_RATE: 1.5,        // hp regenerated per second when out of combat
  HEAL_DELAY: 4,         // seconds after taking damage before healing resumes

  // How laid/spawned eggs split between castes (must sum to ~1).
  CASTE_WEIGHTS: { warrior: 0.2, nursery: 0.14, forager: 0.2, builder: 0.14, drone: 0.1, worker: 0.22 },

  // Drones: fly to the queen, mate (heart!), and speed up her egg-laying.
  MATE_RANGE: 1.6,          // how close a drone must get to the queen
  LAY_BOOST_DURATION: 16,   // seconds the queen lays faster after mating
  LAY_BOOST_FACTOR: 0.4,    // lay-interval multiplier while boosted (lower = faster)
  HEART_DURATION: 1.6,      // seconds a mating heart floats before fading

  // Surface (outside) world.
  SURFACE_ROWS: 42,         // total height of the surface (tall sky above)
  SURFACE_GROUND_BAND: 13,  // bottom rows that are walkable "ground" (food/critters)

  // Critters: neutral wildlife that roam the surface.
  CRITTER_GRASSHOPPER: 'grasshopper',
  CRITTER_BEETLE: 'beetle',
  CRITTER_LADYBUG: 'ladybug',
  CRITTER_BEE: 'bee',
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
  },

  // Beehive in the tree: bees swarm anyone who gets too close.
  HIVE_GUARD_RANGE: 6,      // bees attack ants within this of the hive
  BEE_COUNT: 5,             // bees kept around the hive

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
