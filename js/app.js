const CONTROL_HELP = {
  keyboard: 'Up arrow (or W) = gas. Down arrow (or S) = brake; keep holding it when stopped to back up. Left and right arrows steer. Short taps give small, smooth turns.',
  touch: 'Drag the wheel on the left to steer. Hold Gas and Brake on the right with your other thumb.',
};

// Shown on the pause screen when "Show controls" is pressed.
const CONTROL_ROWS = {
  keyboard: {
    name: 'Keyboard',
    rows: [
      ['Gas', 'Up arrow or W. Tap it for a gentle push.'],
      ['Brake', 'Down arrow or S. Press early and gently.'],
      ['Back up', 'Keep holding Down arrow or S after the car stops.'],
      ['Steer', 'Left / Right arrows or A / D. Short taps make small turns.'],
      ['Switch view', 'V key, or the Driver view / Map view button'],
      ['Pause', 'Space bar, P, or Esc'],
    ],
  },
  touch: {
    name: 'Touch',
    rows: [
      ['Gas', 'Hold the green Gas button (bottom right).'],
      ['Brake', 'Hold the red Brake button.'],
      ['Back up', 'Keep holding Brake after the car stops.'],
      ['Steer', 'Put your thumb on the wheel (bottom left) and drag left or right.'],
      ['Switch view', 'Driver view / Map view button at the top'],
      ['Pause', 'Pause button at the top'],
    ],
  },
};

// The controls key. Arrow keys get data-k so they light up when pressed.
function keysHtml(mode, withClose) {
  const close = withClose ? '<button id="keys-hide" aria-label="Hide controls key">×</button>' : '';
  const title = t => withClose ? '<div class="keys-title">' + t + close + '</div>' : '';
  if (mode === 'touch') {
    return '<ul>' +
      '<li><kbd data-k="up">Gas</kbd> Hold the green button to go forward</li>' +
      '<li><kbd data-k="down">Brake</kbd> Hold the red button to slow down · keep holding to back up</li>' +
      '<li><kbd data-k="left">◀</kbd><kbd data-k="right">▶</kbd> ' + 'Drag the wheel to steer' + '</li></ul>';
  }
  return title('Controls') +
    '<div class="arrows">' +
      '<div class="cell up"><kbd data-k="up">↑</kbd><small>Forward</small></div>' +
      '<div class="cell left"><kbd data-k="left">←</kbd><small>Left</small></div>' +
      '<div class="cell down"><kbd data-k="down">↓</kbd><small>Brake</small></div>' +
      '<div class="cell right"><kbd data-k="right">→</kbd><small>Right</small></div>' +
    '</div><ul>' +
      '<li><kbd>Hold ↓</kbd> Back up (when stopped)</li>' +
      '<li><kbd>Space</kbd> Pause · <kbd style="min-width:22px">V</kbd> View</li></ul>' +
    '<div class="muted" style="margin-top:4px">W A S D work too.</div>';
}

const LOT_DIAGRAM = '<p>Drive into each yellow circle in order, then park in the green box:</p>' +
  '<svg viewBox="0 0 340 130" role="img" aria-label="Diagram: the car drives through yellow circles 1 to 5, then parks in the green box">' +
  '<rect x="2" y="2" width="336" height="126" rx="12" fill="#646C76"/>' +
  '<path d="M40 104 C40 60 60 40 80 34 S150 20 170 30 S250 40 270 34 S300 80 280 96 S200 110 190 104 S120 96 110 104" fill="none" stroke="#F2C94C" stroke-width="3" stroke-dasharray="7 6"/>' +
  [[80, 34, 1], [170, 30, 2], [270, 34, 3], [280, 96, 4], [190, 104, 5]].map(([x, y, n]) =>
    '<circle cx="' + x + '" cy="' + y + '" r="15" fill="rgba(242,201,76,.35)" stroke="#F2C94C" stroke-width="2.5"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#F07F2E"/>' +
    '<circle cx="' + (x + 13) + '" cy="' + (y - 12) + '" r="7.5" fill="#1E2A2F"/>' +
    '<text x="' + (x + 13) + '" y="' + (y - 8.5) + '" font-size="10" font-weight="700" fill="#fff" text-anchor="middle" font-family="system-ui">' + n + '</text>').join('') +
  '<rect x="88" y="86" width="44" height="34" rx="3" fill="rgba(63,162,107,.45)" stroke="#7CE0A3" stroke-width="2" stroke-dasharray="5 4"/>' +
  '<text x="110" y="107" font-size="11" font-weight="800" fill="#fff" text-anchor="middle" font-family="system-ui">PARK</text>' +
  '<rect x="31" y="98" width="18" height="28" rx="4" fill="#D95D4A"/><rect x="34" y="102" width="12" height="6" rx="1.5" fill="#CFE3F0"/>' +
  '<text x="40" y="94" font-size="10" font-weight="700" fill="#fff" text-anchor="middle" font-family="system-ui">You</text>' +
  '</svg>';

