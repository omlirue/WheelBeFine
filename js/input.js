// Turns the keyboard or the on-screen touch controls into three numbers:
//   steer    -1 (full left) .. 1 (full right)
//   throttle  0 .. 1
//   brake     0 .. 1
// Pedals and keyboard steering "ramp up" instead of jumping straight to 100%.
// That way a quick tap gives a small, gentle input, which teaches smooth driving.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

const Input = {
  mode: 'keyboard',          // 'keyboard' (computers) or 'touch' (phones and tablets)
  keys: {},
  steer: 0, throttle: 0, brake: 0,
  kbSteer: 0, gasRamp: 0, brakeRamp: 0,
  touch: { steer: 0, gas: false, brake: false },

  init() {
    const driveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (document.body.classList.contains('driving') && driveKeys.includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    this.initTouch();
  },

  // On-screen steering wheel (drag left/right) and Gas/Brake pedals
  initTouch() {
    const pad = document.getElementById('wheel-pad');
    const wheel = document.getElementById('wheel');
    let startX = null;
    const setSteer = v => {
      this.touch.steer = v;
      wheel.style.transform = 'rotate(' + Math.round(v * 120) + 'deg)';
    };
    pad.addEventListener('pointerdown', e => {
      startX = e.clientX;
      pad.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', e => {
      if (startX === null) return;
      setSteer(clamp((e.clientX - startX) / 70, -1, 1));
    });
    const end = () => { startX = null; setSteer(0); };
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
    this.keys = {};
  },

  update(dt) {
    const k = this.keys;
    const left = k.ArrowLeft || k.KeyA, right = k.ArrowRight || k.KeyD;
    const up = k.ArrowUp || k.KeyW, down = k.ArrowDown || k.KeyS;

    // Pedals ramp up gently (about 0.7 s to full gas) and release quickly
    const wantGas = up || this.touch.gas;
    const wantBrake = down || this.touch.brake;
    this.gasRamp = approach(this.gasRamp, wantGas ? 1 : 0, wantGas ? 1.4 * dt : 4 * dt);
    this.brakeRamp = approach(this.brakeRamp, wantBrake ? 1 : 0, wantBrake ? 1.6 * dt : 5 * dt);
    this.throttle = this.gasRamp;
    this.brake = this.brakeRamp;

    // Steering: arrow keys turn the wheel gradually (about 0.5 s to full lock) and it
    // returns to center when released. The touch wheel follows your thumb smoothly.
    if (left || right || this.mode !== 'touch') {
      const t = (right ? 1 : 0) - (left ? 1 : 0);
      this.kbSteer = approach(this.kbSteer, t, t !== 0 ? 2.0 * dt : 3.5 * dt);
      this.steer = this.kbSteer;
    } else {
      this.steer += (this.touch.steer - this.steer) * Math.min(1, dt * 12);
      this.kbSteer = this.steer;
    }
  },
};
