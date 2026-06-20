// Level definitions. The first nest in each level is always the player.
// Beat a level by destroying every rival queen; lose if your queen dies.
// Each nest: { id, tint, player?, cx, cy, workers, eggs }.

const LEVELS = [
  {
    name: 'First Tunnels',
    cols: 54,
    rows: 38,
    food: 18,
    nests: [
      { id: 'player', tint: 'darkRed', player: true, cx: 27, cy: 19, workers: 8, eggs: 6 },
      { id: 'black',  tint: 'black',  cx: 9,  cy: 9,  workers: 5, eggs: 4 },
      { id: 'blue',   tint: 'blue',   cx: 45, cy: 29, workers: 5, eggs: 4 },
    ],
  },
  {
    name: 'Border Skirmish',
    cols: 64,
    rows: 46,
    food: 24,
    nests: [
      { id: 'player', tint: 'darkRed', player: true, cx: 32, cy: 23, workers: 8, eggs: 6 },
      { id: 'black',  tint: 'black',  cx: 10, cy: 10, workers: 6, eggs: 5 },
      { id: 'blue',   tint: 'blue',   cx: 54, cy: 10, workers: 6, eggs: 5 },
      { id: 'white',  tint: 'white',  cx: 32, cy: 38, workers: 6, eggs: 5 },
    ],
  },
  {
    name: 'Surrounded',
    cols: 72,
    rows: 54,
    food: 28,
    nests: [
      { id: 'player', tint: 'darkRed', player: true, cx: 36, cy: 27, workers: 8, eggs: 6 },
      { id: 'black',  tint: 'black',  cx: 10, cy: 9,  workers: 7, eggs: 6 },
      { id: 'blue',   tint: 'blue',   cx: 62, cy: 10, workers: 7, eggs: 6 },
      { id: 'white',  tint: 'white',  cx: 12, cy: 45, workers: 7, eggs: 6 },
      { id: 'blue2',  tint: 'blue',   cx: 60, cy: 45, workers: 7, eggs: 6 },
    ],
  },
];
