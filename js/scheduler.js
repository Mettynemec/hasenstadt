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

export function isTopicClosed(topicId, mine, theirs, content, partnerExists) {
  const words = content.byTopic[topicId] || [];
  if (!words.length) return false;
  const sides = partnerExists ? [mine, theirs] : [mine];
  for (const side of sides) {
    for (const w of words) {
      const p = side.byWordId[w.id];
      if (!p) return false;
      if (p.grade === 1 || p.grade === 2) return false;
    }
  }
  return true;
}

// Сколько единиц и двоек осталось в блоке у каждого.
export function topicLeft(topicId, side, content) {
  const words = content.byTopic[topicId] || [];
  let n = 0;
  for (const w of words) {
    const p = side.byWordId[w.id];
    if (!p || p.grade === 1 || p.grade === 2) n++;
  }
  return n;
}

const mainTopics = (content) => content.topics.filter((t) => !t.bonus);

// Блок, из которого сейчас идут новые слова, плюс честная причина, если не идут.
export function topicForNew(content, mine, theirs, partnerExists) {
  for (const t of mainTopics(content)) {
    const words = content.byTopic[t.id] || [];
    if (!words.length) continue;
    const unopened = words.filter((w) => !mine.byWordId[w.id]);
    if (unopened.length) return { topic: t, left: unopened.length, waitingTopic: null };
    if (!isTopicClosed(t.id, mine, theirs, content, partnerExists)) {
      return { topic: t, left: 0, waitingTopic: t };
    }
  }
  return { topic: null, left: 0, waitingTopic: null };
}

// Блок для экрана СЛОВА и для строки на главной.
export function currentTopic(content, mine) {
  for (const t of mainTopics(content)) {
    const words = content.byTopic[t.id] || [];
    if (!words.length) continue;
    for (const w of words) {
      const p = mine.byWordId[w.id];
      if (!p || p.grade === 1 || p.grade === 2) return t;
    }
  }
  return mainTopics(content).slice(-1)[0] || null;
}

// ── сколько новых слов можно сегодня ───────────────

export function newWordsAllowed(content, mine, theirs, settings, today, partnerExists) {
  const N = Number(settings.new_per_day) || 8;

  const pick = topicForNew(content, mine, theirs, partnerExists);
  if (!pick.topic) return { n: 0, why: "done", topic: null };

  // Новые слова ждут галочки на том правиле, которое нужно этому блоку.
  // Галочки на всех правилах подряд никто не требует: иначе после первого же
  // блока занятия бы встали.
  if (pick.topic.rule_before && !ruleDone(mine, pick.topic.rule_before)) {
    return { n: 0, why: "rule", rule: content.rulesById[pick.topic.rule_before], topic: pick.topic };
  }
  if (pick.waitingTopic) return { n: 0, why: "topic", topic: pick.waitingTopic };

  const mainIds = new Set();
  for (const t of mainTopics(content)) for (const w of content.byTopic[t.id] || []) mainIds.add(w.id);

  const openedMine = countIn(mine, mainIds);
  const openedTheirs = partnerExists ? countIn(theirs, mainIds) : openedMine;

  const ceiling = Math.min(openedMine, openedTheirs) + N;
  const free = Math.max(0, ceiling - openedMine);
  const doneToday = Number((mine.today && mine.today.new_n) || 0);

  const n = Math.max(0, Math.min(free, N - doneToday, pick.left));
  let why = "ok";
  if (n === 0) {
    if (free === 0) why = "sync";
    else if (N - doneToday <= 0) why = "quota";
    else why = "done";
  }
  return { n, why, topic: pick.topic };
}

function countIn(side, ids) {
  let n = 0;
  for (const id of Object.keys(side.byWordId)) if (ids.has(id)) n++;
  return n;
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

export function pickLock(word, prog, today, hasGerman) {
  const p = prog || {};
  const usable = hasGerman === false ? ["see", "write"] : LOCKS;

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
    if (isGold(p)) continue;
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
    if (!w || isGold(p)) continue;
    if (p.grade !== 3 && p.grade !== 4) continue;
    if (p.next_due && p.next_due <= today) continue;
    out.push({ w, p, due: p.next_due || "9999-99-99" });
  }
  out.sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return out.slice(0, Math.max(0, limit));
}

// ── сборка пачки ───────────────────────────────────

export function buildSession(content, mine, theirs, settings, today, opts) {
  const o = opts || {};
  const S = Number(settings.session_size) || 30;
  const Tdebt = Number(settings.debt_limit) || 80;
  const hasGerman = o.hasGerman !== false;

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
    allow = newWordsAllowed(content, mine, theirs, settings, today, !!o.partnerExists);
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
  for (const r of repeats) cards.push(card(r.w, r.p, today, hasGerman, false));
  const newCards = newWords.map((w) => card(w, null, today, hasGerman, true));

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

function card(word, prog, today, hasGerman, isNew) {
  const pl = isNew ? { lock: "see", canOpen: true } : pickLock(word, prog, today, hasGerman);
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
export function pushBack(session, cardObj, prog, today, hasGerman) {
  const shown = session.queue.filter((c) => c.wordId === cardObj.wordId).length;
  if (shown >= MAX_SHOWS) return false;

  const i = session.queue.indexOf(cardObj);
  const at = i + GAP;
  if (at > session.queue.length) return false;

  const again = card(cardObj.word, prog, today, hasGerman, false);
  again.again = true;
  session.queue.splice(at, 0, again);
  session.total = session.queue.length;
  session.queue.forEach((c, k) => { c.index = k + 1; });
  return true;
}

export { GAP, MAX_SHOWS };
