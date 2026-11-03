// Car physics: a "dynamic bicycle model" like the ones used in driving simulators.
//
// The car is treated as one front axle and one rear axle. Each axle has tires that
// make sideways grip from their "slip angle" (the angle between where the tire points
// and where it is actually moving). Grip rises with slip angle up to a peak, then
// falls off, which is what makes a car slide. Braking and accelerating use up some of
// that same grip (the "friction circle"), and braking shifts weight onto the front
// tires (weight transfer). There is no downforce and no stability control.
//
// Everything inside here uses real units (meters, seconds, kilograms, newtons).
// The rest of the game uses screen units, so we convert at the edges.

const PX_PER_M = 6 * 2.23694;   // 6 screen units per mph, 2.237 mph per m/s  →  about 13.4 units per meter
const G = 9.81;

const CAR = {
  mass: 1300,            // kg (a typical compact car)
  inertia: 2000,         // yaw inertia, kg·m²
  a: 1.15,               // center of mass to front axle, m
  b: 1.45,               // center of mass to rear axle, m
  cgHeight: 0.55,        // m, used for weight transfer
  corneringFront: 75000, // tire cornering stiffness, N per radian of slip
  corneringRear: 85000,  // a bit stiffer at the back: mild understeer, like most road cars
  maxSteer: 0.55,        // front wheel angle at full lock, rad (about 31°)
  enginePower: 85000,    // W (about 115 hp)
  maxDriveForce: 4200,   // N, limits launch acceleration to about 0.33 g
  brakeForce: 13500,     // N at full pedal (more than the tires can use, so ABS limits it)
  brakeBias: 0.65,       // share of braking on the front axle
  dragCoef: 0.42,        // aerodynamic drag, N per (m/s)²
};

