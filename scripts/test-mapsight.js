// Line of sight on battle maps (shared/map-render.js): reading a Universal VTT file's grid, walls and doors, what a
// token can see past walls and doors, and which moves walls block. Run: node scripts/test-mapsight.js
const assert = require('assert');
global.window = {};
require('../shared/map-render.js');
const R = window.MapRender;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// Point in polygon [x, y, ...] (even-odd).
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// A 10×10 room (grid units), split by a wall at x = 5 with a door from y = 4 to y = 6, and a pillar.
const vtt = {
  format: 0.3,
  resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 50 },
  line_of_sight: [
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }],
    [{ x: 5, y: 0 }, { x: 5, y: 4 }],
    [{ x: 5, y: 6 }, { x: 5, y: 10 }],
  ],
  objects_line_of_sight: [[{ x: 2, y: 7 }, { x: 3, y: 7 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 2, y: 7 }]],
  portals: [{ position: { x: 5, y: 5 }, bounds: [{ x: 5, y: 4 }, { x: 5, y: 6 }], rotation: 0, closed: true, freestanding: false }],
  lights: [],
  image: 'iVBORw0KGgo=',
};

test('a .dd2vtt file: grid, walls (including objects), doors and the picture', () => {
  const v = R.fromVtt(vtt);
  assert.strictEqual(v.ppg, 50); assert.strictEqual(v.cols, 10);
  assert.ok(v.still.startsWith('data:image/png;base64,'));
  assert.strictEqual(v.walls.length, 4);
  assert.deepStrictEqual(v.doors, [{ pts: [[5, 4], [5, 6]], open: false }]);
  assert.strictEqual(R.fromVtt({ resolution: {} }), null, 'no grid size: not a VTT file');
});

test('layout: scaled to the map picture, in pixels', () => {
  const l = R.layout(R.fromVtt(vtt), 1000); // exported at 50 px a square, shown on a 1000 px picture: 100 px squares
  assert.deepStrictEqual(l.grid, { size: 100, ox: 0, oy: 0 });
  assert.deepStrictEqual(l.walls[1], [500, 0, 500, 400]);
  assert.deepStrictEqual(l.doors[0], { id: 'd0', pts: [500, 400, 500, 600], open: false });
  const moved = R.layout(R.fromVtt({ ...vtt, resolution: { ...vtt.resolution, map_origin: { x: 0.5, y: 0 } } }), 500);
  assert.strictEqual(moved.grid.ox, 25, 'an origin half a square in shifts the grid');
  assert.deepStrictEqual(moved.walls[1], [225, 0, 225, 200]);
});

const map = (open) => { const l = R.layout(R.fromVtt(vtt), 500); return { walls: l.walls, doors: l.doors.map(d => ({ ...d, open })) }; };

test('sight: walls and a closed door hide the other side; an open door shows it', () => {
  const closed = R.sight(R.segments(map(false)), 125, 250, 2000);
  assert.ok(inside(closed, 200, 100), 'sees its own side');
  assert.ok(!inside(closed, 375, 250), 'not through the closed door');
  assert.ok(!inside(closed, 375, 50), 'not through the wall');
  const open = R.sight(R.segments(map(true)), 125, 250, 2000);
  assert.ok(inside(open, 375, 250), 'straight through the open door');
  assert.ok(!inside(open, 450, 30), 'but not round the corner behind the wall');
  assert.ok(open.length < 400, `a small polygon (${open.length / 2} points)`);
});

test('sight: objects cast shadows, and range is limited by the clip, not the polygon', () => {
  const s = R.sight(R.segments(map(false)), 125, 250, 2000);
  assert.ok(!inside(s, 135, 450), 'behind the pillar'); // pillar at x 100–150, y 350–400
  assert.ok(inside(s, 60, 450), 'beside it');
  const near = R.sight(R.segments(map(false)), 125, 250, 50);
  assert.ok(near.every((n, i) => Math.abs(n - (i % 2 ? 250 : 125)) <= 51), 'stays within the range square');
});

test('moves: walls and closed doors block, open doors and wall ends do not', () => {
  const closed = R.segments(map(false)), open = R.segments(map(true));
  assert.ok(R.blocked(closed, 225, 125, 275, 125), 'through the wall');
  assert.ok(R.blocked(closed, 225, 250, 275, 250), 'through the closed door');
  assert.ok(!R.blocked(open, 225, 250, 275, 250), 'through the open door');
  assert.ok(!R.blocked(closed, 25, 25, 75, 75), 'inside one room');
  assert.ok(!R.blocked(open, 225, 175, 275, 225), 'diagonally past the end of a wall into the doorway');
});

for (const [name, fn] of tests) {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
}
console.log(process.exitCode ? `${passed}/${tests.length} map sight checks passed.` : `All ${passed} map sight checks passed.`);
