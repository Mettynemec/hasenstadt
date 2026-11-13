// Мозги тренажёра: расписание повторов, сборка пачки, синхронность пары.
// Модуль чистый: ничего не пишет и ничего не рисует, только считает.

import { localDay } from "./db.js";

export const LOCKS = ["see", "write", "hear"];
const GAP = 7;          // не меньше семи карточек между показами одного слова
const MAX_SHOWS = 3;    // одно слово не больше трёх раз за пачку
const FIRST_NEW = 3;    // первое новое слово не раньше четвёртой карточки

// ── даты ───────────────────────────────────────────

export function addDays(day, n) {
  const [y, m, d] = String(day).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDay(dt);
}

// Жёсткая таблица, без коэффициентов и без математики.
export function nextDue(grade, today) {
  if (grade === 1) return today;
  if (grade === 2) return addDays(today, 1);
  if (grade === 3) return addDays(today, 3);
  if (grade === 4) return addDays(today, 8);
  return null;                     // золото не возвращается само
}

// ── состояние слова ────────────────────────────────

export const isGold = (p) => !!p && p.grade === 5;

export function stateOf(p) {
  if (!p) return "new";
  if (p.hard) return "hard";
  if (p.grade === 5) return "gold";
  if (p.grade === 4) return "silver";
  if (p.grade === 3) return "bronze";
  return "plain";
}

export const isLearned = (p) => !!p && p.grade >= 3;

// ── правила и блоки ────────────────────────────────

export function currentRule(progress, content) {
  for (const r of content.rules) {
    const row = progress.rules[r.id];
    if (!row || !row.done) return r;
  }
  return null;
}

export const ruleDone = (progress, id) => !!(progress.rules[id] && progress.rules[id].done);

// ── очки и уровни (пункт 11) ───────────────────────
// Пороги — числа Мэтта как есть. Названия — свои, кроличьи, по-доброму.

export const LEVELS = [
  { min: 0, name: "Новичок в норке" },
  { min: 100, name: "Любопытный хвостик" },
  { min: 300, name: "Шуршащие лапки" },
  { min: 700, name: "Бодрый крольчонок" },
  { min: 1000, name: "Знаток морковки" },
  { min: 1300, name: "Уверенный прыжок" },
  { min: 1700, name: "Следопыт слов" },
  { min: 2000, name: "Хранитель норы" },
  { min: 3000, name: "Быстрые уши" },
  { min: 3700, name: "Мастер маршрутов" },
  { min: 5000, name: "Вожак стаи" },
  { min: 7000, name: "Мудрый кролик" },
  { min: 8000, name: "Легенда Хазенштадта" },
  { min: 10000, name: "Старейшина нор" }
];

export function levelOf(points) {
  let cur = LEVELS[0], i = 0;
  for (; i < LEVELS.length; i++) { if (points >= LEVELS[i].min) cur = LEVELS[i]; else break; }
  const next = LEVELS[i] || null;
  return { name: cur.name, min: cur.min, next, index: i - 1 >= 0 ? i - 1 : 0 };
}

// Очки одного человека: всего и за последние семь дней (с сегодня).
// todayRow — живое, из своего store.progress.today (у партнёра это то же
// самое, что уже лежит в dayLogAll, так что расхождения не будет).
export function pointsFor(dayLogAll, userId, todayRow, today) {
  let total = 0, week = 0;
  const since = addDays(today, -6);
  const hasToday = !!(todayRow && todayRow.day === today);
  for (const r of dayLogAll || []) {
    if (r.user_id !== userId) continue;
    if (hasToday && r.day === today) continue; // сегодня возьмём из todayRow
    total += Number(r.points || 0);
    if (r.day >= since) week += Number(r.points || 0);
  }
  if (hasToday) {
    total += Number(todayRow.points || 0);
    week += Number(todayRow.points || 0);
  }
  return { total, week };
}

// ── золотые слова по датам: для графика и прогноза (пункт 18) ──

export function goldDates(side) {
  const out = [];
  for (const p of Object.values(side.byWordId)) {
    if (p.grade === 5 && p.gold_at) out.push(String(p.gold_at).slice(0, 10));
  }
  return out.sort();
}