const Physics = {
  // Lateral force from one axle's tires (simplified Pacejka "magic formula").
  // fx = the force already being used for braking or accelerating on that axle.
  tireForce(slip, load, mu, stiffness, fx) {
    const maxGrip = mu * load;
    const available = Math.sqrt(Math.max(0, maxGrip * maxGrip - fx * fx));   // friction circle
    const B = stiffness / (1.9 * maxGrip);                                  // matches stiffness near zero slip
    return -available * Math.sin(1.9 * Math.atan(B * slip));
  },

  // Slip angle where an axle's grip peaks (beyond this it is sliding).
  peakSlip(load, mu, stiffness) {
    return 1.09 * 1.9 * mu * load / stiffness;
  },

  // Move the car forward by dt seconds.
  //   car:    { x, y, a, v (screen units/s, forward), vy, r }  (vy and r are added if missing)
  //   input:  { throttle 0..1, brake 0..1, steer -1..1, reverse true/false }
  //   ground: { mu (grip), rolling (rolling resistance) }
  step(car, input, dt, ground) {
    if (car.vy == null) { car.vy = 0; car.r = 0; car.ax = 0; car.ay = 0; }
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));   // small substeps keep the math stable
    const h = dt / steps;
    let skidF = false, skidR = false;
    for (let i = 0; i < steps; i++) {
      const s = this.substep(car, input, h, ground);
      skidF = skidF || s.skidF;
      skidR = skidR || s.skidR;
    }
    car.skidFront = skidF;
    car.skidRear = skidR;
  },

  substep(car, input, dt, ground) {
    const P = CAR, L = P.a + P.b, m = P.mass, mu = ground.mu;
    let vx = car.v / PX_PER_M, vy = car.vy, r = car.r;
    const delta = input.steer * P.maxSteer;
    const speed = Math.hypot(vx, vy);
    const dir = Math.abs(vx) > 0.05 ? Math.sign(vx) : 0;

    // ---- Forces along the car (engine, brakes, rolling resistance, drag) ----
    let drive = 0, brake = 0;
    if (input.reverse) {
      drive = vx > -2.2 ? -input.brake * P.maxDriveForce * 0.5 : 0;   // reverse gear, walking pace (about 5 mph)
    } else {
      if (vx < -0.3) brake += input.throttle * P.brakeForce;       // gas while rolling backward slows you down
      else drive = input.throttle * Math.min(P.maxDriveForce, P.enginePower / Math.max(Math.abs(vx), 1));
      brake += input.brake * P.brakeForce;
    }

    // Weight transfer: braking (negative ax) loads the front, accelerating loads the rear
    const loadF = m * G * P.b / L - m * car.ax * P.cgHeight / L;
    const loadR = m * G * P.a / L + m * car.ax * P.cgHeight / L;

    // Front-wheel drive. ABS and traction control keep the tires just under their grip limit,
    // which leaves a little grip for steering while braking hard (like real ABS).
    let fxF = drive - brake * P.brakeBias * dir;
    let fxR = -brake * (1 - P.brakeBias) * dir;
    const limF = 0.85 * mu * loadF, limR = 0.85 * mu * loadR;
    fxF = Math.max(-limF, Math.min(limF, fxF));
    fxR = Math.max(-limR, Math.min(limR, fxR));
    const resist = -dir * ground.rolling * m * G - P.dragCoef * vx * Math.abs(vx);

    // ---- Sideways tire forces from slip angles ----
    let fyF = 0, fyR = 0, skidF = false, skidR = false;
    if (vx > 0.5) {
      const slipF = Math.atan2(vy + P.a * r, vx) - delta;
      const slipR = Math.atan2(vy - P.b * r, vx);
      fyF = this.tireForce(slipF, loadF, mu, P.corneringFront, fxF);
      fyR = this.tireForce(slipR, loadR, mu, P.corneringRear, fxR);
      if (speed > 3) {
        skidF = Math.abs(slipF) > this.peakSlip(loadF, mu, P.corneringFront) * 1.1;
        skidR = Math.abs(slipR) > this.peakSlip(loadR, mu, P.corneringRear) * 1.1;
      }
    }

    // ---- Equations of motion (in the car's own frame) ----
    const cos = Math.cos(delta), sin = Math.sin(delta);
    const axBody = (fxF * cos - fyF * sin + fxR + resist) / m;
    const ayBody = (fyF * cos + fxF * sin + fyR) / m;
    let vxNew = vx + (axBody + vy * r) * dt;
    let vyDyn = vy + (ayBody - vx * r) * dt;
    let rDyn = r + ((P.a * (fyF * cos + fxF * sin) - P.b * fyR) / P.inertia) * dt;

    // Brakes and friction bring you to a stop; they never push you backward
    if (!input.reverse && dir !== 0 && Math.sign(vxNew) !== dir) vxNew = 0;
    if (dir === 0 && !input.reverse && drive <= 0) vxNew = 0;

    // At walking speeds tire slip math gets jumpy, so blend into simple geometric steering
    const blend = vx > 0 ? Math.max(0, Math.min(1, (Math.abs(vx) - 2) / 2.5)) : 0;
    const rKin = vxNew * Math.tan(delta) / L;
    const vyKin = rKin * P.b;
    vy = blend * vyDyn + (1 - blend) * vyKin;
    r = blend * rDyn + (1 - blend) * rKin;
    vx = vxNew;

    // ---- Move the car in the world ----
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    car.x += (vx * ca - vy * sa) * PX_PER_M * dt;
    car.y += (vx * sa + vy * ca) * PX_PER_M * dt;
    car.a += r * dt;
    car.v = vx * PX_PER_M;
    car.vy = vy;
    car.r = r;
    car.ax = axBody;            // forward acceleration, m/s² (negative = braking)
    car.ay = ayBody;            // sideways acceleration, m/s² (what you'd feel in your seat)
    return { skidF, skidR };
  },

  // Fastest speed (screen units/s) you can take a curve of this radius (screen units)
  // while staying at or under a given sideways acceleration (in g).
  curveSpeed(radiusPx, g) {
    return Math.sqrt(g * G * radiusPx / PX_PER_M) * PX_PER_M;
  },
};
