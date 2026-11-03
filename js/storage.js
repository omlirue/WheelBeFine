// Saves progress in the browser (localStorage) so it is still there next time.
// Every read/write is wrapped in try/catch because some browsers block storage
// (for example in private windows). The app still works, it just won't remember.

const Store = {
  key: 'calmlane.v1',

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  save(data) {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) {
      /* storage unavailable: keep going without saving */
    }
  },
};

const Progress = {
  data: null,

  fresh() {
    return { unlocked: 1, sessions: [], best: {}, settings: {} };
  },

  init() {
    const saved = Store.load();
    this.data = Object.assign(this.fresh(), saved || {});
  },

  addSession(session) {
    const d = this.data;
    d.sessions.push(session);
    // You need a passing score (see PASS_SCORE) to unlock the next drive.
    if (session.completed && session.score >= PASS_SCORE && session.level >= d.unlocked) {
      d.unlocked = Math.min(LEVELS.length, session.level + 1);
    }
    const prevBest = d.best[session.level] || 0;
    if (session.score > prevBest) d.best[session.level] = session.score;
    Store.save(d);
  },

  passed(id) {
    return (this.data.best[id] || 0) >= PASS_SCORE;
  },

  allPassed() {
    return LEVELS.every(l => this.passed(l.id));
  },

  saveSettings(settings) {
    this.data.settings = Object.assign({}, this.data.settings, settings);
    Store.save(this.data);
  },

  unlockAll() {
    this.data.unlocked = LEVELS.length;
    Store.save(this.data);
  },

  reset() {
    const settings = this.data.settings;
    this.data = this.fresh();
    this.data.settings = settings;
    Store.save(this.data);
  },
};