// Темп — по последним четырнадцати дням (с сегодня включительно).
export function goldForecast(side, totalWords, today) {
  const dates = goldDates(side);
  const left = Math.max(0, totalWords - dates.length);
  if (left === 0) return { left: 0, enough: true, etaDays: 0, etaDate: today };
  const since = addDays(today, -13);
  const recent = dates.filter((d) => d >= since).length;
  const perDay = recent / 14;
  if (perDay <= 0) return { left, enough: false, etaDays: null, etaDate: null };
  const etaDays = Math.ceil(left / perDay);
  return { left, enough: true, etaDays, etaDate: addDays(today, etaDays) };
}

// Состояние каждого шага дорожки целиком: пройден, открыт или закрыт,
// и из-за чего именно закрыт (первый непройденный шаг перед ним).
// Экран ПРАВИЛА и дорожка на главной берут отсюда всё, что им нужно.
export function pathStatus(content, mine) {
  const tbid = topicsById(content);
  const out = [];
  let blockReason = null;
  for (const step of content.path || []) {
    let kind, item, complete, title;
    if (step.type === "rule") {
      item = content.rulesById[step.id];
      if (!item) continue;
      kind = "rule";
      complete = ruleDone(mine, step.id);
      title = item.title;
    } else {
      item = tbid[step.topic];
      if (!item) continue;
      kind = "words";
      complete = isTopicClosed(item.id, mine, content);
      title = item.title_ru;
    }
    const state = complete ? "done" : (!blockReason ? "open" : "locked");
    out.push({ step, kind, item, state, reason: state === "locked" ? blockReason : null });
    if (!complete && !blockReason) blockReason = { kind, title };
  }
  return out;
}

// Какой блок слов идёт в дорожке сразу после этого правила — просто для
// подсказки-ссылки на главной, не для гейта.
export function nextAfterRule(content, ruleId) {
  const path = content.path || [];
  const i = path.findIndex((s) => s.type === "rule" && s.id === ruleId);
  if (i === -1) return null;
  const nxt = path[i + 1];
  if (!nxt || nxt.type !== "words") return null;
  return content.topics.find((t) => t.id === nxt.topic) || null;
}

// Блок закрыт, если у человека открыты все его слова и ни одно не сидит
// на единице или двойке. Слова в «Сложных» не в счёт: они временно не мешают.
// Смотрим только на своё — у каждого своя позиция на пути.
export function isTopicClosed(topicId, mine, content) {
  const words = content.byTopic[topicId] || [];
  if (!words.length) return false;
  for (const w of words) {
    const p = mine.byWordId[w.id];
    if (p && p.hard) continue;
    if (!p) return false;
    if (p.grade === 1 || p.grade === 2) return false;
  }
  return true;
}

// Сколько единиц и двоек осталось в блоке (без «Сложных»).
export function topicLeft(topicId, side, content) {
  const words = content.byTopic[topicId] || [];
  let n = 0;
  for (const w of words) {
    const p = side.byWordId[w.id];
    if (p && p.hard) continue;
    if (!p || p.grade === 1 || p.grade === 2) n++;
  }
  return n;
}

function topicsById(content) {
  const out = {};
  for (const t of content.topics) out[t.id] = t;
  return out;
}

// Блок, из которого сейчас идут новые слова, плюс честная причина, если не идут.
// Идём строго по дорожке (path.json): шаг за шагом, без оглядки на партнёра —
// у каждого своя позиция на пути.
export function topicForNew(content, mine) {
  const tbid = topicsById(content);
  for (const step of content.path || []) {
    if (step.type === "rule") {
      if (!ruleDone(mine, step.id)) {
        return { topic: null, left: 0, waitingTopic: null, waitingRule: content.rulesById[step.id] };
      }
      continue;
    }
    const t = tbid[step.topic];
    if (!t) continue;
    const words = content.byTopic[t.id] || [];
    if (!words.length) continue;
    const unopened = words.filter((w) => !mine.byWordId[w.id]);
    if (unopened.length) return { topic: t, left: unopened.length, waitingTopic: null };
    if (!isTopicClosed(t.id, mine, content)) {
      return { topic: t, left: 0, waitingTopic: t };
    }
  }
  return { topic: null, left: 0, waitingTopic: null };
}

