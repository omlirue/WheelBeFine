const ROAD_HALF = 56;       // half the width of the road (two lanes)
const BIKE_LANE = 24;
const CROSS_HALF_W = 46;    // half the width of a cross street at a traffic light       // width of the green bike lane (Manhattan drive)
const LANE_CENTER = 28;     // center of the right-hand lane, measured from the yellow line
const TRACK = { W: 1800, H: 1100, R: 260 };

const LEVELS = [
  {
    steps: [
      'Press the gas gently so the car starts rolling forward.',
      'Steer into the glowing yellow circle around cone 1. The yellow arrow next to your car always points to it.',
      'When you reach a circle, the next cone lights up. Visit all 5 cones in order: 1, 2, 3, 4, 5.',
      'Then drive into the green PARK box and brake until the speed reads 0 mph.'
    ],
    id: 1, type: 'lot', name: 'Empty Parking Lot', speedLimit: 10,
    short: 'Gentle gas, smooth braking, and steering at low speed',
    skills: [
      'Pressing the gas gently so the car rolls forward slowly',
      'Steering toward a target at low speed',
      'Braking smoothly to a full stop in a parking space',
    ],
    tip: 'Many new drivers start in an empty parking lot, like a school or church lot on a weekend morning. Low speeds and open space make it a low-stress place to get a feel for the pedals.',
    startMsg: 'Your goal: drive your car into each yellow circle, starting with cone 1. The yellow arrow by your car points the way.',
    cones: [
      { x: -520, y: -180 }, { x: -60, y: -300 }, { x: 460, y: -140 }, { x: 420, y: 250 }, { x: 40, y: 330 },
    ],
    finish: { x: -260, y: 330 },
  },
  {
    steps: [
      'Drive around the loop in the right-hand lane. Keep the yellow dashes on your left.',
      'Ease off the gas before each curve.',
      'Finish by crossing the checkered line where you started.',
    ],
    id: 2, type: 'road', name: 'Quiet Loop', speedLimit: 25,
    short: 'Staying in your lane, keeping a steady speed, and easing through curves',
    skills: [
      'Staying in the right-hand lane',
      'Easing off the gas before curves',
      'Keeping a steady speed under the limit',
    ],
    tip: 'Look far down the road to where you want to go, not at the hood of the car. Your hands naturally follow your eyes, which makes steering smoother.',
    startMsg: 'Stay in the right lane, between the yellow dashes and the white edge line. Drive one full lap.',
    stops: [], crosswalks: [], traffic: false,
  },
  {
    steps: [
      'Drive one lap in the right-hand lane.',
      'At each stop sign (2 total), brake gently and stop at the white line until the speed reads 0.',
      'Then keep going to the checkered finish line.',
    ],
    id: 3, type: 'road', name: 'Stop Signs', speedLimit: 25,
    short: 'Spotting stop signs early and coming to a full, complete stop',
    skills: [
      'Spotting a stop sign early',
      'Braking gradually instead of all at once',
      'Coming to a complete stop behind the white line',
    ],
    tip: 'A complete stop means the car stops moving entirely, not just slowing down. Counting "one, two" after you stop is a simple habit that helps.',
    startMsg: 'Watch for red stop signs on the right. Brake gently and come to a full stop at the white line.',
    stops: [['right', 0.55], ['left', 0.55]], crosswalks: [], traffic: false,
  },
  {
    steps: [
      'Drive one lap in the right-hand lane.',
      'When someone steps into a white-striped crosswalk (2 total), slow down and wait until they are all the way across.',
      'Stop fully at the stop sign, then keep going to the checkered finish line.',
    ],
    id: 4, type: 'road', name: 'Crosswalks', speedLimit: 25,
    short: 'Watching for pedestrians and yielding at crosswalks',
    skills: [
      'Watching the sidewalks for people',
      'Slowing down early near crosswalks',
      'Waiting until a pedestrian is fully across',
    ],
    tip: 'In every state, drivers must yield to pedestrians in a crosswalk. If you\'re unsure, slow down. Waiting a few extra seconds is always fine.',
    startMsg: 'People may step into the white-striped crosswalks. Slow down and let them cross.',
    stops: [['right', 0.5]], crosswalks: [['top', 0.72], ['bottom', 0.45]], traffic: false,
  },
  {
    steps: [
      'Follow the blue car around one lap. Don\'t try to pass it.',
      'Keep a big gap behind it. If the gap starts to shrink, ease off the gas.',
      'Stop at both stop signs, let people finish crossing, and finish at the checkered line.',
    ],
    id: 5, type: 'road', name: 'Light Traffic', speedLimit: 25,
    short: 'Keeping a safe following distance and staying patient in traffic',
    skills: [
      'Keeping a safe following distance',
      'Staying patient behind a slower car',
      'Putting it all together: stop signs, crosswalks, and traffic',
    ],
    tip: 'A common rule is to stay at least 3 seconds behind the car in front. When it passes a sign or tree, count "one-thousand-one, one-thousand-two, one-thousand-three" before you reach it.',
    startMsg: 'There\'s a car ahead of you. Stay calm, leave plenty of space, and don\'t rush.',
    stops: [['right', 0.55], ['left', 0.55]], crosswalks: [['bottom', 0.5]], traffic: true, aiColor: '#4F86C6',
  },
  {
    steps: [
      'Drive one lap of the city block in the right-hand lane, behind the yellow taxi.',
      'Stay out of the green bike lane on your right. People on Citi Bikes and e-scooters ride there.',
      'A delivery truck is parked in the bike lane. Riders will swerve into your lane to get around it, so slow down and give them room.',
      'Every corner is a right turn. Slow down before you turn: people may jaywalk across the street in the middle of your turn (3 total).',
      'Obey the 3 traffic lights: stop behind the white line on red, and wait for green.',
      'A city bus ahead stops at bus stops. Wait behind it patiently. Never cross the yellow line to pass: cars and a bus are coming the other way.',
      'Finish at the checkered line.',
    ],
    id: 6, type: 'road', name: 'Manhattan Streets', speedLimit: 25, city: true,
    short: 'Traffic lights, sharing the road with bikes and buses, and turning safely around jaywalkers',
    skills: [
      'Sharing the road with cyclists and e-scooter riders',
      'Staying out of the bike lane, even while turning',
      'Expecting people to cross where there is no crosswalk',
    ],
    tip: 'New York City\'s default speed limit is 25 mph. Before every right turn, check your right mirror and look over your shoulder for bikes, then turn slowly so you can stop for anyone stepping off the curb.',
    startMsg: 'Welcome to the city! Watch the bike lane on your right and take every turn slowly.',
    dims: { W: 1500, H: 1000, R: 130 },
    stops: [], crosswalks: [['top', 0.62]], traffic: true, aiColor: '#F2C230',
    jaywalkers: [['top', 0.9, 34], ['right', 0.95, 42], ['bottom', 0.92, 30]],
    truck: ['right', 0.45],
    busStops: [['right', 0.18], ['bottom', 0.55]],
    lights: [['top', 0.36, false], ['right', 0.78, true], ['bottom', 0.3, true]],
    vehicles: [
      { kind: 'bus', dir: 1, P: 1150, color: '#2F6FB0' },
      { kind: 'car', dir: -1, P: 500, color: '#9AA5AE' },
      { kind: 'bus', dir: -1, P: 1350, color: '#2F6FB0' },
      { kind: 'car', dir: -1, P: 2100, color: '#B23A3A' },
      { kind: 'car', dir: -1, P: 2800, color: '#F2C230' },
      { kind: 'car', dir: -1, P: 3500, color: '#2B3236' },
      { kind: 'car', dir: -1, P: 4200, color: '#E8E8E8' },
    ],
    riders: [
      { P: 260, v: 62, kind: 'bike' }, { P: 1100, v: 48, kind: 'scooter' }, { P: 1900, v: 66, kind: 'bike' },
      { P: 2700, v: 55, kind: 'bike' }, { P: 3600, v: 50, kind: 'scooter' }, { P: 4400, v: 60, kind: 'bike' },
    ],
  },
];