// A burst of confetti in the app's colors
function confetti(amount = 170) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cv = document.getElementById('confetti');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'confetti';
    document.body.appendChild(cv);
  }
  const ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = ['#D4E09B', '#F19C79', '#A44A3F', '#F6C85F', '#A9CBE8', '#5A7431', '#CBDFBD'];
  const bits = [];
  for (let i = 0; i < amount; i++) {
    const fromLeft = i % 2 === 0;
    bits.push({
      x: fromLeft ? -10 : innerWidth + 10, y: innerHeight * (0.45 + Math.random() * 0.4),
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9), vy: -(9 + Math.random() * 11),
      w: 6 + Math.random() * 7, h: 9 + Math.random() * 9, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: colors[i % colors.length], heart: i % 9 === 0,
    });
  }
  const start = performance.now();
  cancelAnimationFrame(confetti.raf);
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const t = (now - start) / 1000;
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, 4.2 - t));
      ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      if (b.heart) {
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.bezierCurveTo(-9, -3, -5, -10, 0, -5); ctx.bezierCurveTo(5, -10, 9, -3, 0, 4);
        ctx.fill();
      } else {
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)) + 2);
      }
      ctx.restore();
    }
    if (t < 4.3) confetti.raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

function pipsHtml(n) {
  return '<span class="pips" aria-hidden="true">' + [1, 2, 3, 4, 5].map(i => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span>';
}

class Breather {
  constructor(el) {
    this.circle = el.querySelector('.breath-circle');
    this.text = el.querySelector('.breath-text');
    this.timer = null;
  }

  // cycles = 0 means keep going until stop() is called.
  start(cycles, onDone) {
    this.stop();
    const phases = [
      { label: 'Breathe in', secs: 4, scale: 1 },
      { label: 'Hold', secs: 4, scale: 1 },
      { label: 'Breathe out', secs: 6, scale: 0.55 },
    ];
    let cycle = 0, pi = 0, left = 0;
    const enter = () => {
      const ph = phases[pi];
      left = ph.secs;
      this.circle.style.transitionDuration = ph.secs + 's';
      this.circle.style.transform = 'scale(' + ph.scale + ')';
      this.show(ph.label, left);
    };
    this.circle.style.transitionDuration = '0s';
    this.circle.style.transform = 'scale(0.55)';
    void this.circle.offsetWidth;
    enter();
    this.timer = setInterval(() => {
      left--;
      if (left > 0) { this.show(phases[pi].label, left); return; }
      pi++;
      if (pi >= phases.length) {
        pi = 0;
        cycle++;
        if (cycles && cycle >= cycles) {
          this.stop();
          this.text.innerHTML = '<b>Nice work</b>';
          if (onDone) setTimeout(onDone, 800);
          return;
        }
      }
      enter();
    }, 1000);
  }

  show(label, n) {
    this.text.innerHTML = '<b>' + label + '</b><span>' + n + '</span>';
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

function buildFeedback(level, st) {
  const good = [], next = [];
  const road = level.type === 'road';

  if (st.offroad === 0) good.push(road ? 'Stayed on the road the whole drive.' : 'Stayed inside the lot the whole time.');
  else next.push((road ? 'Left the road ' : 'Bumped the curb ') + st.offroad + (st.offroad === 1 ? ' time.' : ' times.') + ' Look ahead to where you want to go and make small steering corrections.');

  if (road) {
    if (st.wrongLaneTime < 0.5) good.push('Kept to the right-hand lane.');
    else next.push('Spent ' + st.wrongLaneTime.toFixed(1) + ' seconds over the yellow line. Keep the yellow dashes on your left.');
  }

  if (st.speedingTime < 1) good.push('Stayed under the speed limit.');
  else next.push('Went over the speed limit for ' + st.speedingTime.toFixed(0) + ' seconds. Use light, steady pressure on the gas.');

  if (st.harshBrakes === 0) good.push('Smooth, gentle braking.');
  else next.push('Braked suddenly ' + st.harshBrakes + (st.harshBrakes === 1 ? ' time' : ' times') + '. Start slowing down a little earlier.');

  if (st.harshTurns === 0) good.push('Smooth steering.');
  else next.push('Made ' + st.harshTurns + ' sharp ' + (st.harshTurns === 1 ? 'turn' : 'turns') + '. Slow down before curves and turn the wheel a little at a time.');

  if (!st.skids) good.push('No skids: you stayed within your tires\' grip.');
  else next.push('Skidded ' + st.skids + (st.skids === 1 ? ' time' : ' times') + '. Tires only have so much grip. Brake before a turn, not during it, and turn at a gentler speed.');

  if (st.stopsTotal) {
    if (st.goodStops) good.push('Came to a full stop at ' + st.goodStops + ' of ' + st.stopsTotal + ' stop signs.');
    if (st.rolledStops) next.push('Rolled through ' + st.rolledStops + ' stop ' + (st.rolledStops === 1 ? 'sign' : 'signs') + '. Wait until the speed reads 0 before going.');
  }
  if (st.yields) good.push('Waited for pedestrians to cross.');
  if (st.missedYields) next.push('Passed a pedestrian who was still crossing. Wait until they\'re all the way across.');
  if (st.closeCalls) next.push('Had ' + st.closeCalls + ' close ' + (st.closeCalls === 1 ? 'call' : 'calls') + '. Slow down early when something is in your path.');
  if (st.traffic) {
    if (st.tailgateTime < 1) good.push('Kept a safe distance from the car ahead.');
    else next.push('Followed too closely for ' + st.tailgateTime.toFixed(0) + ' seconds. Leave more space; there\'s no rush.');
  }

  if (st.lightsTotal) {
    if (!st.ranReds) good.push('Obeyed every traffic light.');
    else next.push('Went through ' + st.ranReds + ' red ' + (st.ranReds === 1 ? 'light' : 'lights') + '. When the light turns yellow, ease off the gas so you can stop calmly.');
  }
  if (st.city) {
    if (st.bikeLaneTime < 0.5) good.push('Stayed out of the bike lane.');
    else next.push('Spent ' + st.bikeLaneTime.toFixed(0) + ' seconds in the bike lane. Keep left of the solid white line, especially while turning.');
    if (!st.passedClose) good.push('Gave cyclists and scooter riders plenty of room.');
    else next.push('Passed ' + st.passedClose + (st.passedClose === 1 ? ' rider' : ' riders') + ' too closely. Leave at least 3 feet, or wait behind them until there is room.');
  }

  if (!good.length) good.push('You finished the drive. That counts.');
  if (!next.length) next.push('Nothing to fix! Drive it again to build the habit, or move on when you feel ready.');
  return { good: good.slice(0, 10), next };
}

const App = {
  before: 5,
  level: null,
  result: null,
  saved: true,

  $(id) { return document.getElementById(id); },

  init() {
    Progress.init();
    Input.init();
    Game.init();
    this.mainBreather = new Breather(this.$('breath-main'));
    this.pauseBreather = new Breather(this.$('breath-pause'));
    const last = Progress.data.sessions[Progress.data.sessions.length - 1];
    if (last) this.before = last.after;
    this.bind();
    this.setupControls();
    this.show('home');
  },

  show(id) {
    // Stop any confetti still falling from the last screen
    cancelAnimationFrame(confetti.raf);
    const cf = document.getElementById('confetti');
    if (cf) cf.getContext('2d').clearRect(0, 0, cf.width, cf.height);
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; });
    this.current = id;
    document.body.classList.toggle('driving', id === 'drive');
    if (id !== 'breathe') this.mainBreather.stop();
    if (id !== 'drive') Game.stop();
    window.scrollTo(0, 0);
  },

  go(id) {
    this.show(id);
    if (id === 'levels') this.renderLevels();
    if (id === 'progress') this.renderProgress();
  },

  bind() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => this.go(b.dataset.go)));
    this.$('btn-start').onclick = () => this.openCheckin();
    this.$('btn-progress').onclick = () => this.go('progress');
    this.$('btn-about').onclick = () => this.go('about');

    const cr = this.$('checkin-range');
    cr.oninput = () => { this.$('checkin-value').textContent = cr.value; };
    this.$('checkin-next').onclick = () => { this.before = +cr.value; this.openBreathe(); };
    this.$('breathe-skip').onclick = () => this.go('levels');

    this.$('brief-go').onclick = () => this.startDrive(this.level);

    this.$('btn-pause').onclick = () => this.pause();
    this.$('btn-view').onclick = e => { this.toggleView(); e.currentTarget.blur(); };
    this.$('pause-resume').onclick = () => this.resume();
    this.$('intro-go').onclick = () => this.beginDrive();
    this.$('btn-keys').onclick = e => { this.toggleKeys(); e.currentTarget.blur(); };
    this.$('pause-controls-btn').onclick = () => this.showPauseControls(this.$('pause-help').hidden);
    this.$('pause-restart').onclick = () => { this.resume(); this.startDrive(this.level); };
    this.$('pause-quit').onclick = () => { this.resume(); this.go('levels'); };

    this.$('checkout-range').oninput = () => this.updateCheckout();
    this.$('res-next-level').onclick = () => {
      this.saveSession();
      const next = LEVELS.find(l => l.id === this.level.id + 1);
      this.openBrief(next || this.level);
    };
    this.$('res-retry').onclick = () => { this.saveSession(); this.startDrive(this.level); };
    this.$('res-levels').onclick = () => { this.saveSession(); this.go('levels'); };

    this.$('res-cert').onclick = () => { this.saveSession(); this.openCertificate(); };
    this.$('btn-cert').onclick = () => this.openCertificate();
    this.$('cert-print').onclick = () => window.print();
    this.$('cert-confetti').onclick = () => confetti(220);
    this.$('cert-name').oninput = e => Progress.saveSettings({ certName: e.target.value });
    this.$('unlock-all').onclick = () => this.confirmBox({
      title: 'Make all drives available?',
      body: '<p>Normally, each drive unlocks only after you score 60 or more on the one before it, so you build skills in order.</p>' +
        '<p>This opens every drive right away, so you can skip ahead. Your scores stay the same, and you still need to pass all six drives to finish your certificate.</p>',
      ok: 'Unlock all drives',
      onOk: () => { Progress.unlockAll(); this.renderProgress(); this.toast('All drives are now available.'); },
    });
    this.$('reset-progress').onclick = () => this.confirmBox({
      title: 'Reset all progress?',
      body: '<p>This erases your scores, completed drives, check-ins, and the name on your certificate. You\'ll start again at Drive 1.</p><p><b>This can\'t be undone.</b></p>',
      ok: 'Reset progress',
      onOk: () => { Progress.reset(); this.before = 5; this.renderProgress(); this.toast('Progress reset. Fresh start!'); },
    });
    this.$('modal-cancel').onclick = () => this.closeModal();
    this.$('modal').onclick = e => { if (e.target.id === 'modal') this.closeModal(); };
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && !this.$('modal').hidden) this.closeModal(); });
    this.$('btn-home-cert').onclick = () => this.openCertificate();

    window.addEventListener('keydown', e => {
      if (this.current !== 'drive') return;
      if (!this.$('intro').hidden) {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.beginDrive(); }
        return;
      }
      if (e.code === 'KeyK' && this.$('pause').hidden) this.toggleKeys();
      if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (this.$('pause').hidden) this.pause(); else this.resume();
      }
      if (e.code === 'KeyV' && this.$('pause').hidden) this.toggleView();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.current === 'drive' && this.$('intro').hidden) this.pause();
    });
  },

  // Controls are picked automatically: on-screen touch controls on phones and tablets,
  // the keyboard on computers.
  setupControls() {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    this.setMode(coarse ? 'touch' : 'keyboard', false);
  },

  setMode(mode, save) {
    Input.mode = mode;
    if (save) Progress.saveSettings({ ctrl: mode });
  },

  openCheckin() {
    const cr = this.$('checkin-range');
    cr.value = this.before;
    this.$('checkin-value').textContent = this.before;
    this.go('checkin');
  },

  openBreathe() {
    this.go('breathe');
    this.mainBreather.start(3, () => { if (this.current === 'breathe') this.go('levels'); });
  },

  renderLevels() {
    const list = this.$('level-list');
    list.innerHTML = '';
    const d = Progress.data;
    LEVELS.forEach(lv => {
      const locked = lv.id > d.unlocked;
      const best = d.best[lv.id];
      const done = Progress.passed(lv.id);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'level-card' + (done ? ' done' : '') + (lv.boss ? ' boss' : '');
      btn.style.setProperty('--lc', lv.color);
      btn.disabled = locked;
      const prev = LEVELS.find(l => l.id === lv.id - 1);
      const badge = locked ? '<span class="badge lock">🔒 Locked</span>'
        : done ? '<span class="badge done">✓ Completed · Best ' + best + '</span>'
        : best != null ? '<span class="badge retry">Try again · need ' + PASS_SCORE + '</span>'
        : '<span class="badge new">New</span>';
      const pips = pipsHtml(lv.difficulty);
      btn.innerHTML = (lv.boss ? '<span class="ribbon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.5-10-5 4L12 5l-2.5 7-5-4z" fill="currentColor"/></svg> FINAL BOSS</span>' : '') +
        '<span class="level-num">' + (done ? '✓' : lv.id) + '</span>' +
        '<span class="level-info"><b>' + lv.name + '</b><small><b class="lbl">Skills:</b> ' + lv.short + '</small>' +
        '<span class="level-meta"><span class="diff">' + pips + ' ' + lv.diffLabel + '</span><span>' + lv.setting + '</span><span>Limit ' + lv.speedLimit + ' mph</span>' +
        (locked && prev ? '<span>Pass "' + prev.name + '" to unlock</span>' : '') + '</span></span>' + badge;
      btn.setAttribute('aria-label', 'Drive ' + lv.id + ': ' + lv.name + '. Difficulty: ' + lv.diffLabel + '. ' + (locked ? 'Locked.' : done ? 'Completed, best score ' + best + '.' : ''));
      btn.onclick = () => this.openBrief(lv);
      li.appendChild(btn);
      list.appendChild(li);
    });
  },

  openBrief(lv) {
    this.level = lv;
    this.$('brief').classList.toggle('is-boss', !!lv.boss);
    this.$('brief-num').textContent = 'Drive ' + lv.id + ' of ' + LEVELS.length;
    this.$('brief-name').textContent = lv.name;
    this.$('brief-meta').innerHTML = '<span class="diff">' + pipsHtml(lv.difficulty) + ' ' + lv.diffLabel + '</span><span>' + lv.setting + '</span><span>Limit ' + lv.speedLimit + ' mph</span>';
    this.$('brief-skills').innerHTML = lv.skills.map(s => '<li>' + s + '</li>').join('');
    this.$('brief-tip').textContent = lv.tip;
    this.go('brief');
  },

  startDrive(lv) {
    this.level = lv;
    this.show('drive');
    const mode = Input.mode;
    const showTouch = mode === 'touch';
    this.$('touch').hidden = !showTouch;
    this.$('drive').classList.toggle('has-touch', showTouch);
    this.$('drive').classList.toggle('lot-drive', lv.type === 'lot');
    Game.bottomInset = showTouch ? 165 : 0;
    this.$('hud-level').textContent = lv.id + '. ' + lv.name;
    this.$('hud-limit').textContent = lv.speedLimit;
    this.$('pause').hidden = true;
    this.setView((Progress.data.settings && Progress.data.settings.view) || 'top');
    Input.reset();
    Game.start(lv, r => this.showResults(r));
    this.renderKeys();
    this.showIntro(lv);
  },

  // Before each drive: a card with the goal and the controls. The car waits until you press Start.
  showIntro(lv) {
    Game.paused = true;
    this.$('intro-num').textContent = 'Drive ' + lv.id + ' of ' + LEVELS.length;
    this.$('intro-name').textContent = lv.name;
    this.$('intro-pic').innerHTML = lv.type === 'lot' ? LOT_DIAGRAM : '';
    this.$('intro-steps').innerHTML = lv.steps.map(s => '<li>' + s + '</li>').join('');
    this.$('intro-ctrl-title').textContent = 'Controls (' + CONTROL_ROWS[Input.mode].name + ')';
    this.$('intro-keys').innerHTML = keysHtml(Input.mode, false);
    this.$('intro-card').classList.toggle('is-boss', !!lv.boss);
    this.$('intro').hidden = false;
    this.$('intro-go').focus();
  },

  beginDrive() {
    this.$('intro').hidden = true;
    Input.reset();
    Game.paused = false;
    Game.last = performance.now();
  },

  renderKeys() {
    const mode = Input.mode, onScreen = mode === 'keyboard';
    const hidden = Progress.data.settings && Progress.data.settings.keysHidden;
    this.$('btn-keys').hidden = !onScreen;
    this.$('keys').hidden = !onScreen || hidden;
    this.$('keys').innerHTML = keysHtml(mode, true);
    const x = this.$('keys-hide');
    if (x) x.onclick = () => this.toggleKeys();
    Game.keyEls = null;
  },

  toggleKeys() {
    if (!this.$('btn-keys').hidden) {
      const hide = !this.$('keys').hidden;
      Progress.saveSettings({ keysHidden: hide });
      this.$('keys').hidden = hide;
    }
  },

  setView(view) {
    Game.view = view;
    this.$('drive').classList.toggle('driver-view', view === 'driver');
    this.$('btn-view').textContent = view === 'driver' ? 'Map view' : 'Driver view';
  },

  toggleView() {
    const view = Game.view === 'driver' ? 'top' : 'driver';
    this.setView(view);
    Progress.saveSettings({ view });
  },

  pause() {
    if (Game.done || this.current !== 'drive') return;
    Game.paused = true;
    this.$('pause-steps').innerHTML = this.level.steps.map(s => '<li>' + s + '</li>').join('');
    this.showPauseControls(false);
    this.$('pause').hidden = false;
    this.pauseBreather.start(0);
    this.$('pause-resume').focus();
  },

  showPauseControls(open) {
    const info = CONTROL_ROWS[Input.mode];
    this.$('pause-help-title').textContent = 'Your controls (' + info.name + ')';
    this.$('pause-controls').innerHTML = info.rows.map(([k, v]) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>').join('');
    this.$('pause-help').hidden = !open;
    const btn = this.$('pause-controls-btn');
    btn.textContent = open ? 'Hide controls' : 'Show controls';
    btn.setAttribute('aria-expanded', String(open));
  },

  resume() {
    this.pauseBreather.stop();
    this.$('pause').hidden = true;
    Game.paused = false;
    Input.reset();
  },

  showResults(r) {
    this.result = r;
    this.saved = false;
    const lv = this.level;
    this.$('res-level').textContent = 'Drive ' + lv.id + ' · ' + lv.name;
    const pass = r.score >= PASS_SCORE;
    const wasPassed = Progress.passed(lv.id);
    this.$('res-title').textContent = !pass ? 'So close! Let\'s try that one again.'
      : r.score >= 85 ? 'Smooth, calm drive!' : 'Drive complete. Nice work!';
    const next = LEVELS.find(l => l.id === lv.id + 1);
    // Would this pass finish every drive? (the session is saved when you leave this screen)
    const allAfter = pass && LEVELS.every(l => l.id === lv.id || Progress.passed(l.id));
    const note = this.$('res-note');
    note.hidden = false;
    if (!pass) {
      note.className = 'result-note fail';
      note.textContent = 'You need a score of ' + PASS_SCORE + ' or higher to complete this drive' + (next ? ' and unlock the next one' : '') +
        '. Check the tips below, take a breath, and drive it again. You\'ve got this!';
    } else if (allAfter && !Progress.allPassed()) {
      note.className = 'result-note cert';
      note.textContent = 'You finished every drive! Your Wheel Be Fine certificate is ready.';
    } else if (next && !wasPassed) {
      note.className = 'result-note pass';
      note.textContent = 'Drive complete! "' + next.name + '" is now unlocked.';
    } else {
      note.className = 'result-note pass';
      note.textContent = 'Drive complete!' + (wasPassed ? ' Practicing again builds the habit.' : '');
    }
    this.$('res-cert').hidden = !allAfter;
    this.$('res-next-level').hidden = !next || !pass || allAfter;
    this.$('res-retry').classList.toggle('primary', !pass);
    if (pass) setTimeout(() => confetti(allAfter ? 260 : 150), 250);
    this.$('res-score').textContent = r.score;
    this.$('res-ring').style.setProperty('--score', r.score);
    const fb = buildFeedback(lv, r.stats);
    this.$('res-good').innerHTML = fb.good.map(s => '<li>' + s + '</li>').join('');
    this.$('res-next').innerHTML = fb.next.map(s => '<li>' + s + '</li>').join('');
    this.$('checkout-range').value = this.before;
    this.updateCheckout();
    this.show('results');
  },

  updateCheckout() {
    const v = +this.$('checkout-range').value;
    this.$('checkout-value').textContent = v;
    const d = this.before - v;
    this.$('checkout-compare').textContent =
      d > 0 ? 'That\'s ' + d + (d === 1 ? ' point' : ' points') + ' calmer than before this drive (' + this.before + ').'
      : d < 0 ? 'Feeling more anxious after trying something new is normal. Repeating a drive often helps it feel easier.'
      : 'Same as before this drive (' + this.before + ').';
  },

  saveSession() {
    if (this.saved || !this.result) return;
    this.saved = true;
    const after = +this.$('checkout-range').value;
    Progress.addSession({
      date: new Date().toISOString(),
      level: this.level.id,
      score: this.result.score,
      before: this.before,
      after,
      completed: this.result.completed,
    });
    this.before = after;
  },

  // Pop-up asking the user to confirm an action
  confirmBox({ title, body, ok, onOk }) {
    this.$('modal-title').textContent = title;
    this.$('modal-body').innerHTML = body;
    const btn = this.$('modal-ok');
    btn.textContent = ok;
    btn.onclick = () => { this.closeModal(); onOk(); };
    this.$('modal').hidden = false;
    this.$('modal-cancel').focus();
  },

  closeModal() { this.$('modal').hidden = true; },

  toast(text) {
    const el = this.$('chart-empty');
    el.textContent = text;
    setTimeout(() => { if (el.textContent === text) this.renderProgress(); }, 2500);
  },

  // The certificate can be opened anytime. Until every drive is passed it shows as a preview.
  openCertificate() {
    const s = Progress.data.settings || {};
    const earned = Progress.allPassed();
    const doneCount = LEVELS.filter(l => Progress.passed(l.id)).length;
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const total = words[LEVELS.length] || LEVELS.length;
    this.$('cert-name').value = s.certName || '';
    if (earned && !s.certDate) Progress.saveSettings({ certDate: new Date().toISOString() });
    const date = earned ? new Date(Progress.data.settings.certDate) : new Date();
    this.$('cert-date').textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    this.$('cert-scores').innerHTML = LEVELS.map(l => Progress.passed(l.id)
      ? '<span>' + l.name + ': <b>' + Progress.data.best[l.id] + '</b></span>'
      : '<span class="todo">' + l.name + ': not yet</span>').join('');
    this.$('cert-body').textContent = 'completed all ' + total + ' Wheel Be Fine practice drives.';
    this.$('cert').classList.toggle('preview', !earned);
    this.$('cert-seal').innerHTML = earned ? 'ALL ' + LEVELS.length + '<br>DRIVES<br>DONE' : doneCount + ' OF ' + LEVELS.length + '<br>DRIVES<br>DONE';
    this.$('cert-eyebrow').textContent = earned ? 'You did it!' : 'Certificate preview';
    this.$('cert-head').textContent = earned ? 'Congratulations!' : 'Your certificate';
    this.$('cert-lead').textContent = earned
      ? 'You finished every drive with patience, care, and calm. Type your name on your certificate, then print it or save it as a PDF.'
      : 'You\'ve finished ' + doneCount + ' of ' + LEVELS.length + ' drives. Pass all ' + total + ' to complete your certificate. Keep going, you\'ve got this!';
    this.$('cert-confetti').hidden = !earned;
    this.go('certificate');
    if (earned) setTimeout(() => confetti(280), 200);
  },

  renderProgress() {
    this.$('btn-cert').textContent = Progress.allPassed() ? 'View my certificate' : 'Preview my certificate';
    const s = Progress.data.sessions;
    this.$('stat-drives').textContent = s.length;
    if (s.length) {
      const avg = s.reduce((a, x) => a + x.score, 0) / s.length;
      const change = s.reduce((a, x) => a + (x.after - x.before), 0) / s.length;
      this.$('stat-score').textContent = Math.round(avg);
      this.$('stat-change').textContent = (change > 0 ? '+' : '') + change.toFixed(1);
    } else {
      this.$('stat-score').textContent = '–';
      this.$('stat-change').textContent = '–';
    }
    this.$('history').innerHTML = s.slice(-10).reverse().map(x => {
      const lv = LEVELS.find(l => l.id === x.level) || {};
      const date = new Date(x.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return '<li><div><span class="r-name">' + (lv.name || '') + '</span><span class="r-date">' + date + '</span></div>' +
        '<div class="r-skills"><b>Skills:</b> ' + (lv.short || '') + '</div>' +
        '<div class="r-stats"><span class="r-score' + (x.score < PASS_SCORE ? ' low' : '') + '">' + x.score + '</span><br>Felt ' + x.before + ' → ' + x.after + '</div></li>';
    }).join('') || '<li class="muted">No drives yet.</li>';
    this.drawChart(s.slice(-12));
  },

  drawChart(data) {
    const cv = this.$('chart');
    this.$('chart-empty').textContent = data.length ? '' : 'Finish a drive to see your first bars here.';
    const names = data.map(d => (LEVELS.find(l => l.id === d.level) || {}).chartName || 'Drive ' + d.level);
    const ctx = cv.getContext('2d');
    ctx.font = '12px "Hanken Grotesk", system-ui, sans-serif';
    const padL = 82, padT = 10;
    const width0 = cv.getBoundingClientRect().width;
    const slot0 = data.length ? (width0 - padL) / data.length : 100;
    const widest = Math.max(0, ...names.map(n => ctx.measureText(n).width));
    const slanted = widest + 8 > slot0;               // labels too wide: slant them
    cv.style.height = (slanted ? 230 + Math.min(60, widest * 0.6) : 250) + 'px';
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height, padB = slanted ? 16 + widest * 0.6 : 32;
    const y = v => padT + (1 - v / 10) * (H - padT - padB);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px "Hanken Grotesk", system-ui, sans-serif';
    ctx.strokeStyle = '#D2DDB0';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [[10, '10 · Anxious'], [5, '5'], [1, '1 · Calm']].forEach(([v, label]) => {
      ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(W, y(v)); ctx.stroke();
      ctx.fillStyle = v === 5 ? '#6A7058' : '#2E3A24';
      ctx.fillText(label, padL - 8, y(v));
    });
    if (!data.length) return;
    const slot = (W - padL) / data.length;
    const bw = Math.min(20, slot * 0.32);
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      ctx.fillStyle = '#A44A3F';
      ctx.fillRect(cx - bw - 1, y(d.before), bw, y(0) - y(d.before));
      ctx.fillStyle = '#5A7431';
      ctx.fillRect(cx + 1, y(d.after), bw, y(0) - y(d.after));
      ctx.fillStyle = '#2E3A24';
      ctx.save();
      ctx.translate(cx, y(0) + 8);
      if (slanted) { ctx.rotate(-Math.PI / 5); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(names[i], 4, 0); }
      else { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(names[i], 0, 0); }
      ctx.restore();
    });
  },
};

App.init();