// Блок для экрана СЛОВА и для строки на главной: первый по дорожке блок,
// в котором ещё остались единицы, двойки или совсем не открытые слова.
export function currentTopic(content, mine) {
  const tbid = topicsById(content);
  let last = null;
  for (const step of content.path || []) {
    if (step.type !== "words") continue;
    const t = tbid[step.topic];
    if (!t) continue;
    last = t;
    const words = content.byTopic[t.id] || [];
    for (const w of words) {
      const p = mine.byWordId[w.id];
      if (p && p.hard) continue;
      if (!p || p.grade === 1 || p.grade === 2) return t;
    }
  }
  return last;
}

// ── сколько новых слов можно сегодня ───────────────

// Новых слов больше не выдают порциями каждый день сами по себе: их просит
// человек кнопкой («Новых слов за заход»), и ждать партнёра для этого не надо —
// у каждого свой темп. Функция просто говорит, сколько можно выдать по кнопке
// прямо сейчас и почему, если нельзя.
export function newWordsAllowed(content, mine, settings, today) {
  const N = Number(settings.new_per_day) || 8;

  const pick = topicForNew(content, mine);
  if (pick.waitingRule) return { n: 0, why: "rule", rule: pick.waitingRule, topic: null };
  if (!pick.topic) return { n: 0, why: "done", topic: null };
  if (pick.waitingTopic) return { n: 0, why: "topic", topic: pick.waitingTopic };

  const doneToday = Number((mine.today && mine.today.new_n) || 0);
  const n = Math.max(0, Math.min(N - doneToday, pick.left));
  const why = n === 0 ? (N - doneToday <= 0 ? "quota" : "done") : "ok";
  return { n, why, topic: pick.topic };
}

// Бонусный блок берётся отдельно и на основной счёт не влияет.
export function bonusNewWords(content, mine, settings, today) {
  const taken = new Set(asArray(settings.bonus_topics));
  if (!taken.size) return [];
  const out = [];
  const N = Number(settings.new_per_day) || 8;
  let todayCount = 0;
  for (const p of Object.values(mine.byWordId)) {
    if (p.first_seen && String(p.first_seen).slice(0, 10) === today) {
      const w = content.wordsById[p.word_id];
      if (w && taken.has(w.topic)) todayCount++;
    }
  }
  let room = Math.max(0, N - todayCount);
  for (const t of content.topics) {
    if (!t.bonus || !taken.has(t.id)) continue;
    for (const w of content.byTopic[t.id] || []) {
      if (room <= 0) return out;
      if (!mine.byWordId[w.id]) { out.push(w); room--; }
    }
  }
  return out;
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (!x) return [];
  try { return JSON.parse(x); } catch (e) { return []; }
}

// ── выбор замка ────────────────────────────────────

export function pickLock(word, prog, today, hasGerman, noListen) {
  const p = prog || {};
  const usable = (hasGerman === false || noListen) ? ["see", "write"] : LOCKS;

  let cands = usable.filter((l) => !p["lock_" + l]);
  cands = cands.filter((l) => p["lock_" + l + "_day"] !== today);
  if (cands.length > 1 && p.last_lock && cands.includes(p.last_lock)) {
    cands = cands.filter((l) => l !== p.last_lock);
  }
  if (cands.length) return { lock: cands[0], canOpen: true };

  const withError = usable.find((l) => p["err_" + l]);
  if (withError) return { lock: withError, canOpen: false };

  const i = usable.indexOf(p.last_lock);
  return { lock: usable[(i + 1 + usable.length) % usable.length], canOpen: false };
}

// ── какой тип упражнения ───────────────────────────

export function pickExercise(word, prog, lock, hasGerman) {
  const shows = Number((prog && prog.shows) || 0);
  if (shows === 0) return 1;
  if (shows === 1) return 2;
  if (lock === "see") return 1;
  if (lock === "write") return 3;
  if (lock === "hear") return hasGerman === false ? 3 : 4;
  return 3;
}

// ── подсказка над оценками ─────────────────────────

export function suggestGrade(prog, hasGerman) {
  const p = prog || {};
  const need = hasGerman === false ? ["see", "write"] : LOCKS;
  if (need.some((l) => p["err_" + l])) return "";
  const open = need.filter((l) => p["lock_" + l]).length;
  if (open === need.length) return "gold";
  if (open === need.length - 1 && p.grade === 3) return "silver";
  return "";
}