const PASS_SCORE = 60;   // score needed to complete a drive and unlock the next one
const LEVEL_EXTRAS = {
  1: { chartName: 'Parking Lot', difficulty: 1, diffLabel: 'Beginner', color: '#D4E09B', setting: 'Parking lot' },
  2: { chartName: 'Quiet Loop', difficulty: 2, diffLabel: 'Easy', color: '#CBDFBD', setting: 'Quiet streets' },
  3: { chartName: 'Stop Signs', difficulty: 2, diffLabel: 'Easy', color: '#F6C85F', setting: 'Quiet streets' },
  4: { chartName: 'Crosswalks', difficulty: 3, diffLabel: 'Medium', color: '#A9CBE8', setting: 'Neighborhood' },
  5: { chartName: 'Traffic', difficulty: 4, diffLabel: 'Tricky', color: '#F19C79', setting: 'Neighborhood traffic' },
  6: { chartName: 'Manhattan', difficulty: 5, diffLabel: 'Final boss', color: '#F6C85F', setting: 'Manhattan', boss: true },
};
LEVELS.forEach(l => Object.assign(l, LEVEL_EXTRAS[l.id]));

// Small predictable random number generator, so trees are in the same spots every time.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A closed road made of many short straight pieces.
class Track {
  constructor(pts) {
    this.pts = pts;
    this.n = pts.length;
    this.cum = [0];
    this.dirs = [];
    for (let i = 0; i < this.n; i++) {
      const a = pts[i], b = pts[(i + 1) % this.n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      this.dirs.push({ x: dx / len, y: dy / len, len });
      this.cum.push(this.cum[i] + len);
    }
    this.length = this.cum[this.n];
  }

  wrap(s) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  segAt(s) {
    let lo = 0, hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Point at distance s along the road, shifted sideways by `off`
  // (positive = to the driver's right).
  pointAt(s, off = 0) {
    s = this.wrap(s);
    const i = this.segAt(s);
    const d = this.dirs[i], a = this.pts[i];
    const t = s - this.cum[i];
    return { x: a.x + d.x * t - d.y * off, y: a.y + d.y * t + d.x * off, angle: Math.atan2(d.y, d.x) };
  }

  // Where is (x, y) relative to the road? Returns distance along it (s)
  // and sideways offset from the yellow center line (positive = right).
  project(x, y) {
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.pts[i], d = this.dirs[i];
      let t = (x - a.x) * d.x + (y - a.y) * d.y;
      t = Math.max(0, Math.min(d.len, t));
      const px = a.x + d.x * t - x, py = a.y + d.y * t - y;
      const dist2 = px * px + py * py;
      if (dist2 < best) { best = dist2; bi = i; bt = t; }
    }
    const a = this.pts[bi], d = this.dirs[bi];
    const offset = (x - a.x) * -d.y + (y - a.y) * d.x;
    return { s: this.cum[bi] + bt, offset };
  }
}

function roundedRectLoop(w, h, r, step) {
  const pts = [];
  const hw = w / 2, hh = h / 2;
  const line = (x1, y1, x2, y2) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let i = 0; i < n; i++) pts.push({ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n });
  };
  const arc = (cx, cy, a1, a2) => {
    const n = Math.max(2, Math.round(Math.abs(a2 - a1) * r / step));
    for (let i = 0; i < n; i++) {
      const a = a1 + (a2 - a1) * i / n;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  line(-hw + r, -hh, hw - r, -hh);            // top, heading east
  arc(hw - r, -hh + r, -Math.PI / 2, 0);
  line(hw, -hh + r, hw, hh - r);              // right side, heading south
  arc(hw - r, hh - r, 0, Math.PI / 2);
  line(hw - r, hh, -hw + r, hh);              // bottom, heading west
  arc(-hw + r, hh - r, Math.PI / 2, Math.PI);
  line(-hw, hh - r, -hw, -hh + r);            // left side, heading north
  arc(-hw + r, -hh + r, Math.PI, Math.PI * 1.5);
  return pts;
}

// Distance along the track for a spot `t` (0..1) along one straight side.
function sideS(track, side, t) {
  const { W, H, R } = track.dims || TRACK, hw = W / 2, hh = H / 2;
  let p;
  if (side === 'top') p = { x: -hw + R + t * (W - 2 * R), y: -hh };
  else if (side === 'right') p = { x: hw, y: -hh + R + t * (H - 2 * R) };
  else if (side === 'bottom') p = { x: hw - R - t * (W - 2 * R), y: hh };
  else p = { x: -hw, y: hh - R - t * (H - 2 * R) };
  return track.project(p.x, p.y).s;
}

function closedPath(points) {
  const p = new Path2D();
  points.forEach((pt, i) => (i ? p.lineTo(pt.x, pt.y) : p.moveTo(pt.x, pt.y)));
  p.closePath();
  return p;
}

const HOUSE_COLORS = [['#F4E3C3', '#B5664A'], ['#DCE8F2', '#5A6F86'], ['#F2D8D5', '#8C4F4A'], ['#E4EFD9', '#5E7A4C'], ['#F7EDD0', '#8A6D3B']];

const World = {
  build(level) {
    const rnd = mulberry32(level.id * 9973 + 7);
    const w = { type: level.type, trees: [], houses: [], patches: [] };

    for (let i = 0; i < 160; i++) {
      w.patches.push({ x: -1500 + rnd() * 3000, y: -1100 + rnd() * 2200, rx: 40 + rnd() * 90, ry: 20 + rnd() * 50, a: rnd() * Math.PI });
    }

    if (level.type === 'lot') {
      w.lot = { x: -700, y: -450, w: 1400, h: 900 };
      w.start = { x: -520, y: 320, a: -Math.PI / 2 };
      w.cones = level.cones.map(c => ({ x: c.x, y: c.y }));
      w.finish = { x: level.finish.x, y: level.finish.y };
      for (let i = 0; i < 170; i++) {
        const x = -1400 + rnd() * 2800, y = -1050 + rnd() * 2100;
        if (x > w.lot.x - 70 && x < w.lot.x + w.lot.w + 70 && y > w.lot.y - 70 && y < w.lot.y + w.lot.h + 70) continue;
        w.trees.push({ x, y, r: 18 + rnd() * 16, shade: rnd() });
      }
      return w;
    }

    const dims = level.dims || TRACK;
    const track = new Track(roundedRectLoop(dims.W, dims.H, dims.R, 12));
    track.dims = dims;
    const L = track.length;
    w.city = !!level.city;
    w.track = track;
    w.s0 = sideS(track, 'top', 0.08);
    const sp = track.pointAt(w.s0, LANE_CENTER);
    w.start = { x: sp.x, y: sp.y, a: sp.angle };

    // E = distance from the starting point, measured along the road.
    const toE = s => (s - w.s0 + L) % L;
    w.stops = (level.stops || []).map(([side, f]) => { const s = sideS(track, side, f); return { s, E: toE(s) }; });
    w.crosswalks = (level.crosswalks || []).map(([side, f]) => { const s = sideS(track, side, f); return { s, E: toE(s) }; });
    w.curves = ['top', 'right', 'bottom', 'left'].map(side => toE(sideS(track, side, 1)));
    // Jaywalkers cross in the middle of a corner, partway through your turn.
    const arc = dims.R * Math.PI / 2;
    (level.jaywalkers || []).forEach(([side, f, speed]) => {
      const s = sideS(track, side, 1) + arc * (f - 0.5);
      w.crosswalks.push({ s, E: toE(s), jaywalk: true, speed });
    });
    w.crosswalks.sort((a, b) => a.E - b.E);
    w.lights = (level.lights || []).map(([side, f, scripted]) => { const s = sideS(track, side, f); return { s, E: toE(s), scripted }; });
    w.busStops = (level.busStops || []).map(([side, f]) => { const s = sideS(track, side, f); return { s, E: toE(s) }; });
    if (level.truck) {
      const s = sideS(track, level.truck[0], level.truck[1]);
      w.truck = { s, E: toE(s) };
    }

    w.paths = {
      center: closedPath(track.pts),
      edgeL: closedPath(track.pts.map((_, i) => track.pointAt(track.cum[i], -(ROAD_HALF - 5)))),
      edgeR: closedPath(track.pts.map((_, i) => track.pointAt(track.cum[i], ROAD_HALF - 5))),
    };

    if (w.city) return World.buildCity(w, track, rnd);

    // Houses along the outside of the loop.
    for (let s = 60; s < L; s += 240) {
      const p = track.pointAt(s, -(ROAD_HALF + 88));
      const [wall, roof] = HOUSE_COLORS[Math.floor(rnd() * HOUSE_COLORS.length)];
      w.houses.push({ x: p.x, y: p.y, a: p.angle, wall, roof });
    }

    // Trees everywhere that isn't road or house.
    for (let i = 0; i < 260; i++) {
      const x = -1450 + rnd() * 2900, y = -1050 + rnd() * 2100;
      if (Math.abs(track.project(x, y).offset) < ROAD_HALF + 48) continue;
      if (w.houses.some(h => Math.hypot(h.x - x, h.y - y) < 70)) continue;
      w.trees.push({ x, y, r: 16 + rnd() * 18, shade: rnd() });
    }
    return w;
  },

  // City blocks: sidewalks, a green bike lane, and buildings on both sides.
  buildCity(w, track, rnd) {
    const L = track.length;
    const off = o => closedPath(track.pts.map((_, i) => track.pointAt(track.cum[i], o)));
    w.paths.bikeEdge = off(ROAD_HALF + BIKE_LANE);
    w.paths.bikeMid = off(ROAD_HALF + BIKE_LANE / 2);
    w.paths.walkIn = off(ROAD_HALF + BIKE_LANE + 16);
    w.paths.walkOut = off(-(ROAD_HALF + 16));
    w.buildings = [];
    const colors = ['#8C7B6B', '#A89A8C', '#6F7C85', '#B5A48F', '#7D6A5A', '#9AA3A8', '#C2B6A3', '#5F6B73'];
    const nearCross = (x, y) => {
      const pr = track.project(x, y);
      return Math.abs(pr.offset) < 380 && w.lights.some(l => Math.abs(track.wrap(pr.s - l.s + L / 2) - L / 2) < CROSS_HALF_W + 34);
    };
    const fits = (x, y, gap) => !nearCross(x, y) && !w.buildings.some(b => Math.hypot(b.x - x, b.y - y) < gap);
    const place = (s, o) => {
      const p = track.pointAt(s, o);
      if (!fits(p.x, p.y, 62)) return;
      w.buildings.push({
        x: p.x, y: p.y, a: p.angle, w: 58, d: 58,
        h: 90 + rnd() * 130, color: colors[Math.floor(rnd() * colors.length)], seed: rnd(),
      });
    };
    for (let s = 0; s < L; s += 66) {
      place(s, ROAD_HALF + BIKE_LANE + 34 + 30);   // inside the block
      place(s, -(ROAD_HALF + 34 + 30));            // across the street
    }
    // Fill in more buildings behind the first row.
    for (let i = 0; i < 500; i++) {
      const x = -1300 + rnd() * 2600, y = -950 + rnd() * 1900;
      if (Math.abs(track.project(x, y).offset) < ROAD_HALF + BIKE_LANE + 70) continue;
      if (!fits(x, y, 70)) continue;
      w.buildings.push({ x, y, a: 0, w: 58, d: 58, h: 90 + rnd() * 160, color: colors[Math.floor(rnd() * colors.length)], seed: rnd() });
    }
    w.patches = [];
    return w;
  },
};
