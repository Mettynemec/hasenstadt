// Состояние в памяти и подписки. Никаких библиотек.
// Правило: экран читает store, пишет через db, а db обновляет store.

const state = {
  me: null,                 // {id, name, email}
  partner: null,            // {id, name} или null
  settings: null,
  content: null,            // {topics, words, wordsById, rules, scenes, ...}
  progress: { byWordId: {}, rules: {}, scenes: {}, today: null, kv: {} },
  partnerProgress: { byWordId: {}, rules: {}, scenes: {}, today: null, kv: {} },
  dayLogAll: [],             // весь журнал дней обоих — для очков и прогноза
  session: null,
  queue: { size: 0, state: "ok" },
  voiceOk: false
};

const subs = new Map();

export const store = {

  get() { return state; },

  set(patch) {
    const keys = Object.keys(patch);
    Object.assign(state, patch);
    for (const k of keys) fire(k);
    fire("*");
  },

  // точечное обновление прогресса одного слова, без переcборки всего
  patchWord(wordId, patch) {
    const cur = state.progress.byWordId[wordId] || {};
    state.progress.byWordId[wordId] = { ...cur, ...patch };
    fire("progress");
    fire("*");
    return state.progress.byWordId[wordId];
  },

  on(key, fn) {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(fn);
    return () => subs.get(key).delete(fn);
  }
};

function fire(key) {
  const set = subs.get(key);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(state); } catch (e) { console.error("подписчик упал:", e); }
  }
}