export function goldReady(prog, hasGerman) {
  const p = prog || {};
  const need = hasGerman === false ? ["see", "write"] : LOCKS;
  return need.every((l) => p["lock_" + l]) && !need.some((l) => p["err_" + l]);
}

export function missingLock(prog, hasGerman) {
  const p = prog || {};
  const need = hasGerman === false ? ["see", "write"] : LOCKS;
  return need.find((l) => !p["lock_" + l]) || null;
}

// ── долг ───────────────────────────────────────────

export function debtList(content, mine, today) {
  const out = [];
  for (const [id, p] of Object.entries(mine.byWordId)) {
    const w = content.wordsById[id];
    if (!w) continue;
    if (isGold(p) || p.hard) continue;
    const graded = p.grade >= 1 && p.grade <= 4;
    const halfDone = (p.grade === null || p.grade === undefined) && Number(p.shows || 0) > 0;
    if (!graded && !halfDone) continue;
    if (halfDone) { out.push({ w, p, order: 0, due: today }); continue; }
    if (!p.next_due || p.next_due <= today) {
      out.push({ w, p, order: p.grade, due: p.next_due || today });
    }
  }
  out.sort((a, b) => (a.order - b.order) || String(a.due).localeCompare(String(b.due)));
  return out;
}

function earlyRepeats(content, mine, today, limit) {
  const out = [];
  for (const [id, p] of Object.entries(mine.byWordId)) {
    const w = content.wordsById[id];
    if (!w || isGold(p) || p.hard) continue;
    if (p.grade !== 3 && p.grade !== 4) continue;
    if (p.next_due && p.next_due <= today) continue;
    out.push({ w, p, due: p.next_due || "9999-99-99" });
  }
  out.sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return out.slice(0, Math.max(0, limit));
}

// «Учить новые слова»: порция («Новых слов за заход») из конкретного блока,
// только по нажатию кнопки, и никогда сама по себе.
export function newWordsSession(content, mine, settings, today, topicId, hasGerman, noListen) {
  const N = Number(settings.new_per_day) || 8;
  const words = content.byTopic[topicId] || [];
  const unopened = words.filter((w) => !mine.byWordId[w.id]).slice(0, N);
  const queue = unopened.map((w) => card(w, null, today, hasGerman, true, noListen));
  queue.forEach((c, i) => { c.index = i + 1; });
  return {
    queue, total: queue.length, mode: "newWords", cleanup: false,
    allow: { n: queue.length, why: "ok" }, newPlanned: queue.length, topicId
  };
}

// «Повторить выученное»: кнопка всегда работает и никогда не говорит
// «заданий нет». Берёт всё, что не ниже «Изученного» (без «Сложных»),
// сначала просроченное, потом самое слабое и давно не виденное.
export function reviewSession(content, mine, settings, today, includeGold, hasGerman, noListen) {
  const S = Number(settings.session_size) || 30;
  const picked = [];
  for (const [id, p] of Object.entries(mine.byWordId)) {
    const w = content.wordsById[id];
    if (!w || p.hard) continue;
    const st = stateOf(p);
    if (st === "new" || st === "hard") continue;
    if (st === "gold" && !includeGold) continue;
    const overdue = p.next_due && p.next_due <= today ? 0 : 1;
    picked.push({ w, p, overdue, grade: Number(p.grade) || 0, lastSeen: p.last_seen || "" });
  }
  picked.sort((a, b) =>
    (a.overdue - b.overdue) ||
    (a.grade - b.grade) ||
    String(a.lastSeen).localeCompare(String(b.lastSeen))
  );
  const queue = picked.slice(0, S).map((x) => card(x.w, x.p, today, hasGerman, false, noListen));
  queue.forEach((c, i) => { c.index = i + 1; });
  return {
    queue, total: queue.length, mode: "reviewAll", cleanup: false,
    allow: { n: 0, why: "repeat" }, newPlanned: 0
  };
}

// ── сборка пачки ───────────────────────────────────

