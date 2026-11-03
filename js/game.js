// The driving simulation: car physics, driving rules, the coach, and drawing.

const CAR_LEN = 46, CAR_W = 24, WHEELBASE = 30;
const PX_PER_MPH = 6;          // 25 mph = 150 world units per second
const PED_SPEED = 30, AI_SPEED = 100;
const PLAYER_COLOR = '#D95D4A';   // your car: a cheerful coral
const BIKE_OFF = ROAD_HALF + BIKE_LANE / 2;   // middle of the bike lane
const SHIRTS = ['#C0392B', '#2D9CDB', '#F2994A', '#6FCF97', '#9B51E0', '#F2C94C'];
const STOP_BACK = 58;          // stop line distance before the middle of an intersection
const CROSS_HALF = 46;         // half the width of a cross street
const TARGET_R = 58;           // drive within this distance of a cone to count it

// Plain-language hints that match the controls the player is using.
function gasHint() {
  return Input.mode === 'touch' ? 'Hold the green Gas button' : 'Press and hold the Up arrow (or W)';
}
function brakeHint() {
  return Input.mode === 'touch' ? 'Hold the red Brake button' : 'Press the Down arrow (or S)';
}
function steerHint(dir) {
  if (Input.mode === 'touch') return 'Drag the wheel to the ' + dir;
  return 'Press the ' + (dir === 'left' ? 'Left' : 'Right') + ' arrow';
}

// How to back up with the controls the player is using.
function reverseHint() {
  return Input.mode === 'touch' ? 'keep holding Brake' : 'hold the Down arrow (or S)';
}

