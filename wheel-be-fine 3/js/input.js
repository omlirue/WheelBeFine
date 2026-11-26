// Turns the keyboard or the on-screen touch controls into three numbers (plus the gear):
//   steer    -1 (full left) .. 1 (full right)
//   throttle  0 .. 1
//   brake     0 .. 1
// Pedals and keyboard steering "ramp up" instead of jumping straight to 100%.
// That way a quick tap gives a small, gentle input, which teaches smooth driving.

// Steering wheel rotation lock to lock, in degrees (like the 900° wheel setting in
// racing games). Only changes how far the wheel graphics turn, not how fast the car steers.
const WHEEL_ROTATION = 900;

// How fast the A and D keys turn the wheel. Bigger numbers = slower, smoother steering.
const STEER_TIME = 1.4;    // seconds to turn from center to full lock
const CENTER_TIME = 0.8;   // seconds for the wheel to return to center when you let go

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

const Input = {
  mode: 'keyboard',          // 'keyboard' (computers) or 'touch' (phones and tablets)
  gear: 'P',                 // 'P' park, 'R' reverse, 'D' drive. Every drive starts in Park.
  keys: {},
  steer: 0, throttle: 0, brake: 0,
  kbSteer: 0, gasRamp: 0, brakeRamp: 0,
  touch: { steer: 0, gas: false, brake: false },

  init() {
    const driveKeys = ['Space'];
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      // stop Space from scrolling the page, but let it work in checkboxes and buttons
      const inControl = e.target && /^(INPUT|BUTTON)$/.test(e.target.tagName);
      if (document.body.classList.contains('driving') && driveKeys.includes(e.code) && !inControl) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    this.initTouch();
  },

  // On-screen steering wheel. You turn it like a real wheel: put your thumb on it and
  // move in a circle. Letting go springs it back to center.
  // Like a 900° wheel in a racing game: 450° each way (about 2.5 turns lock to lock).
  // The wheel stays right under your thumb, so full lock takes 450° of thumb movement.
  initTouch() {
    const THUMB_LOCK = WHEEL_ROTATION / 2;   // degrees of thumb movement for full steering lock
    const pad = document.getElementById('wheel-pad');
    const wheel = document.getElementById('wheel');
    let dragging = false, lastAngle = 0, rotation = 0;   // rotation = thumb degrees
    const draw = () => {
      wheel.style.transform = 'rotate(' + (rotation / THUMB_LOCK * WHEEL_ROTATION / 2).toFixed(1) + 'deg)';
    };
    const angleOf = e => {
      const r = wheel.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      return { deg: Math.atan2(dy, dx) * 180 / Math.PI, dist: Math.hypot(dx, dy) };
    };
    pad.addEventListener('pointerdown', e => {
      dragging = true;
      lastAngle = angleOf(e).deg;
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* keep going without capture */ }
      e.preventDefault();
    });
    pad.addEventListener('pointermove', e => {
      if (!dragging) return;
      const a = angleOf(e);
      if (a.dist < 14) return;                      // too close to the center to tell direction
      let d = a.deg - lastAngle;
      if (d > 180) d -= 360;                        // crossed the ±180° line
      if (d < -180) d += 360;
      lastAngle = a.deg;
      rotation = clamp(rotation + d, -THUMB_LOCK, THUMB_LOCK);
      this.touch.steer = rotation / THUMB_LOCK;
      draw();
    });
    const end = () => {
      dragging = false;
      // spring back to center smoothly, like a real car's wheel after a turn
      const back = () => {
        if (dragging) return;
        rotation *= 0.75;
        if (Math.abs(rotation) < 1) rotation = 0;
        this.touch.steer = rotation / THUMB_LOCK;
        draw();
        if (rotation !== 0) requestAnimationFrame(back);
      };
      requestAnimationFrame(back);
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    const pedal = (id, key) => {
      const el = document.getElementById(id);
      const on = e => { this.touch[key] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); e.preventDefault(); };
      const off = () => { this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    pedal('pedal-gas', 'gas');
    pedal('pedal-brake', 'brake');
  },

  reset() {
    this.steer = this.throttle = this.brake = 0;
    this.kbSteer = this.gasRamp = this.brakeRamp = 0;
    this.touch.gas = this.touch.brake = false;
    this.keys = {};
  },

  update(dt) {
    const k = this.keys;
    // W = gas, S = brake, A / D = steer
    const left = k.KeyA, right = k.KeyD;
    const up = k.KeyW, down = k.KeyS;

    // Pedals ramp up gently (about 0.7 s to full gas) and release quickly
    const wantGas = up || this.touch.gas;
    const wantBrake = down || this.touch.brake;
    this.gasRamp = approach(this.gasRamp, wantGas ? 1 : 0, wantGas ? 1.4 * dt : 4 * dt);
    this.brakeRamp = approach(this.brakeRamp, wantBrake ? 1 : 0, wantBrake ? 1.6 * dt : 5 * dt);
    this.throttle = this.gasRamp;
    this.brake = this.brakeRamp;

    // Steering: the A and D keys turn the wheel gradually (STEER_TIME seconds to full lock) and
    // it returns to center when released. The touch wheel follows your thumb smoothly.
    if (left || right || this.mode !== 'touch') {
      const t = (right ? 1 : 0) - (left ? 1 : 0);
      this.kbSteer = approach(this.kbSteer, t, t !== 0 ? dt / STEER_TIME : dt / CENTER_TIME);
      this.steer = this.kbSteer;
    } else {
      this.steer += (this.touch.steer - this.steer) * Math.min(1, dt * 12);
      this.kbSteer = this.steer;
    }
  },
};