export function buildSession(content, mine, theirs, settings, today, opts) {
  const o = opts || {};
  const S = Number(settings.session_size) || 30;
  const Tdebt = Number(settings.debt_limit) || 80;
  const hasGerman = o.hasGerman !== false;
  const noListen = !!o.noListen;

  const debt = debtList(content, mine, today);

  let newCount = 0;
  let allow = { n: 0, why: "repeat" };
  let cleanup = false;

  if (o.mode === "repeat") {
    newCount = 0;
    allow = { n: 0, why: "repeat" };
  } else if (debt.length > Tdebt) {
    cleanup = true;
    allow = { n: 0, why: "debt" };
  } else {
    allow = newWordsAllowed(content, mine, settings, today);
    newCount = allow.n;
  }

  // новые слова: основная последовательность плюс взятый бонусный блок
  const newWords = [];
  if (newCount > 0 && allow.topic) {
    for (const w of content.byTopic[allow.topic.id] || []) {
      if (newWords.length >= newCount) break;
      if (!mine.byWordId[w.id]) newWords.push(w);
    }
  }
  const bonus = o.mode === "repeat" || cleanup ? [] : bonusNewWords(content, mine, settings, today);
  for (const w of bonus) newWords.push(w);

  const needRepeats = Math.max(0, S - newWords.length);
  const repeats = debt.slice(0, needRepeats);

  if (repeats.length < needRepeats) {
    const third = Math.floor(S / 3);
    const extra = earlyRepeats(content, mine, today, Math.min(third, needRepeats - repeats.length));
    repeats.push(...extra);
  }

  const cards = [];
  for (const r of repeats) cards.push(card(r.w, r.p, today, hasGerman, false, noListen));
  const newCards = newWords.map((w) => card(w, null, today, hasGerman, true, noListen));

  const queue = arrange(cards, newCards);
  queue.forEach((c, i) => { c.index = i + 1; });

  return {
    queue,
    total: queue.length,
    mode: o.mode || "normal",
    cleanup,
    allow,
    debt: debt.length,
    newPlanned: newWords.length,
    pairCheck: !!o.pairCheck
  };
}

export function card(word, prog, today, hasGerman, isNew, noListen) {
  const pl = isNew ? { lock: "see", canOpen: true } : pickLock(word, prog, today, hasGerman, noListen);
  const ex = pickExercise(word, prog, pl.lock, hasGerman);
  return {
    wordId: word.id,
    word,
    lock: ex === 2 ? null : pl.lock,
    canOpenLock: ex === 2 ? false : pl.canOpen,
    exercise: ex,
    meet: isNew,
    step: 1,
    state: "ask",
    result: null,
    index: 0
  };
}

// Расстановка: новые не подряд, первое новое не раньше четвёртой карточки.
// Когда повторений нет совсем, пачка состоит только из новых — так и задумано.
function arrange(repeats, news) {
  if (!repeats.length) return news;
  if (!news.length) return repeats;

  const out = [];
  const total = repeats.length + news.length;
  let ri = 0, ni = 0, lastNew = false;

  for (let i = 0; i < total; i++) {
    const haveNew = ni < news.length;
    const haveRep = ri < repeats.length;
    const quota = ((i + 1) * news.length) / total;
    const takeNew = haveNew && (!haveRep || (i >= FIRST_NEW && !lastNew && ni < quota));
    if (takeNew) { out.push(news[ni++]); lastNew = true; }
    else { out.push(repeats[ri++]); lastNew = false; }
  }
  return out;
}

// Слово с оценкой один возвращается в эту же сессию, но не раньше чем
// через семь карточек и не больше трёх раз за пачку.
// Если до конца пачки столько карточек не осталось — слово придёт завтра.
export function pushBack(session, cardObj, prog, today, hasGerman, noListen) {
  const shown = session.queue.filter((c) => c.wordId === cardObj.wordId).length;
  if (shown >= MAX_SHOWS) return false;

  const i = session.queue.indexOf(cardObj);
  const at = i + GAP;
  if (at > session.queue.length) return false;

  const again = card(cardObj.word, prog, today, hasGerman, false, noListen);
  again.again = true;
  session.queue.splice(at, 0, again);
  session.total = session.queue.length;
  session.queue.forEach((c, k) => { c.index = k + 1; });
  return true;
}

export { GAP, MAX_SHOWS };