function computeScore(st) {
  const penalty =
    st.offroad * 6 + st.wrongLaneTime * 4 + st.speedingTime * 2 +
    st.harshBrakes * 5 + st.harshTurns * 4 + st.rolledStops * 10 +
    st.missedYields * 15 + (st.ranReds || 0) * 15 + st.closeCalls * 15 + st.tailgateTime * 3 +
    (st.bikeLaneTime || 0) * 4 + (st.passedClose || 0) * 8 + (st.skids || 0) * 6;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

const Game = {
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.coachEl = document.getElementById('coach');
    this.hud = {
      speed: document.getElementById('hud-speed'),
      speedBox: document.getElementById('hud-speedbox'),
      bar: document.getElementById('hud-bar'),
      goal: document.getElementById('hud-goal'),
      recover: document.getElementById('hud-recover'),
      mission: document.getElementById('hud-mission'),
    };
    this.raf = null;
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.cw = r.width || window.innerWidth;
    this.ch = r.height || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  },

  start(level, onFinish) {
    this.stop();
    this.level = level;
    this.onFinish = onFinish;
    this.world = World.build(level);
    const s = this.world.start;
    this.car = { x: s.x, y: s.y, a: s.a, v: 0, vy: 0, r: 0, ax: 0, ay: 0 };
    this.skidMarks = [];
    this.lastWheels = null;
    this.cam = { x: s.x, y: s.y };
    this.time = 0;
    this.P = 0;                // how far along the lap you've driven
    this.lastS = this.world.track ? this.world.track.project(s.x, s.y).s : 0;
    this.offset = LANE_CENTER;
    this.revHold = 0;
    this.done = false;
    this.paused = false;
    this.coneIdx = 0;
    this.flags = {};
    this.cool = {};
    this.queue = [];
    this.current = null;
    this.coachT = 0;
    this.coachEl.className = 'coach';
    this.coachEl.textContent = '';
    this._mph = -1;
    this._goal = null;
    this._mission = null;
    this.recover = null;
    this.hints = null;
    this._rec = null;

    const W = this.world;
    this.stops = (W.stops || []).map(x => ({ ...x, minV: Infinity, done: false, warned: false }));
    this.crosswalks = (W.crosswalks || []).map(x => ({ ...x, state: 'idle', lat: 0, resolved: false, near: false, hit: false }));
    this.ai = level.traffic ? { P: 300, v: 0, stopTimer: 0, lastStop: -1, braking: false, color: level.aiColor || '#E9965A' } : null;
    if (this.ai) this.placeAi();
    // Manhattan drive: people on bikes and e-scooters in the bike lane
    this.riders = (level.riders || []).map((r, i) => ({ ...r, off: BIKE_OFF, prevRel: null, shirt: SHIRTS[i % SHIRTS.length] }));
    // Manhattan drive: a bus in your lane, plus oncoming cars and a bus in the other lane
    this.vehicles = (level.vehicles || []).map(v => ({
      ...v, v: v.dir > 0 ? 0 : (v.kind === 'bus' ? 80 : 105), len: v.kind === 'bus' ? 92 : CAR_LEN,
      off: v.dir > 0 ? LANE_CENTER : -LANE_CENTER, stopTimer: 0, lastStop: -1, braking: false,
    }));
    this.placeVehicles();
    this.lights = (W.lights || []).map(l => ({ ...l, state: 'green', timer: 0, triggered: false, done: false, minV: Infinity, cross: null, warned: false }));
    this.truckWarned = false;
    this.scriptedRider = false;
    this.placeRiders();

    this.stats = {
      time: 0, offroad: 0, wrongLaneTime: 0, speedingTime: 0, harshBrakes: 0, harshTurns: 0,
      rolledStops: 0, goodStops: 0, skids: 0, yields: 0, missedYields: 0, closeCalls: 0, tailgateTime: 0,
      stopsTotal: this.stops.length, crosswalksTotal: this.crosswalks.length, traffic: !!this.ai,
      city: !!W.city, bikeLaneTime: 0, passedClose: 0, gaveRoom: 0,
      lightsTotal: (W.lights || []).length, ranReds: 0, redStops: 0,
    };

    this.resize();
    this.say(level.startMsg, 'info');
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.loop(t));
  },

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  },

  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.lastDt = dt;
    this.last = t;
    if (!this.paused) {
      if (!this.done) {
        Input.update(dt);
        this.update(dt);
      }
      this.tickCoach(dt);
    }
    this.render();
    this.updateHud();
    this.raf = requestAnimationFrame(tt => this.loop(tt));
  },

  // ---------- Coach messages ----------
  say(text, tone = 'info', key = null, cooldown = 8) {
    if (key) {
      if (this.cool[key] != null && this.time - this.cool[key] < cooldown) return;
      this.cool[key] = this.time;
    }
    this.queue.push({ text, tone });
  },

  tickCoach(dt) {
    this.coachT += dt;
    if (this.current && this.coachT > (this.queue.length ? 2.4 : 5)) {
      this.coachEl.classList.remove('show');
      this.current = null;
      this.coachT = 0;
    }
    if (!this.current && this.queue.length && this.coachT > 0.25) {
      this.current = this.queue.shift();
      this.coachEl.textContent = this.current.text;
      this.coachEl.className = 'coach show ' + this.current.tone;
      this.coachT = 0;
    }
  },

  // ---------- Simulation ----------
  update(dt) {
    const c = this.car, st = this.stats, lv = this.level;
    this.time += dt;
    st.time = this.time;

    const brk = Input.brake;
    const prevV = c.v;

    // Holding the brake after the car has stopped shifts into reverse
    if (brk > 0.02 && c.v < 7) this.revHold += dt;
    else this.revHold = 0;
    const reverse = this.revHold > 0.4;

    // Realistic car physics (see physics.js). Grass has about half the grip of asphalt.
    Physics.step(c, { throttle: Input.throttle, brake: brk, steer: Input.steer, reverse }, dt,
      this.offroad ? { mu: 0.5, rolling: 0.06 } : { mu: 0.9, rolling: 0.013 });

    // Skids: the tires were asked for more grip than they have
    // A real skid lasts a moment: only count it after about 0.2 s of sliding
    this.skidTime = c.skidFront || c.skidRear ? (this.skidTime || 0) + dt : 0;
    const skidding = this.skidTime > 0.2;
    this.addSkidMarks(skidding);
    if (skidding && !this.flags.skid) {
      this.flags.skid = true;
      if (this.time - (this.cool.skidCount || -9) > 1.5) {
        this.cool.skidCount = this.time;
        st.skids++;
        this.say(c.skidRear
          ? 'The back of the car is sliding! Steer gently the way you want to go and ease off the pedals.'
          : 'Your front tires are skidding, so the car won\'t turn. Ease off the gas, unwind the wheel a little, and slow down before turns.',
          'tip', 'skid', 4);
      }
    } else if (!skidding) {
      this.flags.skid = false;
    }

    // Smoothness: hard braking (over about 0.55 g) and sharp turns (over about 0.5 g sideways)
    const decel = -c.ax;
    if (prevV > 40 && decel > 5.4) {
      if (!this.flags.braking) {
        this.flags.braking = true;
        if (this.time - (this.cool.harshBrake || -9) > 2) {
          st.harshBrakes++;
          this.say('That was a sudden stop. Try pressing the brake earlier and more gently.', 'tip', 'harshBrake', 2);
        }
      }
    } else if (decel < 3.5) {
      this.flags.braking = false;
    }
    const lateral = Math.abs(c.ay);
    if (Math.abs(c.v) > 50 && lateral > 4.9) {
      if (!this.flags.turning) {
        this.flags.turning = true;
        if (this.time - (this.cool.harshTurn || -9) > 2) {
          st.harshTurns++;
          this.say('Sharp turn! Slow down first, then turn the wheel a little at a time.', 'tip', 'harshTurn', 2);
        }
      }
    } else if (lateral < 3.4) {
      this.flags.turning = false;
    }

    // Speed limit
    const mph = Math.abs(c.v) / PX_PER_MPH;
    if (mph > lv.speedLimit + 3) {
      st.speedingTime += dt;
      this.say('You\'re above the speed limit (' + lv.speedLimit + ' mph). Ease off the gas.', 'tip', 'speed', 7);
    }

    if (this.world.type === 'lot') this.updateLot(dt);
    else this.updateRoad(dt, mph);
    this.updateRecovery();
  },

  // Tire marks: remember where the wheels were while skidding, and draw them on the ground.
  addSkidMarks(on) {
    const c = this.car, ca = Math.cos(c.a), sa = Math.sin(c.a);
    const wheel = (fx, fy) => ({ x: c.x + ca * fx - sa * fy, y: c.y + sa * fx + ca * fy });
    const now = [wheel(-15, -9), wheel(-15, 9), wheel(15, -9), wheel(15, 9)];
    if (on && this.lastWheels) {
      const which = c.skidRear && c.skidFront ? [0, 1, 2, 3] : c.skidRear ? [0, 1] : [2, 3];
      for (const i of which) this.skidMarks.push([this.lastWheels[i].x, this.lastWheels[i].y, now[i].x, now[i].y]);
      if (this.skidMarks.length > 1600) this.skidMarks.splice(0, this.skidMarks.length - 1600);
    }
    this.lastWheels = now;
  },

  drawSkidMarks() {
    if (!this.skidMarks.length) return;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(25, 25, 25, 0.35)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of this.skidMarks) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
    ctx.lineCap = 'butt';
  },

  // How fast AI drivers take corners: gentle, about 0.3 g sideways.
  cornerLimit(P, offset) {
    const W = this.world;
    if (!W.track || !W.curves) return Infinity;
    const R = W.track.dims.R, arc = R * Math.PI / 2;
    let lim = Infinity;
    for (const E of W.curves) {
      const d = this.wrapRel(P - E);
      if (d > -110 && d < arc + 110) lim = Math.min(lim, Physics.curveSpeed(Math.max(30, R - offset), 0.3));
    }
    return lim;
  },

  // If you end up off the road (or against the curb), work out which way to go
  // to get back: drive forward if the road is in front of you, otherwise back up.
  updateRecovery() {
    const c = this.car, W = this.world;
    let rec = null;
    if (W.type === 'lot') {
      // Close to an edge of the lot and pointed at it? Then you need to back up.
      const L = W.lot, near = 34, hx = Math.cos(c.a), hy = Math.sin(c.a);
      const pinned =
        (c.x < L.x + near && hx < -0.3) || (c.x > L.x + L.w - near && hx > 0.3) ||
        (c.y < L.y + near && hy < -0.3) || (c.y > L.y + L.h - near && hy > 0.3);
      if (pinned) rec = { mode: 'back' };
    } else if (this.offroad) {
      const pr = W.track.project(c.x, c.y);
      const p = W.track.pointAt(pr.s + 25, LANE_CENTER);
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
      const facing = (dx * Math.cos(c.a) + dy * Math.sin(c.a)) / d;   // 1 = road straight ahead
      rec = { mode: facing > 0.35 ? 'forward' : 'back', tx: p.x, ty: p.y };
      // Already reversing toward the road? Keep saying "back up" until you're out.
      if (this.recover && this.recover.mode === 'back' && c.v < -2 && facing < 0.8) rec.mode = 'back';
    }
    const before = this.recover && this.recover.mode;
    this.recover = rec;
    if (rec && rec.mode !== before) {
      if (rec.mode === 'back') this.say('To get unstuck: ' + reverseHint() + ' to back up, then steer ' + (W.type === 'lot' ? 'away from the curb.' : 'toward the road.'), 'tip', 'recoverBack', 6);
      else this.say('The road is ahead of you. Turn gently toward it and drive forward slowly.', 'tip', 'recoverFwd', 6);
    }
    if (!rec && before) this.say('Back on track. Nice recovery!', 'good', 'recovered', 6);
  },

  updateLot() {
    const c = this.car, W = this.world, lot = W.lot, st = this.stats;
    const m = 18;
    const out = c.x < lot.x + m || c.x > lot.x + lot.w - m || c.y < lot.y + m || c.y > lot.y + lot.h - m;
    if (out) {
      c.x = Math.max(lot.x + m, Math.min(lot.x + lot.w - m, c.x));
      c.y = Math.max(lot.y + m, Math.min(lot.y + lot.h - m, c.y));
      c.v = 0; c.vy = 0; c.r = 0;
      if (!this.flags.curb) {
        this.flags.curb = true;
        st.offroad++;
      }
    } else {
      this.flags.curb = false;
    }

    const target = W.cones[this.coneIdx];
    if (target && Math.hypot(target.x - c.x, target.y - c.y) < TARGET_R) {
      this.coneIdx++;
      const left = W.cones.length - this.coneIdx;
      this.queue = [];
      if (left > 1) this.say('Nice! ' + left + ' cones left. Steer into the next yellow circle.', 'good');
      else if (left === 1) this.say('Great! 1 cone left. Steer into the last yellow circle.', 'good');
      else this.say('All cones done! Last step: drive into the green box and brake until you reach 0 mph.', 'info');
    }
    if (this.coneIdx >= W.cones.length) {
      const f = W.finish;
      const inBox = Math.abs(c.x - f.x) < 42 && Math.abs(c.y - f.y) < 30;
      if (inBox && Math.abs(c.v) < 3) this.finish();
      else if (inBox) this.say('You\'re in the PARK box! ' + brakeHint() + ' until the speed reads 0.', 'info', 'hintPark', 5);
    }

    // Friendly hints if it looks like you're not sure what to do
    const h = this.hints || (this.hints = { idle: 0, aim: 0 });
    const dt = this.lastDt || 0;
    h.idle = Math.abs(c.v) < 2 && Input.throttle < 0.05 && !this.recover ? h.idle + dt : 0;
    if (h.idle > 3) this.say('To start rolling: ' + gasHint() + '.', 'tip', 'hintGas', 9);
    const goal = W.cones[this.coneIdx] || W.finish;
    let diff = Math.atan2(goal.y - c.y, goal.x - c.x) - c.a;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    h.aim = c.v > 15 && Math.abs(diff) > 0.9 ? h.aim + dt : 0;
    if (h.aim > 1.6) {
      const what = this.coneIdx < W.cones.length ? 'cone ' + (this.coneIdx + 1) : 'the green PARK box';
      this.say('Turn toward ' + what + ': ' + steerHint(diff > 0 ? 'right' : 'left') + '. The yellow arrow shows the way.', 'tip', 'hintSteer', 8);
    }
  },

  updateRoad(dt, mph) {
    const c = this.car, W = this.world, T = W.track, st = this.stats, L = T.length;
    const pr = T.project(c.x, c.y);
    let ds = pr.s - this.lastS;
    if (ds > L / 2) ds -= L;
    if (ds < -L / 2) ds += L;
    this.lastS = pr.s;
    this.P += ds;
    const off = pr.offset;
    this.offset = off;

    // Staying on the road and in your lane
    const rightEdge = W.city ? ROAD_HALF + BIKE_LANE + 6 : ROAD_HALF + 6;
    this.offroad = off > rightEdge || off < -(ROAD_HALF + 6);
    if (this.offroad && !this.flags.offroad) {
      st.offroad++;
      this.say(W.city ? 'You\'re up on the sidewalk. No problem. Follow the yellow arrow back to your lane.'
        : 'Drifted off the road. No problem. Follow the yellow arrow back to your lane.', 'tip');
    }
    if (W.city && !this.offroad && off > ROAD_HALF + 2 && c.v > 10) {
      st.bikeLaneTime += dt;
      this.say('You\'re in the bike lane. Move left, back into your lane, and keep it clear for riders.', 'tip', 'bikelane', 6);
    }
    this.flags.offroad = this.offroad;

    if (off < -6 && !this.offroad && c.v > 15) {
      st.wrongLaneTime += dt;
      this.flags.wrongT = (this.flags.wrongT || 0) + dt;
      if (this.flags.wrongT > 0.6) this.say('You\'re over the yellow line. Move back into the right-hand lane.', 'tip', 'lane', 6);
    } else {
      this.flags.wrongT = 0;
    }

    // Gentle heads-up before curves
    for (const E of W.curves) {
      const ahead = E - this.P;
      if (W.city) {
        if (ahead > 0 && ahead < 380) this.say('Right turn ahead. Slow down, stay out of the bike lane, and watch for people crossing.', 'info', 'curve', 12);
      } else if (ahead > 0 && ahead < 190 && mph > this.level.speedLimit - 4) {
        this.say('Curve ahead. Ease off the gas before you turn.', 'info', 'curve', 12);
      }
    }

    // Stop signs
    for (const sp of this.stops) {
      if (sp.done) continue;
      const ahead = sp.E - this.P;
      if (ahead < 260 && !sp.warned) {
        sp.warned = true;
        this.say('Stop sign ahead. Ease off the gas and brake gently to a full stop at the white line.', 'info');
      }
      if (ahead < 160 && ahead > -15) sp.minV = Math.min(sp.minV, Math.abs(c.v));
      if (ahead <= -15) {
        sp.done = true;
        if (sp.minV < 4) {
          st.goodStops++;
          this.say('Nice full stop! Look both ways, then go.', 'good');
        } else {
          st.rolledStops++;
          this.say('That was a rolling stop. Next time, wait until the speed shows 0.', 'tip');
        }
      }
    }

    // Crosswalks and pedestrians
    for (const cw of this.crosswalks) {
      const ahead = cw.E - this.P;
      if (cw.state === 'idle' && ahead < 420 && ahead > 140) {
        cw.state = 'crossing';
        cw.lat = this.pedStart();
        this.say(cw.jaywalk ? 'Heads up! Someone is jaywalking across the street in the middle of your turn. Slow down and let them cross.'
          : 'Someone is about to cross. Slow down and let them go first.', 'info');
      }
      if (cw.state === 'crossing') {
        cw.lat -= (cw.speed || PED_SPEED) * dt;
        const p = T.pointAt(cw.s, cw.lat);
        cw.x = p.x; cw.y = p.y;
        if (cw.lat < -ROAD_HALF - 22) cw.state = 'gone';
        if (ahead < 130) cw.near = true;
        if (!cw.hit && Math.hypot(p.x - c.x, p.y - c.y) < 26) {
          cw.hit = true;
          st.closeCalls++;
          c.v = 0; c.vy = 0; c.r = 0;
          this.say('Close call! Pedestrians always have the right of way. Take a breath and keep going when it\'s clear.', 'tip');
        }
      }
      if (!cw.resolved && ahead <= -5) {
        cw.resolved = true;
        if (cw.near && !cw.hit) {
          const inStreet = cw.lat < ROAD_HALF + (W.city ? BIKE_LANE : 24);
          if (cw.state === 'crossing' && cw.lat > -ROAD_HALF * 0.35 && inStreet) {
            st.missedYields++;
            this.say(cw.jaywalk ? 'Careful! You kept going while someone was crossing. Even when people jaywalk, drivers must stop for them.'
              : 'You passed while someone was still in the crosswalk. Wait until they\'re all the way across.', 'tip');
          } else if (cw.state !== 'crossing' || inStreet) {
            st.yields++;
            this.say(cw.jaywalk ? 'Nice. You stopped for the jaywalker.' : 'Great job waiting for the pedestrian.', 'good');
          }
        }
      }
    }

    if (this.ai) this.updateAi(dt);
    if (W.city) { this.updateLights(dt); this.updateTraffic(dt); this.updateCity(dt); }

    if (this.P >= L - 30) this.finish();
  },

  pedStart() {
    return this.world.city ? ROAD_HALF + BIKE_LANE + 20 : ROAD_HALF + 22;
  },

  wrapRel(d) {
    const L = this.world.track.length;
    return ((d % L) + L * 1.5) % L - L / 2;
  },

  // How far a rider swerves out of the bike lane to get around the parked truck.
  truckSwerve(P) {
    const W = this.world;
    if (!W.truck) return 0;
    const d = this.wrapRel(W.truck.E - P);   // > 0 means the truck is still ahead of the rider
    let u = 0;
    if (d < 130 && d > 70) u = (130 - d) / 60;
    else if (d <= 70 && d >= -30) u = 1;
    else if (d < -30 && d > -80) u = (d + 80) / 50;
    return u * u * (3 - 2 * u);
  },

  placeRiders() {
    const T = this.world.track;
    if (!T) return;
    for (const r of this.riders) {
      const p = T.pointAt(this.world.s0 + r.P, r.off);
      r.x = p.x; r.y = p.y; r.a = p.angle;
    }
  },

  // Distance a vehicle should stop in, for any red (or yellow) light ahead of it.
  lightLimit(aheadOf, halfLen, dir, v = 0) {
    let target = Infinity;
    for (const l of this.lights) {
      if (l.state === 'green') continue;
      const d = aheadOf(l.E - dir * STOP_BACK) - halfLen;
      if (d < -halfLen + 2 || d > 200) continue;   // stay stopped until your middle has crossed the line
      if (l.state === 'yellow' && d < v * v / 220) continue;   // too close to stop safely: keep going
      target = Math.min(target, Math.sqrt(2 * 85 * Math.max(0, d)));
    }
    return target;
  },

  updateLights(dt) {
    const c = this.car, st = this.stats, T = this.world.track;
    for (const l of this.lights) {
      const ahead = l.E - STOP_BACK - this.P;        // distance to your stop line
      // Scripted lights change to yellow as you get close, so you practice stopping.
      if (l.scripted && !l.triggered && ahead < 330 && ahead > 0) {
        l.triggered = true; l.state = 'yellow'; l.timer = 2.6;
        this.say('The light ahead is turning yellow. Ease off the gas and get ready to stop at the white line.', 'info');
      }
      if (!l.scripted && !l.warned && ahead < 300 && ahead > 0) {
        l.warned = true;
        this.say('Green light ahead. You can go, but still look left and right as you cross.', 'info');
      }
      if (l.state !== 'green') {
        l.timer -= dt;
        if (l.timer <= 0) {
          if (l.state === 'yellow') {
            l.state = 'red'; l.timer = 7.5;
            l.cross = { lat: -(ROAD_HALF + 260), v: 120, color: ['#4B7BBE', '#E8E8E8', '#B23A3A'][Math.floor(l.E) % 3] };
          } else {
            l.state = 'green';
            if (ahead > -10 && ahead < 140 && Math.abs(c.v) < 5) this.say('Green light! Check that the intersection is clear, then go gently.', 'good');
          }
        }
      }
      // Cross traffic drives through while your light is red
      if (l.cross) {
        const cr = l.cross;
        cr.lat += cr.v * dt;
        const p = T.pointAt(l.s, cr.lat);
        cr.x = p.x; cr.y = p.y; cr.a = p.angle + Math.PI / 2;
        if (cr.lat > ROAD_HALF + 300) l.cross = null;
        else if (Math.hypot(p.x - c.x, p.y - c.y) < 34 && this.time - (this.cool.crossHit || -9) > 3) {
          this.cool.crossHit = this.time;
          st.closeCalls++;
          c.v = 0; c.vy = 0; c.r = 0;
          this.say('Close call with cross traffic! Never go on a red light.', 'tip');
        }
      }
      if (!l.done) {
        if (ahead < 150 && ahead > -5) l.minV = Math.min(l.minV, Math.abs(c.v));
        if (ahead <= 0) {
          l.done = true;
          if (l.state === 'red') {
            st.ranReds++;
            this.say('You went through a red light. On red, stop behind the white line and wait for green.', 'tip');
          } else if (l.scripted && l.minV < 4) {
            st.redStops++;
            this.say('Nice job stopping for the red light and waiting for green.', 'good');
          }
        }
      }
    }
  },

  placeVehicles() {
    const T = this.world.track;
    if (!T) return;
    for (const vh of this.vehicles) {
      const p = T.pointAt(this.world.s0 + vh.P, vh.off);
      vh.x = p.x; vh.y = p.y; vh.a = vh.dir > 0 ? p.angle : p.angle + Math.PI;
    }
  },

  // Buses and cars: keep a gap, stop at bus stops, yield to people and riders.
  updateTraffic(dt) {
    const c = this.car, st = this.stats, W = this.world;
    for (const vh of this.vehicles) {
      const base = vh.kind === 'bus' ? 80 : 105;
      let target = Math.min(base, this.cornerLimit(vh.P, vh.off));
      // distance from this vehicle to a point along the road, in its direction of travel
      const aheadOf = E => vh.dir > 0 ? this.wrapRel(E - vh.P) : this.wrapRel(vh.P - E);
      const brakeFor = d => Math.sqrt(2 * 85 * Math.max(0, d));

      for (const o of this.vehicles) {
        if (o === vh || o.dir !== vh.dir) continue;
        const gap = aheadOf(o.P) - (o.len + vh.len) / 2;
        if (gap > -10 && gap < 220) target = Math.min(target, Math.max(0, (gap - 22) * 1.4));
      }
      for (const cw of this.crosswalks) {
        if (cw.state !== 'crossing' || cw.lat < -ROAD_HALF - 14) continue;
        if (vh.dir < 0 && cw.lat > 0) continue;   // still on the far side
        const d = aheadOf(cw.E) - vh.len / 2 - 22;
        if (d > -15 && d < 140) target = Math.min(target, brakeFor(d));
      }
      target = Math.min(target, this.lightLimit(aheadOf, vh.len / 2, vh.dir, vh.v));
      if (vh.dir > 0) {
        if (vh.P - this.P > 900) target = Math.min(target, 35);   // wait up for the player
        for (const r of this.riders) {
          const rel = this.wrapRel(r.P - vh.P) - vh.len / 2;
          if (r.off < ROAD_HALF + 4 && rel > 0 && rel < 140) target = Math.min(target, r.v * 0.9);
        }
        W.busStops.forEach((bs, i) => {
          if (vh.kind !== 'bus' || vh.lastStop === i) return;
          const d = aheadOf(bs.E);
          if (d > -5 && d < 170) target = Math.min(target, brakeFor(d));
          if (d > -5 && d < 4 && vh.v < 6 && vh.stopTimer <= 0) { vh.stopTimer = 4.5; vh.lastStop = i; }
        });
      } else {
        // Oncoming traffic stops if you're in its lane
        const rel = this.wrapRel(vh.P - this.P);
        if (this.offset < -4 && rel > 0 && rel < 260) target = Math.min(target, brakeFor(rel - vh.len / 2 - 40));
      }
      if (vh.stopTimer > 0) { vh.stopTimer -= dt; target = 0; }

      vh.braking = target < vh.v - 5;
      vh.v = vh.v < target ? Math.min(target, vh.v + 35 * dt) : Math.max(target, vh.v - 110 * dt);
      vh.P += vh.dir * vh.v * dt;
    }
    this.placeVehicles();

    for (const vh of this.vehicles) {
      const rel = this.wrapRel(vh.P - this.P);
      if (vh.dir > 0 && vh.kind === 'bus' && vh.stopTimer > 0 && rel > 0 && rel < 450) {
        this.say('The bus ahead is stopping to pick people up. Wait patiently. Don\'t cross the yellow line to pass it.', 'info', 'busstop', 12);
      }
      if (vh.dir < 0 && this.offset < -4 && rel > 0 && rel < 320) {
        this.say('Oncoming traffic! Move back into your lane, to the right of the yellow line.', 'tip', 'oncoming', 6);
      }
      // Bumping into another vehicle
      if (Math.abs(rel) < (vh.len + CAR_LEN) / 2 - 4 && Math.abs(this.offset - vh.off) < 22 &&
          this.time - (this.cool.vehHit || -9) > 3) {
        this.cool.vehHit = this.time;
        st.closeCalls++;
        c.v = 0; c.vy = 0; c.r = 0;
        this.say(vh.dir < 0 ? 'Close call with oncoming traffic! Always stay on your side of the yellow line.'
          : 'Bumped the ' + (vh.kind === 'bus' ? 'bus' : 'car') + ' ahead. Leave more space and slow down sooner.', 'tip');
      }
    }
  },

  updateCity(dt) {
    const c = this.car, W = this.world, st = this.stats;
    const truckAhead = W.truck ? W.truck.E - this.P : Infinity;

    if (!this.truckWarned && truckAhead < 420 && truckAhead > 0) {
      this.truckWarned = true;
      this.say('A delivery truck is double-parked in the bike lane ahead. Riders may swerve into your lane.', 'info');
    }
    // Make sure there's always a rider going around the truck when you get there.
    if (!this.scriptedRider && truckAhead < 400 && truckAhead > 260) {
      this.scriptedRider = true;
      this.riders.push({ P: this.P + truckAhead - 150, v: 44, kind: 'scooter', off: BIKE_OFF, prevRel: null, shirt: '#E84C3D' });
    }

    for (const r of this.riders) {
      r.P += r.v * dt;
      r.off = BIKE_OFF - 30 * this.truckSwerve(r.P);
    }
    this.placeRiders();

    for (const r of this.riders) {
      const rel = this.wrapRel(r.P - this.P);
      const gap = r.off - this.offset;
      // A rider has moved into your lane just ahead of you
      if (r.off < ROAD_HALF + 2 && rel > 0 && rel < 280) {
        this.say('A rider is swerving around the truck into your lane. Slow down and give them room.', 'info', 'merge', 10);
      }
      // You just passed this rider: did you leave enough space?
      if (r.prevRel != null && r.prevRel > 0 && rel <= 0 && rel > -80) {
        if (gap < 26) {
          st.passedClose++;
          this.say('Too close to that rider! Give people on bikes and scooters at least 3 feet of space when you pass.', 'tip');
        } else if (r.off < ROAD_HALF + 4) {
          st.gaveRoom++;
        }
      }
      r.prevRel = rel;
      if (Math.hypot(r.x - c.x, r.y - c.y) < 22 && this.time - (this.cool.riderHit || -9) > 3) {
        this.cool.riderHit = this.time;
        st.closeCalls++;
        c.v = 0; c.vy = 0; c.r = 0;
        this.say('Close call with a rider! Slow down and stay out of their way. Take a breath, then go when it\'s clear.', 'tip');
      }
    }

    if (W.truck) {
      // The truck fills the bike lane; you only hit it if your car pokes into the bike lane beside it.
      const rel = this.wrapRel(W.truck.E - this.P);
      if (Math.abs(rel) < 36 && this.offset > ROAD_HALF - 12 && this.time - (this.cool.truckHit || -9) > 3) {
        this.cool.truckHit = this.time;
        st.closeCalls++;
        c.v = 0; c.vy = 0; c.r = 0;
        this.say('Bumped the parked truck. Back up a little and steer left around it.', 'tip');
      }
    }
  },

  placeAi() {
    const ai = this.ai, p = this.world.track.pointAt(this.world.s0 + ai.P, LANE_CENTER);
    ai.x = p.x; ai.y = p.y; ai.a = p.angle;
  },

  updateAi(dt) {
    const ai = this.ai, c = this.car, st = this.stats, L = this.world.track.length;
    const ahead = E => ((E - ai.P) % L + L) % L;
    let target = Math.min(AI_SPEED, this.cornerLimit(ai.P, LANE_CENTER));
    if (ai.P - this.P > 650) target = 35;   // wait up for the player

    this.stops.forEach((sp, i) => {
      const d = ahead(sp.E) - 26;
      if (ai.lastStop !== i && d < 160) target = Math.min(target, Math.sqrt(2 * 85 * Math.max(0, d)));
      if (ai.lastStop !== i && d < 3 && ai.v < 6 && ai.stopTimer <= 0) { ai.stopTimer = 2; ai.lastStop = i; }
    });
    for (const cw of this.crosswalks) {
      const d = ahead(cw.E) - 40;
      if (cw.state === 'crossing' && d < 120 && d > -20) target = Math.min(target, Math.sqrt(2 * 85 * Math.max(0, d)));
    }
    target = Math.min(target, this.lightLimit(E => this.wrapRel(E - ai.P), CAR_LEN / 2, 1, ai.v));
    for (const vh of this.vehicles) {
      if (vh.dir < 0) continue;
      const gap = this.wrapRel(vh.P - ai.P) - (vh.len + CAR_LEN) / 2;
      if (gap > -10 && gap < 200) target = Math.min(target, Math.max(0, (gap - 22) * 1.4));
    }
    for (const r of this.riders) {
      const rel = this.wrapRel(r.P - ai.P);
      if (r.off < ROAD_HALF + 4 && rel > 0 && rel < 140) target = Math.min(target, r.v * 0.9);
    }
    if (ai.stopTimer > 0) { ai.stopTimer -= dt; target = 0; }

    ai.braking = target < ai.v - 5;
    ai.v = ai.v < target ? Math.min(target, ai.v + 40 * dt) : Math.max(target, ai.v - 110 * dt);
    ai.P += ai.v * dt;
    this.placeAi();

    // Following distance
    const gap = ai.P - this.P - CAR_LEN;
    if (gap > 0 && gap < 500 && c.v > 30 && this.offset > 4) {
      if (gap / c.v < 1.5) {
        st.tailgateTime += dt;
        this.say('Too close! Drop back and leave more space. In real life, aim for at least 3 seconds.', 'tip', 'tailgate', 7);
      }
    }
    if (Math.hypot(ai.x - c.x, ai.y - c.y) < CAR_LEN * 0.85 && this.time - (this.cool.bump || -9) > 3) {
      this.cool.bump = this.time;
      st.closeCalls++;
      c.v = 0; c.vy = 0; c.r = 0;
      this.say('Bumped the car ahead. Slow down sooner and keep a bigger gap.', 'tip');
    }
  },

  finish() {
    if (this.done) return;
    this.done = true;
    this.queue = [];
    this.say('Drive complete. Nicely done.', 'good');
    const score = computeScore(this.stats);
    const result = { score, stats: { ...this.stats }, completed: true };
    setTimeout(() => {
      if (this.raf && this.done && this.onFinish) this.onFinish(result);
    }, 1400);
  },

  // ---------- HUD ----------
  updateHud() {
    if (!this.keyEls) this.keyEls = {};
    for (const k of ['up', 'down', 'left', 'right']) {
      const on = k === 'up' ? Input.throttle > 0.05 : k === 'down' ? Input.brake > 0.05
        : k === 'left' ? Input.steer < -0.12 : Input.steer > 0.12;
      if (this.keyEls[k] !== on) {
        this.keyEls[k] = on;
        document.querySelectorAll('[data-k="' + k + '"]').forEach(el => el.classList.toggle('on', on));
      }
    }
    const mph = Math.round(Math.abs(this.car.v) / PX_PER_MPH);
    if (mph !== this._mph) {
      this._mph = mph;
      this.hud.speed.textContent = mph;
      this.hud.speedBox.classList.toggle('over', mph > this.level.speedLimit + 3);
    }
    let pct;
    if (this.world.type === 'lot') pct = (this.coneIdx + (this.done ? 1 : 0)) / (this.world.cones.length + 1);
    else pct = this.P / this.world.track.length;
    this.hud.bar.style.width = Math.max(0, Math.min(100, pct * 100)).toFixed(1) + '%';
    const goal = this.goalHtml();
    if (goal !== this._goal) {
      this._goal = goal;
      this.hud.goal.innerHTML = goal;
    }
    // Parking lot: a big banner that says exactly what to do next
    const lot = this.world.type === 'lot';
    this.hud.goal.hidden = lot;
    let mission = '';
    if (lot && !this.done && !this.recover) {
      const W = this.world, c = this.car, target = W.cones[this.coneIdx] || W.finish;
      const ft = Math.max(0, Math.round((Math.hypot(target.x - c.x, target.y - c.y) - (this.coneIdx < W.cones.length ? TARGET_R : 0)) / 3 / 5) * 5);
      if (this.coneIdx < W.cones.length) {
        mission = '<div class="bullseye"></div><div><b>Drive into cone ' + (this.coneIdx + 1) + ' of ' + W.cones.length + '</b>' +
          '<span>Steer your car into the glowing yellow circle · ' + (ft ? 'about ' + ft + ' ft away' : 'almost there!') + '</span></div>';
      } else {
        mission = '<div class="bullseye">P</div><div><b>Now park in the green box</b>' +
          '<span>Drive into the PARK box, then brake to 0 mph · ' + (ft > 5 ? 'about ' + ft + ' ft away' : 'you\'re there, brake!') + '</span></div>';
      }
    }
    if (mission !== this._mission) {
      this._mission = mission;
      this.hud.mission.innerHTML = mission;
      this.hud.mission.hidden = !mission;
      this.hud.mission.classList.toggle('park', mission.includes('>P<'));
    }
    const rec = this.recover && !this.done ? this.recover.mode : null;
    if (rec !== this._rec) {
      this._rec = rec;
      const el = this.hud.recover;
      el.hidden = !rec;
      if (rec === 'back') {
        const where = this.world.type === 'lot' ? 'away from the curb' : 'toward the road';
        el.className = 'recover back';
        el.innerHTML = '<div class="arrow" aria-hidden="true">⬇</div><div><b>Back up</b><span>To reverse, ' + reverseHint() + '. Then steer ' + where + '.</span></div>';
      } else if (rec === 'forward') {
        el.className = 'recover forward';
        el.innerHTML = '<div class="arrow" aria-hidden="true">⬆</div><div><b>Road is ahead</b><span>Turn gently toward the yellow arrow and drive forward slowly.</span></div>';
      }
    }
  },

  // The "what do I do now?" panel in the top-right corner.
  goalHtml() {
    const W = this.world;
    if (this.done) return '<b>Drive complete!</b><span>Nice work.</span>';
    if (this.recover) {
      const back = this.recover.mode === 'back';
      return '<b>' + (W.type === 'lot' ? 'Against the curb' : 'Off the road') + '</b><span class="next">→ ' +
        (back ? 'Back up, then steer ' + (W.type === 'lot' ? 'away from the curb' : 'toward the road') : 'Drive forward toward the road') + '</span>';
    }
    if (W.type === 'lot') {
      const n = W.cones.length, left = n - this.coneIdx;
      if (left > 0) return '<b>Cones left: ' + left + ' of ' + n + '</b><span class="next">→ Steer into the glowing yellow circle</span>';
      return '<b>Last step: park</b><span class="next">→ Stop inside the green box (0 mph)</span>';
    }
    const pct = Math.max(0, Math.min(99, Math.floor(this.P / W.track.length * 100)));
    let html = '<b>Goal: one lap · ' + pct + '% done</b>';
    if (this.stops.length) html += '<span>Stop signs left: ' + this.stops.filter(s => !s.done).length + ' of ' + this.stops.length + '</span>';
    const cws = this.crosswalks.filter(c => !c.jaywalk), jays = this.crosswalks.filter(c => c.jaywalk);
    if (cws.length) html += '<span>Crosswalks left: ' + cws.filter(c => !c.resolved).length + ' of ' + cws.length + '</span>';
    if (this.lights && this.lights.length) html += '<span>Traffic lights left: ' + this.lights.filter(l => !l.done).length + ' of ' + this.lights.length + '</span>';
    if (jays.length) html += '<span>Jaywalkers left: ' + jays.filter(c => !c.resolved).length + ' of ' + jays.length + '</span>';
    let next = this.ai ? (W.city ? 'Stay well behind the yellow taxi' : 'Stay well behind the blue car') : 'Stay in the right lane to the checkered line';
    if (W.city) {
      const ta = W.truck ? W.truck.E - this.P : -1;
      if (ta > 0 && ta < 400) next = 'Truck in the bike lane ahead: watch for riders';
      for (const l of this.lights) {
        const a = l.E - STOP_BACK - this.P;
        if (a > -5 && a < 350) {
          next = l.state === 'red' ? 'Red light: stop at the white line and wait'
            : l.state === 'yellow' ? 'Yellow light: get ready to stop'
            : 'Green light: go, but look both ways';
        }
      }
      if (this.vehicles.some(vh => vh.dir > 0 && vh.stopTimer > 0 && this.wrapRel(vh.P - this.P) > 0 && this.wrapRel(vh.P - this.P) < 450)) next = 'Bus stopped ahead: wait, don\'t pass';
      if (this.riders.some(r => r.off < ROAD_HALF + 2 && this.wrapRel(r.P - this.P) > 0 && this.wrapRel(r.P - this.P) < 300)) next = 'Rider in your lane: slow down, give them room';
    }
    let best = 450;
    for (const s of this.stops) {
      const a = s.E - this.P;
      if (!s.done && a > -15 && a < best) { best = a; next = 'Stop sign ahead: stop at the white line'; }
    }
    for (const c of this.crosswalks) {
      const a = c.E - this.P;
      if (!c.resolved && a > -5 && a < best) { best = a; next = c.jaywalk ? 'Turn ahead: watch for people crossing' : 'Crosswalk ahead: let people cross first'; }
    }
    return html + '<span class="next">→ ' + next + '</span>';
  },

  // ---------- Drawing ----------
  render() {
    if (this.view === 'driver') { this.renderDriver(); return; }
    const ctx = this.ctx, c = this.car, W = this.world;
    const look = Math.max(-40, Math.min(120, c.v * 0.45));
    const tx = c.x + Math.cos(c.a) * look, ty = c.y + Math.sin(c.a) * look;
    this.cam.x += (tx - this.cam.x) * 0.1;
    this.cam.y += (ty - this.cam.y) * 0.1;
    const z = Math.max(0.8, Math.min(this.cw, this.ch) / 620);
    const k = this.dpr * z;
    const t = performance.now() / 1000;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = W.city ? '#BFC3C5' : '#93C47D';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, this.dpr * this.cw / 2 - this.cam.x * k, this.dpr * this.ch / 2 - this.cam.y * k);

    ctx.fillStyle = '#9CCB86';
    for (const p of W.patches) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, Math.PI * 2);
      ctx.fill();
    }

    if (W.type === 'lot') this.drawLot(t); else this.drawRoad();
    this.drawSkidMarks();
    if (W.city) { this.drawRiders(t); this.drawVehicles(); }
    if (this.ai) this.drawCar(this.ai.x, this.ai.y, this.ai.a, this.ai.color, this.ai.braking);
    if (W.city) this.drawBuildings();
    this.drawCar(c.x, c.y, c.a, PLAYER_COLOR, Input.brake > 0.1 && !this.done);
    if (W.type === 'lot') this.drawGuide();
    this.drawTrees();
    if (this.recover && !this.done) this.drawRecovery(t);
  },

  // Yellow arrow showing the way back: from the car to the road, or straight
  // backwards if you need to reverse away from a curb.
  drawRecovery(t) {
    const ctx = this.ctx, c = this.car, r = this.recover;
    let tx, ty;
    if (r.tx != null) { tx = r.tx; ty = r.ty; }
    else { tx = c.x - Math.cos(c.a) * 90; ty = c.y - Math.sin(c.a) * 90; }
    const a = Math.atan2(ty - c.y, tx - c.x);
    const len = Math.max(30, Math.hypot(tx - c.x, ty - c.y) - 6);
    const wob = 4 * Math.sin(t * 6);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(a);
    ctx.strokeStyle = '#F2C94C';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(len - 14 + wob, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#F2C94C';
    ctx.strokeStyle = '#1E2A2F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(len + 8 + wob, 0);
    ctx.lineTo(len - 14 + wob, -13);
    ctx.lineTo(len - 14 + wob, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'butt';
  },

  drawRoad() {
    const ctx = this.ctx, W = this.world, P = W.paths, T = W.track;

    for (const h of W.houses) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.a);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(-30, -24, 64, 52);
      ctx.fillStyle = h.wall;
      ctx.fillRect(-32, -28, 64, 52);
      ctx.fillStyle = h.roof;
      ctx.fillRect(-32, -28, 64, 22);
      ctx.fillStyle = '#C9C3B4';
      ctx.fillRect(-8, 24, 16, 34);    // path to the road
      ctx.restore();
    }

    ctx.lineJoin = 'round';
    if (W.city) {
      // Cross streets at the traffic lights
      for (const l of this.lights) {
        const p = T.pointAt(l.s, 0);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillStyle = '#8E9396';
        ctx.fillRect(-CROSS_HALF - 3, -320, CROSS_HALF * 2 + 6, 640);
        ctx.fillStyle = '#59616B';
        ctx.fillRect(-CROSS_HALF, -320, CROSS_HALF * 2, 640);
        ctx.restore();
      }
      ctx.strokeStyle = '#8E9396';                  // curbs
      ctx.lineWidth = ROAD_HALF * 2 + 6;
      ctx.stroke(P.center);
      ctx.strokeStyle = '#3F9D63';                  // green bike lane
      ctx.lineWidth = BIKE_LANE + 2;
      ctx.stroke(P.bikeMid);
      ctx.strokeStyle = '#8E9396';
      ctx.lineWidth = 3;
      ctx.stroke(P.bikeEdge);
    } else {
      ctx.strokeStyle = '#D8D2C4';
      ctx.lineWidth = ROAD_HALF * 2 + 22;
      ctx.stroke(P.center);
    }
    ctx.strokeStyle = '#59616B';
    ctx.lineWidth = ROAD_HALF * 2;
    ctx.stroke(P.center);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke(P.edgeL);
    ctx.stroke(P.edgeR);
    ctx.setLineDash([26, 22]);
    ctx.strokeStyle = '#F2C94C';
    ctx.stroke(P.center);
    ctx.setLineDash([]);

    // Finish line across your lane
    const fs = W.s0 - 30;
    const fp = T.pointAt(fs, 0);
    ctx.save();
    ctx.translate(fp.x, fp.y);
    ctx.rotate(fp.angle);
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#222' : '#fff';
        ctx.fillRect(-6 + j * 6, 2 + i * 7.5, 6, 7.5);
      }
    }
    ctx.restore();

    if (W.city) {
      // Bike symbols painted in the bike lane
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      for (let s = 40; s < T.length; s += 260) {
        const p = T.pointAt(s, BIKE_OFF);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.beginPath(); ctx.arc(-5, 0, 3.2, 0, Math.PI * 2); ctx.arc(5, 0, 3.2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, -3); ctx.lineTo(5, 0); ctx.stroke();
        ctx.restore();
      }
      if (W.truck) this.drawTruck(T.pointAt(W.truck.s, BIKE_OFF));
      for (const l of this.lights) {
        // Stop lines for both directions, and the signals on the corners
        const a = T.pointAt(l.s - STOP_BACK, 3), b2 = T.pointAt(l.s - STOP_BACK, ROAD_HALF - 4);
        const c1 = T.pointAt(l.s + STOP_BACK, -3), c2 = T.pointAt(l.s + STOP_BACK, -(ROAD_HALF - 4));
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
        this.drawSignal(T.pointAt(l.s + CROSS_HALF + 8, ROAD_HALF + BIKE_LANE + 10), l.state);
        this.drawSignal(T.pointAt(l.s - CROSS_HALF - 8, -(ROAD_HALF + 10)), l.state);
      }
      for (const bs of W.busStops) {
        const p = T.pointAt(bs.s, ROAD_HALF + BIKE_LANE + 14);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillStyle = 'rgba(120,170,210,0.55)';         // glass shelter
        ctx.fillRect(-22, 2, 44, 10);
        ctx.fillStyle = '#2F6FB0';
        ctx.beginPath(); ctx.arc(28, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('BUS', 28, 0.5);
        ctx.restore();
      }
    }

    for (const cw of this.crosswalks) {
      if (cw.jaywalk) continue;
      const p = T.pointAt(cw.s, 0);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      for (let y = -ROAD_HALF + 5; y < ROAD_HALF - 5; y += 13) ctx.fillRect(-13, y, 26, 7);
      ctx.restore();
    }

    for (const sp of this.stops) {
      const a = T.pointAt(sp.s, 3), b = T.pointAt(sp.s, ROAD_HALF - 4);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const s = T.pointAt(sp.s - 8, ROAD_HALF + 20);
      this.drawStopSign(s.x, s.y);
    }

    for (const cw of this.crosswalks) {
      if (cw.state === 'crossing') this.drawPerson(cw.x, cw.y);
      else if (cw.state === 'idle') {
        const p = T.pointAt(cw.s, this.pedStart());
        this.drawPerson(p.x, p.y);
      }
    }
  },

  drawSignal(p, state) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.fillStyle = '#1E2326';
    this.roundRect(-13, -5, 26, 10, 3); ctx.fill();
    const lamps = [['red', '#FF3B30', -8], ['yellow', '#FFC93C', 0], ['green', '#34D399', 8]];
    for (const [name, col, x] of lamps) {
      ctx.fillStyle = state === name ? col : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(x, 0, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  drawVehicles() {
    for (const l of this.lights) if (l.cross) this.drawCar(l.cross.x, l.cross.y, l.cross.a, l.cross.color, false);
    for (const vh of this.vehicles) {
      if (vh.kind === 'bus') this.drawBus(vh);
      else this.drawCar(vh.x, vh.y, vh.a, vh.color, vh.braking);
    }
  },

  drawBus(vh) {
    const ctx = this.ctx, l = vh.len, w = 28;
    ctx.save();
    ctx.translate(vh.x, vh.y);
    ctx.rotate(vh.a);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-l / 2 + 3, -w / 2 + 4, l, w);
    ctx.fillStyle = '#EEF1F3';
    this.roundRect(-l / 2, -w / 2, l, w, 5);
    ctx.fill();
    ctx.fillStyle = vh.color;
    ctx.fillRect(-l / 2 + 4, -w / 2, l - 8, 5);
    ctx.fillRect(-l / 2 + 4, w / 2 - 5, l - 8, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';                 // roof vents
    ctx.fillRect(-20, -6, 14, 12); ctx.fillRect(12, -6, 14, 12);
    ctx.fillStyle = '#CFE3F0';
    ctx.fillRect(l / 2 - 6, -w / 2 + 3, 4, w - 6);
    ctx.fillStyle = vh.braking || vh.stopTimer > 0 ? '#FF3B30' : '#8E1E14';
    ctx.fillRect(-l / 2, -w / 2 + 3, 3, 5); ctx.fillRect(-l / 2, w / 2 - 8, 3, 5);
    ctx.restore();
  },

  drawBuildings() {
    const ctx = this.ctx;
    for (const b of this.world.buildings) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-b.w / 2 + 5, -b.d / 2 + 6, b.w, b.d);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.d / 2, b.w, b.d);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-b.w / 2 + 5, -b.d / 2 + 5, b.w - 10, b.d - 10);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';             // rooftop AC units and water tanks
      ctx.fillRect(-12 + b.seed * 10, -10, 10, 8);
      ctx.beginPath(); ctx.arc(10 - b.seed * 8, 10, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },

  drawTruck(p) {
    const ctx = this.ctx, blink = Math.floor(performance.now() / 450) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-29, -10, 64, 24);
    ctx.fillStyle = '#ECEDEE';
    ctx.fillRect(-32, -12, 48, 24);
    ctx.fillStyle = '#3D5A80';
    ctx.fillRect(16, -11, 16, 22);
    ctx.fillStyle = '#CFE3F0';
    ctx.fillRect(25, -9, 5, 18);
    ctx.fillStyle = blink ? '#FFB020' : '#8A5A10';  // hazard lights
    ctx.fillRect(-32, -12, 3, 4); ctx.fillRect(-32, 8, 3, 4);
    ctx.fillRect(30, -12, 3, 4); ctx.fillRect(30, 8, 3, 4);
    ctx.restore();
  },

  drawRiders() {
    const ctx = this.ctx;
    for (const r of this.riders) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.a);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(-8, -1, 18, 5);
      if (r.kind === 'bike') {
        ctx.fillStyle = '#2E6DB4';                    // blue bike-share bike
        ctx.fillRect(-10, -2, 20, 4);
        ctx.fillStyle = '#222';
        ctx.fillRect(-11, -1, 4, 2); ctx.fillRect(8, -1, 4, 2);
      } else {
        ctx.fillStyle = '#4A5258';                    // e-scooter deck
        ctx.fillRect(-7, -2, 14, 4);
        ctx.fillRect(6, -4, 2, 8);
      }
      ctx.fillStyle = r.shirt;
      ctx.beginPath(); ctx.ellipse(-1, 0, 5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5B4232';
      ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },

  drawLot(t) {
    const ctx = this.ctx, W = this.world, L = W.lot;
    ctx.fillStyle = '#D8D2C4';
    ctx.fillRect(L.x - 12, L.y - 12, L.w + 24, L.h + 24);
    ctx.fillStyle = '#646C76';
    ctx.fillRect(L.x, L.y, L.w, L.h);

    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = L.x + 60; x < L.x + L.w - 40; x += 70) {
      ctx.moveTo(x, L.y); ctx.lineTo(x, L.y + 100);
    }
    for (let x = L.x + 200; x < L.x + L.w - 40; x += 70) {
      ctx.moveTo(x, L.y + L.h); ctx.lineTo(x, L.y + L.h - 100);
    }
    ctx.stroke();

    // Finish parking box
    const f = W.finish, active = this.coneIdx >= W.cones.length;
    ctx.fillStyle = active ? 'rgba(63,162,107,' + (0.3 + 0.15 * Math.sin(t * 4)) + ')' : 'rgba(63,162,107,0.12)';
    ctx.fillRect(f.x - 48, f.y - 34, 96, 68);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#3FA26B';
    ctx.lineWidth = 3;
    ctx.strokeRect(f.x - 48, f.y - 34, 96, 68);
    ctx.setLineDash([]);
    ctx.fillStyle = active ? '#1F6B43' : 'rgba(31,107,67,0.5)';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PARK', f.x, f.y + 1);
    if (active && !this.done) this.tag(f.x, f.y - 56, 'PARK HERE');

    W.cones.forEach((cn, i) => {
      const done = i < this.coneIdx, next = i === this.coneIdx;
      if (next) {
        // The whole circle you need to drive into
        ctx.fillStyle = 'rgba(242,201,76,' + (0.28 + 0.12 * Math.sin(t * 4)) + ')';
        ctx.beginPath();
        ctx.arc(cn.x, cn.y, TARGET_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(242,201,76,' + (0.75 + 0.25 * Math.sin(t * 4)) + ')';
        ctx.lineWidth = 5;
        ctx.stroke();
        this.tag(cn.x, cn.y - TARGET_R - 20, 'DRIVE HERE');
      }
      ctx.globalAlpha = done ? 0.35 : 1;
      if (!done) {
        // Number label so the order is clear
        ctx.fillStyle = next ? '#1E2A2F' : 'rgba(30,42,47,0.55)';
        ctx.beginPath(); ctx.arc(cn.x + 16, cn.y - 16, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, cn.x + 16, cn.y - 15.5);
      }
      ctx.fillStyle = '#F07F2E';
      ctx.beginPath(); ctx.arc(cn.x, cn.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cn.x, cn.y, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F07F2E';
      ctx.beginPath(); ctx.arc(cn.x, cn.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  },

  // A dark pill with white text, used to label targets on the map.
  tag(x, y, text) {
    const ctx = this.ctx;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 16, h = 22;
    ctx.fillStyle = 'rgba(30,42,47,0.9)';
    this.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, y + h / 2 - 1); ctx.lineTo(x + 6, y + h / 2 - 1); ctx.lineTo(x, y + h / 2 + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  },

  drawGuide() {
    const ctx = this.ctx, c = this.car, W = this.world;
    const target = W.cones[this.coneIdx] || (this.done ? null : W.finish);
    if (!target) return;
    const dx = target.x - c.x, dy = target.y - c.y, d = Math.hypot(dx, dy);
    if (d < 110) return;
    const a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(c.x + Math.cos(a) * 52, c.y + Math.sin(a) * 52);
    ctx.rotate(a);
    ctx.fillStyle = '#F2C94C';
    ctx.strokeStyle = '#1E2A2F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  drawStopSign(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#8A8F94';
    ctx.fillRect(x - 1.5, y, 3, 14);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#fff';
    this.octagon(15);
    ctx.fill();
    ctx.fillStyle = '#C0392B';
    this.octagon(13);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOP', 0, 0.5);
    ctx.restore();
  },

  octagon(r) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  },

  drawPerson(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.arc(x + 2, y + 3, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4361A8';
    ctx.beginPath(); ctx.ellipse(x, y, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6B4B3A';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  },

  drawCar(x, y, a, color, braking) {
    const ctx = this.ctx, l = CAR_LEN, w = CAR_W;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    this.roundRect(-l / 2 + 2, -w / 2 + 3, l, w, 7);
    ctx.fill();
    ctx.fillStyle = color;
    this.roundRect(-l / 2, -w / 2, l, w, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    this.roundRect(-9, -w / 2 + 4, 16, w - 8, 3);
    ctx.fill();
    ctx.fillStyle = '#CFE3F0';
    this.roundRect(7, -w / 2 + 3, 8, w - 6, 2);     // windshield
    ctx.fill();
    this.roundRect(-17, -w / 2 + 4, 6, w - 8, 2);   // rear window
    ctx.fill();
    ctx.fillStyle = '#FFF4C2';
    ctx.fillRect(l / 2 - 3, -w / 2 + 3, 3, 5);
    ctx.fillRect(l / 2 - 3, w / 2 - 8, 3, 5);
    ctx.fillStyle = braking ? '#FF3B30' : '#8E1E14';
    ctx.fillRect(-l / 2, -w / 2 + 3, 3, 5);
    ctx.fillRect(-l / 2, w / 2 - 8, 3, 5);
    ctx.restore();
  },

  drawTrees() {
    const ctx = this.ctx;
    for (const tr of this.world.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.beginPath(); ctx.arc(tr.x + 5, tr.y + 6, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tr.shade > 0.5 ? '#4E8F4A' : '#5C9E52';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  },

  // ---------- Driver's-eye view (simple 3D) ----------
  // Every point on the ground is converted to "camera space":
  //   f = how far in front of the driver it is, r = how far to the right.
  // Then perspective: screen x = center + r / f * focal, screen y = horizon + eyeHeight / f * focal.
  // Flat things (road, lines) are drawn as polygons; upright things (trees, signs,
  // people, cars) are drawn as flat pictures that face the driver, farthest first.

  setupDriverView() {
    const W = this.world;
    if (W.d3) return W.d3;
    const d3 = {};
    const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    if (W.track) {
      const T = W.track, n = T.n;
      const normals = T.pts.map((_, i) => {
        const a = T.dirs[(i - 1 + n) % n], b = T.dirs[i];
        const nx = -(a.y + b.y), ny = a.x + b.x, l = Math.hypot(nx, ny) || 1;
        return { x: nx / l, y: ny / l };
      });
      const off = o => T.pts.map((p, i) => ({ x: p.x + normals[i].x * o, y: p.y + normals[i].y * o }));
      const strip = (o1, o2) => {
        const A = off(o1), B = off(o2), quads = [];
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; quads.push([A[i], A[j], B[j], B[i]]); }
        return quads;
      };
      const q = (s1, s2, o1, o2) => [T.pointAt(s1, o1), T.pointAt(s2, o1), T.pointAt(s2, o2), T.pointAt(s1, o2)];
      d3.shoulder = W.city ? strip(-(ROAD_HALF + 3), ROAD_HALF + 3) : strip(-(ROAD_HALF + 11), ROAD_HALF + 11);
      if (W.city) {
        d3.walk = strip(-(ROAD_HALF + 40), ROAD_HALF + BIKE_LANE + 40);
        d3.bike = strip(ROAD_HALF, ROAD_HALF + BIKE_LANE);
        d3.bikeCurb = strip(ROAD_HALF + BIKE_LANE, ROAD_HALF + BIKE_LANE + 3);
        d3.cross = (W.lights || []).map(l => q(l.s - CROSS_HALF, l.s + CROSS_HALF, -320, 320));
        d3.stopLines = [];
        for (const l of W.lights || []) {
          d3.stopLines.push(q(l.s - STOP_BACK - 3, l.s - STOP_BACK + 3, 3, ROAD_HALF - 4));
          d3.stopLines.push(q(l.s + STOP_BACK - 3, l.s + STOP_BACK + 3, -(ROAD_HALF - 4), -3));
        }
      }
      d3.road = strip(-ROAD_HALF, ROAD_HALF);
      d3.lines = strip(-(ROAD_HALF - 6.5), -(ROAD_HALF - 3.5)).concat(strip(ROAD_HALF - 6.5, ROAD_HALF - 3.5));
      d3.dashes = [];
      for (let s = 0; s < T.length; s += 48) d3.dashes.push(q(s, s + 26, -1.5, 1.5));
      d3.white = [];
      d3.black = [];
      for (const sp of W.stops) d3.white.push(q(sp.s - 3, sp.s + 3, 3, ROAD_HALF - 4));
      for (const cw of W.crosswalks) {
        if (cw.jaywalk) continue;
        for (let y = -ROAD_HALF + 5; y < ROAD_HALF - 5; y += 13) d3.white.push(q(cw.s - 13, cw.s + 13, y, y + 7));
      }
      const fs = W.s0 - 30;
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 2; j++) {
          ((i + j) % 2 ? d3.black : d3.white).push(q(fs - 6 + j * 6, fs + j * 6, 2 + i * 7.5, 9.5 + i * 7.5));
        }
      }
    } else {
      const L = W.lot, f = W.finish;
      d3.curb = [rect(L.x - 12, L.y - 12, L.w + 24, L.h + 24)];
      d3.lot = [rect(L.x, L.y, L.w, L.h)];
      d3.white = [];
      for (let x = L.x + 60; x < L.x + L.w - 40; x += 70) d3.white.push(rect(x - 1.5, L.y, 3, 100));
      for (let x = L.x + 200; x < L.x + L.w - 40; x += 70) d3.white.push(rect(x - 1.5, L.y + L.h - 100, 3, 100));
      d3.finish = [rect(f.x - 48, f.y - 34, 96, 68)];
    }
    W.d3 = d3;
    return d3;
  },

  renderDriver() {
    const ctx = this.ctx, c = this.car, W = this.world, cw = this.cw, ch = this.ch;
    const d3 = this.setupDriverView();
    const t = performance.now() / 1000;
    const ck = this.cockpit();
    const hy = ck.hy;
    const focal = Math.min(cw * 0.75, ch * 1.15);
    const eye = 15, NEAR = 4, FAR = 1100;
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    const ex = c.x - ca * 3, ey = c.y - sa * 3;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    let g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, '#8EC5E8');
    g.addColorStop(1, '#DCEFF7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, hy + 1);
    g = ctx.createLinearGradient(0, hy, 0, ch);
    if (W.city) {
      g.addColorStop(0, '#C9CDCF');
      g.addColorStop(1, '#AEB3B6');
    } else {
      g.addColorStop(0, '#B4D6A2');
      g.addColorStop(0.2, '#93C47D');
      g.addColorStop(1, '#86B970');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, cw, ch - hy);

    const cam = (x, y) => {
      const dx = x - ex, dy = y - ey;
      return { f: dx * ca + dy * sa, r: -dx * sa + dy * ca };
    };
    const addPoly = pts => {
      const cp = pts.map(p => cam(p.x, p.y));
      if (cp.every(p => p.f < NEAR) || cp.every(p => p.f > FAR)) return;
      const out = [];
      for (let i = 0; i < cp.length; i++) {
        const a = cp[i], b = cp[(i + 1) % cp.length];
        const ain = a.f >= NEAR, bin = b.f >= NEAR;
        if (ain) out.push(a);
        if (ain !== bin) {
          const k = (NEAR - a.f) / (b.f - a.f);
          out.push({ f: NEAR, r: a.r + (b.r - a.r) * k });
        }
      }
      if (out.length < 3) return;
      out.forEach((p, i) => {
        const sx = cw / 2 + p.r / p.f * focal, sy = hy + eye / p.f * focal;
        if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
      });
      ctx.closePath();
    };
    const layer = (polys, color) => {
      if (!polys || !polys.length) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const p of polys) addPoly(p);
      ctx.fill();
    };

    if (W.track) {
      if (W.city) { layer(d3.walk, '#D0D3D5'); layer(d3.cross, '#59616B'); }
      layer(d3.shoulder, W.city ? '#8E9396' : '#D8D2C4');
      layer(d3.road, '#59616B');
      if (W.city) { layer(d3.bike, '#3F9D63'); layer(d3.bikeCurb, '#8E9396'); layer(d3.stopLines, '#FFFFFF'); }
      layer(d3.lines, 'rgba(255,255,255,0.9)');
      layer(d3.dashes, '#F2C94C');
      layer(d3.white, '#FFFFFF');
      layer(d3.black, '#222222');
    } else {
      layer(d3.curb, '#D8D2C4');
      layer(d3.lot, '#646C76');
      layer(d3.white, 'rgba(255,255,255,0.8)');
      const pulse = Math.sin(t * 4);
      const active = this.coneIdx >= W.cones.length;
      const f = W.finish;
      const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      const box = [rect(f.x - 48, f.y - 34, 96, 4), rect(f.x - 48, f.y + 30, 96, 4), rect(f.x - 48, f.y - 34, 4, 68), rect(f.x + 44, f.y - 34, 4, 68)];
      layer(d3.finish, active ? 'rgba(63,162,107,' + (0.5 + 0.2 * pulse) + ')' : 'rgba(63,162,107,0.2)');
      layer(box, active ? '#7CE0A3' : 'rgba(63,162,107,0.5)');

      // Highlight the whole target zone around the next cone on the ground
      const cn = W.cones[this.coneIdx];
      if (cn) {
        const N = 36, disc = [], ring = [];
        for (let i = 0; i < N; i++) {
          const a1 = i / N * Math.PI * 2, a2 = (i + 1) / N * Math.PI * 2;
          disc.push({ x: cn.x + Math.cos(a1) * TARGET_R, y: cn.y + Math.sin(a1) * TARGET_R });
          const ro = TARGET_R + 2, ri = TARGET_R - 4;
          ring.push([
            { x: cn.x + Math.cos(a1) * ri, y: cn.y + Math.sin(a1) * ri }, { x: cn.x + Math.cos(a1) * ro, y: cn.y + Math.sin(a1) * ro },
            { x: cn.x + Math.cos(a2) * ro, y: cn.y + Math.sin(a2) * ro }, { x: cn.x + Math.cos(a2) * ri, y: cn.y + Math.sin(a2) * ri },
          ]);
        }
        layer([disc], 'rgba(242,201,76,' + (0.32 + 0.12 * pulse) + ')');
        layer(ring, 'rgba(255,214,90,' + (0.85 + 0.15 * pulse) + ')');
      }
    }

    // Distance haze near the horizon
    g = ctx.createLinearGradient(0, hy, 0, hy + eye / 450 * focal);
    g.addColorStop(0, 'rgba(220,239,247,0.75)');
    g.addColorStop(1, 'rgba(220,239,247,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, cw, eye / 450 * focal + 1);

    // Upright objects
    const bb = [];
    const add = (x, y, size, draw) => {
      const p = cam(x, y);
      if (p.f < NEAR + 6 || p.f > FAR) return;
      const s = focal / p.f, sx = cw / 2 + p.r * s;
      if (sx < -size * s || sx > cw + size * s) return;
      bb.push({ d: p.f, sx, gy: hy + eye * s, s, draw });
    };
    for (const tr of W.trees) add(tr.x, tr.y, tr.r + 4, b => this.tree3(b, tr));
    for (const h of W.houses) add(h.x, h.y, 40, b => this.house3(b, h));
    if (W.track) {
      for (const sp of this.stops) {
        const p = W.track.pointAt(sp.s - 8, ROAD_HALF + 20);
        add(p.x, p.y, 12, b => this.sign3(b));
      }
      for (const cw2 of this.crosswalks) {
        if (cw2.state === 'crossing') add(cw2.x, cw2.y, 8, b => this.person3(b));
        else if (cw2.state === 'idle') {
          const p = W.track.pointAt(cw2.s, this.pedStart());
          add(p.x, p.y, 8, b => this.person3(b));
        }
      }
      if (W.city) {
        for (const bd of W.buildings) add(bd.x, bd.y, bd.w / 2, b => this.building3(b, bd));
        for (const r of this.riders) add(r.x, r.y, 8, b => this.rider3(b, r));
        for (const vh of this.vehicles) {
          const front = vh.dir < 0;
          // Draw at the end of the vehicle that faces you
          const p = W.track.pointAt(W.s0 + vh.P - vh.dir * (vh.len / 2 - 4), vh.off);
          if (vh.kind === 'bus') add(p.x, p.y, 16, b => this.bus3(b, vh, front));
          else add(p.x, p.y, 14, b => front ? this.carFront3(b, vh.color) : this.car3(b, vh.braking, vh.color));
        }
        for (const l of this.lights) {
          // Signals stand on the far side of the intersection, so you can see them while stopped
          const p1 = W.track.pointAt(l.s + CROSS_HALF + 8, ROAD_HALF + BIKE_LANE + 10);
          add(p1.x, p1.y, 10, b => this.signal3(b, l.state, 40));
          const p2 = W.track.pointAt(l.s + CROSS_HALF + 4, LANE_CENTER);     // hanging over your lane
          add(p2.x, p2.y, 10, b => this.signal3(b, l.state, 42, true));
          if (l.cross) add(l.cross.x, l.cross.y, 24, b => this.carSide3(b, l.cross.color));
        }
        for (const bs of W.busStops) {
          const p = W.track.pointAt(bs.s + 26, ROAD_HALF + BIKE_LANE + 10);
          add(p.x, p.y, 8, b => this.busSign3(b));
        }
        if (W.truck) {
          const tp = W.track.pointAt(W.truck.s - 20, BIKE_OFF);
          add(tp.x, tp.y, 16, b => this.truck3(b));
        }
      }
    } else {
      W.cones.forEach((cn, i) => {
        if (i >= this.coneIdx) add(cn.x, cn.y, 30, b => this.cone3(b, i === this.coneIdx, t));
      });
      const target = W.cones[this.coneIdx] || (this.done ? null : W.finish);
      const label = this.coneIdx < W.cones.length ? 'Drive into cone ' + (this.coneIdx + 1) : 'Park here';
      if (target) add(target.x, target.y, 10, b => this.marker3(b, t, label));
    }
    if (this.ai) add(this.ai.x, this.ai.y, 16, b => this.car3(b, this.ai.braking, this.ai.color));
    if (this.recover && this.recover.tx != null && !this.done) {
      add(this.recover.tx, this.recover.ty, 10, b => this.marker3(b, t));
    }

    bb.sort((a, b) => b.d - a.d);
    for (const b of bb) {
      ctx.globalAlpha = Math.max(0, Math.min(1, (FAR - b.d) / 220));
      b.draw(b);
    }
    ctx.globalAlpha = 1;

    this.drawDashboard(ck);
  },

  tree3(b, tr) {
    const ctx = this.ctx, s = b.s, r = tr.r * s, trunk = 16 * s;
    ctx.fillStyle = '#7A5A3C';
    ctx.fillRect(b.sx - 2 * s, b.gy - trunk, 4 * s, trunk);
    ctx.fillStyle = tr.shade > 0.5 ? '#4E8F4A' : '#5C9E52';
    ctx.beginPath(); ctx.arc(b.sx, b.gy - trunk - r * 0.7, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(b.sx - r * 0.3, b.gy - trunk - r, r * 0.45, 0, Math.PI * 2); ctx.fill();
  },

  house3(b, h) {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy;
    ctx.fillStyle = h.wall;
    ctx.fillRect(x - 32 * s, y - 34 * s, 64 * s, 34 * s);
    ctx.fillStyle = h.roof;
    ctx.beginPath();
    ctx.moveTo(x - 37 * s, y - 34 * s); ctx.lineTo(x + 37 * s, y - 34 * s); ctx.lineTo(x, y - 56 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(30,42,47,0.55)';
    ctx.fillRect(x - 5 * s, y - 18 * s, 10 * s, 18 * s);
    ctx.fillStyle = '#CFE3F0';
    ctx.fillRect(x - 24 * s, y - 26 * s, 11 * s, 9 * s);
    ctx.fillRect(x + 13 * s, y - 26 * s, 11 * s, 9 * s);
  },

  sign3(b) {
    const ctx = this.ctx, s = b.s;
    ctx.fillStyle = '#8A8F94';
    ctx.fillRect(b.sx - 1 * s, b.gy - 26 * s, 2 * s, 26 * s);
    ctx.save();
    ctx.translate(b.sx, b.gy - 32 * s);
    ctx.fillStyle = '#fff';
    this.octagon(10 * s); ctx.fill();
    ctx.fillStyle = '#C0392B';
    this.octagon(8.8 * s); ctx.fill();
    if (s > 0.6) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + (5 * s).toFixed(1) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STOP', 0, 0.4 * s);
    }
    ctx.restore();
  },

  person3(b) {
    const ctx = this.ctx, s = b.s;
    ctx.fillStyle = '#2E3A59';
    ctx.fillRect(b.sx - 3 * s, b.gy - 8 * s, 2.4 * s, 8 * s);
    ctx.fillRect(b.sx + 0.6 * s, b.gy - 8 * s, 2.4 * s, 8 * s);
    ctx.fillStyle = '#4361A8';
    ctx.beginPath(); ctx.ellipse(b.sx, b.gy - 13 * s, 4.5 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6B4B3A';
    ctx.beginPath(); ctx.arc(b.sx, b.gy - 21.5 * s, 3.2 * s, 0, Math.PI * 2); ctx.fill();
  },

  cone3(b, isTarget, t) {
    const ctx = this.ctx, s = b.s;
    if (isTarget) {
      // Glow behind the target cone so it stands out from far away
      const glow = ctx.createRadialGradient(b.sx, b.gy - 8 * s, 0, b.sx, b.gy - 8 * s, 26 * s);
      glow.addColorStop(0, 'rgba(255,224,110,' + (0.75 + 0.2 * Math.sin(t * 4)) + ')');
      glow.addColorStop(1, 'rgba(255,224,110,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(b.sx, b.gy - 8 * s, 26 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#F07F2E';
    ctx.beginPath();
    ctx.moveTo(b.sx - 6 * s, b.gy); ctx.lineTo(b.sx + 6 * s, b.gy); ctx.lineTo(b.sx, b.gy - 15 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.sx - 3.4 * s, b.gy - 8 * s, 6.8 * s, 2.4 * s);
  },

  marker3(b, t, label) {
    const ctx = this.ctx, s = b.s, y = b.gy - (36 + 4 * Math.sin(t * 3)) * s;
    ctx.fillStyle = '#F2C94C';
    ctx.strokeStyle = '#1E2A2F';
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.beginPath();
    ctx.moveTo(b.sx - 7 * s, y - 8 * s); ctx.lineTo(b.sx + 7 * s, y - 8 * s); ctx.lineTo(b.sx, y + 3 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (label) {
      // A readable tag above the arrow ("Cone 2 of 5", "PARK here")
      const fs = Math.max(13, Math.min(18, 6 * s));
      ctx.font = 'bold ' + fs + 'px system-ui, sans-serif';
      const w = ctx.measureText(label).width + fs * 1.2, h = fs * 1.7, ty = y - 8 * s - h - 6;
      ctx.fillStyle = 'rgba(30,42,47,0.88)';
      this.roundRect(b.sx - w / 2, ty, w, h, h / 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, b.sx, ty + h / 2 + 0.5);
    }
  },

  building3(b, bd) {
    const ctx = this.ctx, s = b.s, w = bd.w * s, h = bd.h * s, x = b.sx - w / 2, y = b.gy - h;
    ctx.fillStyle = bd.color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, w, Math.max(1, 4 * s));          // roof edge
    ctx.fillRect(x, b.gy - 14 * s, w, 14 * s);           // ground-floor storefront
    if (s > 0.3) {
      ctx.fillStyle = 'rgba(214,230,240,0.75)';
      const cols = 4, ww = 7 * s, wh = 8 * s, gapX = (w - cols * ww) / (cols + 1);
      for (let fy = b.gy - 30 * s; fy > y + 8 * s; fy -= 15 * s) {
        for (let i = 0; i < cols; i++) ctx.fillRect(x + gapX + i * (ww + gapX), fy, ww, wh);
      }
      ctx.fillStyle = 'rgba(255,224,150,0.7)';
      ctx.fillRect(x + w * 0.15, b.gy - 11 * s, w * 0.7, 7 * s);
    }
  },

  rider3(b, r) {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy;
    if (r.kind === 'bike') {
      ctx.fillStyle = '#1E2326';
      ctx.beginPath(); ctx.ellipse(x, y - 4.5 * s, 1.3 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2E6DB4';
      ctx.fillRect(x - 1.5 * s, y - 10 * s, 3 * s, 5 * s);       // blue bike frame
      ctx.fillStyle = '#2E3A59';
      ctx.fillRect(x - 2.8 * s, y - 14 * s, 2.2 * s, 6 * s);
      ctx.fillRect(x + 0.6 * s, y - 14 * s, 2.2 * s, 6 * s);
      ctx.fillStyle = r.shirt;
      ctx.beginPath(); ctx.ellipse(x, y - 18 * s, 4 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5B4232';
      ctx.beginPath(); ctx.arc(x, y - 25 * s, 2.8 * s, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#4A5258';
      ctx.fillRect(x - 3 * s, y - 2 * s, 6 * s, 2 * s);         // scooter deck
      ctx.fillRect(x - 0.6 * s, y - 20 * s, 1.2 * s, 18 * s);   // stem
      ctx.fillStyle = '#2E3A59';
      ctx.fillRect(x - 2.6 * s, y - 13 * s, 2.2 * s, 11 * s);
      ctx.fillRect(x + 0.4 * s, y - 13 * s, 2.2 * s, 11 * s);
      ctx.fillStyle = r.shirt;
      ctx.beginPath(); ctx.ellipse(x, y - 18 * s, 4 * s, 5.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5B4232';
      ctx.beginPath(); ctx.arc(x, y - 26 * s, 2.8 * s, 0, Math.PI * 2); ctx.fill();
    }
  },

  bus3(b, vh, front) {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy, w = 28 * s, h = 34 * s;
    ctx.fillStyle = '#1E2326';
    ctx.fillRect(x - 12 * s, y - 4 * s, 6 * s, 4 * s);
    ctx.fillRect(x + 6 * s, y - 4 * s, 6 * s, 4 * s);
    ctx.fillStyle = '#EEF1F3';
    this.roundRect(x - w / 2, y - h - 2 * s, w, h, 3 * s); ctx.fill();
    ctx.fillStyle = vh.color;
    ctx.fillRect(x - w / 2, y - 13 * s, w, 5 * s);
    if (front) {
      ctx.fillStyle = '#2B3A44';
      ctx.fillRect(x - 12 * s, y - 32 * s, 24 * s, 15 * s);       // big windshield
      ctx.fillStyle = '#FFF4C2';
      ctx.fillRect(x - 12 * s, y - 7 * s, 4 * s, 2.5 * s);
      ctx.fillRect(x + 8 * s, y - 7 * s, 4 * s, 2.5 * s);
      ctx.fillStyle = '#F2994A';
      ctx.fillRect(x - 8 * s, y - 35 * s, 16 * s, 2.5 * s);       // route sign
    } else {
      ctx.fillStyle = '#CFE3F0';
      ctx.fillRect(x - 9 * s, y - 31 * s, 18 * s, 8 * s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - 8 * s, y - 20 * s, 16 * s, 5 * s);         // engine grille
      ctx.fillStyle = vh.braking || vh.stopTimer > 0 ? '#FF3B30' : '#8E1E14';
      ctx.fillRect(x - 13 * s, y - 12 * s, 3.5 * s, 5 * s);
      ctx.fillRect(x + 9.5 * s, y - 12 * s, 3.5 * s, 5 * s);
    }
  },

  carFront3(b, color) {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - 13 * s, y - 1.5 * s, 26 * s, 3 * s);
    ctx.fillStyle = '#1E2326';
    ctx.fillRect(x - 11 * s, y - 4 * s, 5 * s, 4 * s);
    ctx.fillRect(x + 6 * s, y - 4 * s, 5 * s, 4 * s);
    ctx.fillStyle = color;
    this.roundRect(x - 12 * s, y - 13 * s, 24 * s, 10 * s, 2.5 * s); ctx.fill();
    this.roundRect(x - 9 * s, y - 20 * s, 18 * s, 8 * s, 2.5 * s); ctx.fill();
    ctx.fillStyle = '#2B3A44';
    ctx.fillRect(x - 7.5 * s, y - 18.5 * s, 15 * s, 5.5 * s);
    ctx.fillStyle = '#FFF4C2';                                   // headlights
    ctx.fillRect(x - 11 * s, y - 10.5 * s, 4 * s, 2.6 * s);
    ctx.fillRect(x + 7 * s, y - 10.5 * s, 4 * s, 2.6 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - 5 * s, y - 9 * s, 10 * s, 2.5 * s);           // grille
  },

  signal3(b, state, height, hanging) {
    const ctx = this.ctx, s = b.s, x = b.sx, top = b.gy - height * s;
    ctx.strokeStyle = '#4A5258';
    ctx.lineWidth = Math.max(1, (hanging ? 0.5 : 1.6) * s);
    ctx.beginPath();
    if (hanging) { ctx.moveTo(x, top); ctx.lineTo(x, top - 30 * s); }
    else { ctx.moveTo(x, b.gy); ctx.lineTo(x, top + 18 * s); }
    ctx.stroke();
    ctx.fillStyle = '#1E2326';
    this.roundRect(x - 3.6 * s, top, 7.2 * s, 18 * s, 1.5 * s); ctx.fill();
    const lamps = [['red', '#FF3B30'], ['yellow', '#FFC93C'], ['green', '#34D399']];
    lamps.forEach(([name, col], i) => {
      const ly = top + (3.2 + i * 5.8) * s;
      if (state === name) {
        ctx.fillStyle = col;
        ctx.globalAlpha *= 0.35;
        ctx.beginPath(); ctx.arc(x, ly, 5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha /= 0.35;
      }
      ctx.fillStyle = state === name ? col : '#3A4347';
      ctx.beginPath(); ctx.arc(x, ly, 2.2 * s, 0, Math.PI * 2); ctx.fill();
    });
  },

  carSide3(b, color) {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy;
    ctx.fillStyle = '#1E2326';
    ctx.beginPath(); ctx.arc(x - 13 * s, y - 3.5 * s, 3.5 * s, 0, Math.PI * 2); ctx.arc(x + 13 * s, y - 3.5 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    this.roundRect(x - 23 * s, y - 13 * s, 46 * s, 9 * s, 3 * s); ctx.fill();
    this.roundRect(x - 12 * s, y - 20 * s, 22 * s, 8 * s, 3 * s); ctx.fill();
    ctx.fillStyle = '#CFE3F0';
    ctx.fillRect(x - 10 * s, y - 18.5 * s, 8 * s, 5.5 * s);
    ctx.fillRect(x, y - 18.5 * s, 8 * s, 5.5 * s);
  },

  busSign3(b) {
    const ctx = this.ctx, s = b.s;
    ctx.fillStyle = '#8A8F94';
    ctx.fillRect(b.sx - 0.8 * s, b.gy - 28 * s, 1.6 * s, 28 * s);
    ctx.fillStyle = '#2F6FB0';
    this.roundRect(b.sx - 6 * s, b.gy - 38 * s, 12 * s, 11 * s, 1.5 * s); ctx.fill();
    if (s > 0.6) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + (4.2 * s).toFixed(1) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BUS', b.sx, b.gy - 32.5 * s);
    }
  },

  truck3(b) {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy, blink = Math.floor(performance.now() / 450) % 2 === 0;
    ctx.fillStyle = '#1E2326';
    ctx.fillRect(x - 11 * s, y - 4 * s, 6 * s, 4 * s);
    ctx.fillRect(x + 5 * s, y - 4 * s, 6 * s, 4 * s);
    ctx.fillStyle = '#ECEDEE';
    ctx.fillRect(x - 13 * s, y - 34 * s, 26 * s, 30 * s);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, 0.6 * s);
    ctx.beginPath(); ctx.moveTo(x, y - 32 * s); ctx.lineTo(x, y - 6 * s); ctx.stroke();
    ctx.fillStyle = blink ? '#FFB020' : '#8A5A10';
    ctx.fillRect(x - 12.5 * s, y - 9 * s, 3.5 * s, 3 * s);
    ctx.fillRect(x + 9 * s, y - 9 * s, 3.5 * s, 3 * s);
  },

  car3(b, braking, color = '#E9965A') {
    const ctx = this.ctx, s = b.s, x = b.sx, y = b.gy;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - 13 * s, y - 1.5 * s, 26 * s, 3 * s);
    ctx.fillStyle = '#1E2326';
    ctx.fillRect(x - 11 * s, y - 4 * s, 5 * s, 4 * s);
    ctx.fillRect(x + 6 * s, y - 4 * s, 5 * s, 4 * s);
    ctx.fillStyle = color;
    this.roundRect(x - 12 * s, y - 13 * s, 24 * s, 10 * s, 2.5 * s); ctx.fill();
    this.roundRect(x - 9 * s, y - 20 * s, 18 * s, 8 * s, 2.5 * s); ctx.fill();
    ctx.fillStyle = '#CFE3F0';
    ctx.fillRect(x - 7.5 * s, y - 18.5 * s, 15 * s, 5.5 * s);
    ctx.fillStyle = braking ? '#FF3B30' : '#8E1E14';
    ctx.fillRect(x - 11.5 * s, y - 11 * s, 4 * s, 2.6 * s);
    ctx.fillRect(x + 7.5 * s, y - 11 * s, 4 * s, 2.6 * s);
  },

  // Where the parts of the car interior go on screen. Leaves room at the
  // bottom for the on-screen pedals when touch controls are used.
  cockpit() {
    const cw = this.cw, ch = this.ch, inset = this.bottomInset || 0;
    const R = Math.min(cw * (cw < ch ? 0.4 : 0.27), (ch - inset) * 0.42);
    const cx = cw / 2, cy = ch - inset + R * 0.12;
    const dashTop = cy - R * 0.78;
    const hy = Math.round(Math.max(ch * 0.26, dashTop - ch * 0.36));
    return { R, cx, cy, dashTop, hy };
  },

  drawDashboard(ck) {
    const ctx = this.ctx, cw = this.cw, ch = this.ch, c = this.car;
    const { R, cx, cy, dashTop } = ck;
    const side = dashTop + R * 0.1;

    // Roof edge and the two windshield pillars
    ctx.fillStyle = '#1D2326';
    ctx.fillRect(0, 0, cw, Math.max(10, ch * 0.025));
    const pw = Math.min(cw * 0.1, 90);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(pw, 0); ctx.lineTo(pw * 0.35, side); ctx.lineTo(0, side);
    ctx.moveTo(cw, 0); ctx.lineTo(cw - pw, 0); ctx.lineTo(cw - pw * 0.35, side); ctx.lineTo(cw, side);
    ctx.fill();

    // Front of the car's hood, just visible over the dashboard
    ctx.fillStyle = '#B4473A';   // front of your (coral) car's hood
    ctx.beginPath();
    ctx.moveTo(cw * 0.12, side);
    ctx.quadraticCurveTo(cx, dashTop - R * 0.3, cw * 0.88, side);
    ctx.fill();

    // Dashboard
    const g = ctx.createLinearGradient(0, dashTop, 0, ch);
    g.addColorStop(0, '#2B3236');
    g.addColorStop(0.12, '#1D2326');
    g.addColorStop(1, '#14191B');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, side);
    ctx.quadraticCurveTo(cx, dashTop - R * 0.08, cw, side);
    ctx.lineTo(cw, ch); ctx.lineTo(0, ch);
    ctx.fill();

    // Hood over the instrument cluster
    ctx.fillStyle = '#242B2E';
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.62, dashTop + R * 0.05);
    ctx.bezierCurveTo(cx - R * 0.55, cy - R * 0.95, cx + R * 0.55, cy - R * 0.95, cx + R * 0.62, dashTop + R * 0.05);
    ctx.fill();

    this.drawSpeedometer(cx, cy - R * 0.5, R * 0.29, R);

    // Gear: D for drive, R when backing up
    const reversing = c.v < -1 || (Input.brake > 0.02 && this.revHold > 0.4 && c.v <= 0.5);
    this.dashBox(cx - R * 0.42, cy - R * 0.66, R, 'GEAR', reversing ? 'R' : 'D', reversing ? '#F2994A' : '#7CE0A3');

    // Speed limit reminder (many new cars show this on the dashboard)
    const lx = cx + R * 0.42, ly = cy - R * 0.66, lr = R * 0.095;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#C0392B';
    ctx.lineWidth = lr * 0.22;
    ctx.beginPath(); ctx.arc(lx, ly, lr * 0.86, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1E2A2F';
    ctx.font = 'bold ' + (lr * 0.9).toFixed(1) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.level.speedLimit, lx, ly + lr * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = (R * 0.045).toFixed(1) + 'px system-ui, sans-serif';
    ctx.fillText('LIMIT', lx, ly + lr * 1.55);

    this.drawWheel(cx, cy, R);
  },

  drawSpeedometer(x, y, r, R) {
    const ctx = this.ctx, lv = this.level;
    const MAX = 50;
    const mph = Math.abs(this.car.v) / PX_PER_MPH;
    this.needle = this.needle == null ? mph : this.needle + (mph - this.needle) * 0.25;
    const ang = m => (135 + 270 * Math.min(MAX, Math.max(0, m)) / MAX) * Math.PI / 180;
    const over = mph > lv.speedLimit + 3;

    ctx.fillStyle = '#0E1214';
    ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3A4347';
    ctx.lineWidth = r * 0.05;
    ctx.stroke();

    // Red zone: faster than the speed limit
    ctx.strokeStyle = 'rgba(232,76,61,0.75)';
    ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, ang(lv.speedLimit), ang(MAX)); ctx.stroke();
    // Green zone: under the limit
    ctx.strokeStyle = 'rgba(63,162,107,0.6)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, ang(0), ang(lv.speedLimit)); ctx.stroke();

    // Tick marks and numbers
    ctx.strokeStyle = '#E8EDEB';
    ctx.fillStyle = '#E8EDEB';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (r * 0.17).toFixed(1) + 'px system-ui, sans-serif';
    for (let m = 0; m <= MAX; m += 5) {
      const a = ang(m), major = m % 10 === 0;
      const r1 = r * (major ? 0.68 : 0.74), r2 = r * 0.83;
      ctx.lineWidth = r * (major ? 0.04 : 0.022);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      ctx.stroke();
      if (major) ctx.fillText(m, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    }

    // Speed-limit marker
    const la = ang(lv.speedLimit);
    ctx.fillStyle = '#F2C94C';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(la) * r * 0.97, y + Math.sin(la) * r * 0.97);
    ctx.lineTo(x + Math.cos(la - 0.09) * r * 1.13, y + Math.sin(la - 0.09) * r * 1.13);
    ctx.lineTo(x + Math.cos(la + 0.09) * r * 1.13, y + Math.sin(la + 0.09) * r * 1.13);
    ctx.closePath();
    ctx.fill();

    // Digital speed readout
    ctx.fillStyle = over ? '#FF6B5B' : '#FFFFFF';
    ctx.font = 'bold ' + (r * 0.36).toFixed(1) + 'px system-ui, sans-serif';
    ctx.fillText(Math.round(mph), x, y + r * 0.42);
    ctx.fillStyle = 'rgba(232,237,235,0.75)';
    ctx.font = (r * 0.14).toFixed(1) + 'px system-ui, sans-serif';
    ctx.fillText('mph', x, y + r * 0.68);

    // Needle
    const na = ang(this.needle);
    ctx.strokeStyle = '#FF7A45';
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(na) * r * 0.12, y - Math.sin(na) * r * 0.12);
    ctx.lineTo(x + Math.cos(na) * r * 0.8, y + Math.sin(na) * r * 0.8);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#3A4347';
    ctx.beginPath(); ctx.arc(x, y, r * 0.08, 0, Math.PI * 2); ctx.fill();
  },

  dashBox(x, y, R, label, value, color) {
    const ctx = this.ctx, w = R * 0.16, h = R * 0.17;
    ctx.fillStyle = '#0E1214';
    this.roundRect(x - w / 2, y - h / 2, w, h, R * 0.025);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (R * 0.11).toFixed(1) + 'px system-ui, sans-serif';
    ctx.fillText(value, x, y + R * 0.005);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = (R * 0.045).toFixed(1) + 'px system-ui, sans-serif';
    ctx.fillText(label, x, y + h / 2 + R * 0.045);
  },

  // Three-spoke steering wheel. It turns with your steering, and its spokes
  // are angled low so they never cover the speedometer.
  drawWheel(cx, cy, R) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Input.steer * 0.95);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F1214';
    ctx.lineWidth = R * 0.12;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = R * 0.03;
    ctx.beginPath(); ctx.arc(0, 0, R - R * 0.03, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.strokeStyle = '#1B2023';
    ctx.lineWidth = R * 0.11;
    const down = 0.17;   // spokes sit about 10 degrees below horizontal
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(down) * R, Math.sin(down) * R);
    ctx.moveTo(0, 0); ctx.lineTo(Math.cos(down) * R, Math.sin(down) * R);
    ctx.moveTo(0, 0); ctx.lineTo(0, R);
    ctx.stroke();
    ctx.fillStyle = '#2B3236';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D95D4A';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D95D4A';
    ctx.fillRect(-R * 0.035, -R * 1.06, R * 0.07, R * 0.12);   // top-center marker
    ctx.restore();
    ctx.lineCap = 'butt';
  },

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
};
