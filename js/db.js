// Всё общение с базой и очередь записи.
// Наружу не торчит ни одна деталь Supabase: экраны про него не знают.
//
// Гарантии:
//   - каждый ответ уходит в базу сразу;
//   - интерфейс никогда не ждёт сервер;
//   - не прошло — операция ложится в очередь и повторяется;
//   - в базу пишется итоговое состояние целиком, поэтому повтор ничего не портит.

import { store } from "./store.js";

// Библиотека лежит рядом, а не на чужом CDN: из России доступ к зарубежным
// CDN то есть, то нет, и программа не должна от этого зависеть.
const LIB = "./vendor/supabase.js";
const QKEY = "hasen.queue";
const STUCK_KEY = "hasen.stuck";
const RETRY = 3000;
const PAGE = 1000;
const MAX_TRIES = 3;

let sb = null;
let cfg = null;
let queue = [];
let stuck = [];
let timer = null;
let sending = false;
const listeners = { queue: new Set(), auth: new Set() };

// ── служебное ──────────────────────────────────────

export function on(kind, fn) {
  if (!listeners[kind]) listeners[kind] = new Set();
  listeners[kind].add(fn);
  return () => listeners[kind].delete(fn);
}

function emit(kind, data) {
  for (const fn of [...(listeners[kind] || [])]) {
    try { fn(data); } catch (e) { console.error(e); }
  }
}

export const today = () => localDay(new Date());

export function localDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

const now = () => new Date().toISOString();

// ── запуск ─────────────────────────────────────────

export async function init(config) {
  cfg = config;
  const { createClient } = await import(LIB);
  sb = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  loadQueue();
  loadStuck();
  startTimer();
  window.addEventListener("online", () => flush());
  window.addEventListener("beforeunload", (e) => {
    if (queue.length) { e.preventDefault(); e.returnValue = ""; }
  });
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") emit("auth", "out");
  });
  return sb;
}

export async function currentSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data ? data.session : null;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  try { await flush(); } catch (e) { /* уходим всё равно */ }
  await sb.auth.signOut();
}

// Спит ли проект. Нужно, чтобы вместо ошибки показать спокойный экран.
export async function looksAsleep() {
  try {
    const r = await fetch(cfg.SUPABASE_URL + "/rest/v1/", {
      headers: { apikey: cfg.SUPABASE_ANON_KEY }
    });
    return r.status === 503;
  } catch (e) {
    return false;
  }
}

// ── чтение ─────────────────────────────────────────

async function pageAll(table, columns) {
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await sb.from(table).select(columns || "*").range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function loadEverything(user, nameForEmail) {
  const myId = user.id;

  const [users, settingsRows, wp, rp, scp, dl, kvRows] = await Promise.all([
    pageAll("app_user"),
    sb.from("settings").select("*").eq("user_id", myId).maybeSingle(),
    pageAll("word_progress"),
    pageAll("rule_progress"),
    pageAll("scene_progress"),
    pageAll("day_log"), // весь журнал, не только сегодня — нужен для очков и прогноза
    sb.from("kv").select("*").eq("user_id", myId)
  ]);

  // профиль: создаём, если его ещё нет
  let me = users.find((u) => u.id === myId);
  if (!me) {
    const name = nameForEmail(user.email);
    const { data, error } = await sb.from("app_user").insert({ id: myId, name }).select().single();
    if (error) throw error;
    me = data;
  }
  const partnerRow = users.find((u) => u.id !== myId) || null;

  // настройки: создаём, если их ещё нет
  let settings = settingsRows.data;
  if (!settings) {
    const { data, error } = await sb.from("settings").insert({ user_id: myId }).select().single();
    if (error) throw error;
    settings = data;
  }

  const mine = split(wp, rp, scp, dl, myId);
  const theirs = partnerRow ? split(wp, rp, scp, dl, partnerRow.id) : emptyProgress();
  for (const r of (kvRows.data || [])) mine.kv[r.key] = r.value;

  return {
    me: { id: me.id, name: me.name, email: user.email },
    partner: partnerRow ? { id: partnerRow.id, name: partnerRow.name } : null,
    settings,
    progress: mine,
    partnerProgress: theirs,
    dayLogAll: dl // весь журнал обоих, для очков и прогноза (строк немного)
  };
}

function emptyProgress() {
  return { byWordId: {}, rules: {}, scenes: {}, today: null, kv: {} };
}

// Запас для мелких значений: счётчики игр и прочее.
export function kvGet(key, fallback) {
  const s = store.get();
  const v = s.progress && s.progress.kv ? s.progress.kv[key] : undefined;
  return v === undefined || v === null ? fallback : v;
}

export function kvSet(key, value) {
  const s = store.get();
  s.progress.kv = s.progress.kv || {};
  s.progress.kv[key] = value;
  store.set({ progress: s.progress });
  enqueue("kv:" + key, "kv", { user_id: s.me.id, key, value, updated_at: now() });
}

function split(wp, rp, scp, dl, uid) {
  const out = emptyProgress();
  for (const r of wp) if (r.user_id === uid) out.byWordId[r.word_id] = r;
  for (const r of rp) if (r.user_id === uid) out.rules[r.rule_id] = r;
  for (const r of scp) if (r.user_id === uid) out.scenes[r.scene_id] = r;
  out.today = dl.find((r) => r.user_id === uid) || { day: today(), cards: 0, right_n: 0, wrong_n: 0, new_n: 0 };
  return out;
}

// Перечитать второго: вдруг он уже занимался, а то и зашёл впервые.
export async function refreshPartner() {
  const s = store.get();
  if (!s.me) return;
  try {
    const [users, wp, rp, scp, dl] = await Promise.all([
      pageAll("app_user"),
      pageAll("word_progress"),
      pageAll("rule_progress"),
      pageAll("scene_progress"),
      pageAll("day_log")
    ]);
    const row = users.find((u) => u.id !== s.me.id) || null;
    const partner = row ? { id: row.id, name: row.name } : null;
    // s.progress.today — своё, живое, из локального состояния, его здесь не
    // трогаем (иначе можно затереть ещё не отправленные в базу очки);
    // dayLogAll нужен только для сумм по остальным дням и по второму человеку
    store.set({
      partner,
      partnerProgress: partner ? split(wp, rp, scp, dl, partner.id) : emptyProgress(),
      dayLogAll: dl
    });
  } catch (e) {
    console.warn("второй не обновился, работаем на том, что есть", e);
  }
}

// ── запись: сначала store, потом сеть ──────────────

function enqueue(key, table, row) {
  queue = queue.filter((i) => i.key !== key);
  queue.push({ key, table, row });
  saveQueue();
  report("sending");
  flush();
}

export function saveWord(wordId, patch) {
  const s = store.get();
  const row = store.patchWord(wordId, { ...patch, user_id: s.me.id, word_id: wordId, updated_at: now() });
  enqueue("word:" + wordId, "word_progress", clean(row));
  return row;
}

export function saveRule(ruleId, done) {
  const s = store.get();
  const wasDone = !!(s.progress.rules[ruleId] && s.progress.rules[ruleId].done);
  const row = {
    user_id: s.me.id, rule_id: ruleId, done: !!done,
    done_at: done ? now() : null
  };
  s.progress.rules[ruleId] = row;
  store.set({ progress: s.progress });
  enqueue("rule:" + ruleId, "rule_progress", row);
  // десять очков — один раз за правило, при первом «разобрали»
  if (done && !wasDone) bumpDay({ points: 10 });
}

export function saveScene(sceneId, patch) {
  const s = store.get();
  const cur = s.progress.scenes[sceneId] || { done_count: 0, pair_count: 0 };
  const row = { ...cur, ...patch, user_id: s.me.id, scene_id: sceneId, last_done_at: now() };
  s.progress.scenes[sceneId] = row;
  store.set({ progress: s.progress });
  enqueue("scene:" + sceneId, "scene_progress", clean(row));
}

export function saveProfileName(name) {
  const s = store.get();
  store.set({ me: { ...s.me, name } });
  enqueue("profile", "app_user", { id: s.me.id, name });
}

export function saveSettings(patch) {
  const s = store.get();
  const row = { ...s.settings, ...patch, user_id: s.me.id, updated_at: now() };
  store.set({ settings: row });
  enqueue("settings", "settings", clean(row));
}

// Журнал дня пишется целиком, а не приращением: повтор ничего не испортит.
// points тоже копится сюда же — очки не сгорают и не отнимаются, поэтому
// простое сложение ничем не грозит даже при повторной отправке.
export function bumpDay(patch) {
  const s = store.get();
  const cur = s.progress.today || { day: today(), cards: 0, right_n: 0, wrong_n: 0, new_n: 0, points: 0 };
  const row = {
    user_id: s.me.id,
    day: today(),
    cards: (cur.cards || 0) + (patch.cards || 0),
    right_n: (cur.right_n || 0) + (patch.right_n || 0),
    wrong_n: (cur.wrong_n || 0) + (patch.wrong_n || 0),
    new_n: (cur.new_n || 0) + (patch.new_n || 0),
    points: (cur.points || 0) + (patch.points || 0)
  };
  s.progress.today = row;
  store.set({ progress: s.progress });
  enqueue("day:" + row.day, "day_log", row);
  return row;
}

export function logGame(game, payload) {
  const s = store.get();
  enqueue("game:" + game + ":" + Date.now(), "game_log", {
    user_id: s.me.id, game, payload: payload || {}
  });
}

function clean(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "first_seen" && !v) continue;
    out[k] = v;
  }
  return out;
}

// ── очередь ────────────────────────────────────────

function loadQueue() {
  try {
    const raw = localStorage.getItem(QKEY);
    queue = raw ? JSON.parse(raw) : [];
  } catch (e) { queue = []; }
  report(queue.length ? "waiting" : "ok");
}

function saveQueue() {
  try { localStorage.setItem(QKEY, JSON.stringify(queue)); } catch (e) { /* буфер не обязателен */ }
}

function loadStuck() {
  try {
    const raw = localStorage.getItem(STUCK_KEY);
    stuck = raw ? JSON.parse(raw) : [];
  } catch (e) { stuck = []; }
}

function saveStuck() {
  try { localStorage.setItem(STUCK_KEY, JSON.stringify(stuck)); } catch (e) { /* не обязательно */ }
}

// Список записей, которые база стабильно отказывается принимать (расхождение
// со схемой и подобное). Их больше незачем пытаться отправить: они не мешают
// очереди, но и сами никуда не уйдут. Смотреть можно из консоли браузера.
export function stuckSize() { return stuck.length; }
export function stuckItems() { return stuck.slice(); }

// Ошибка похожа на расхождение со схемой или данными, а не на сеть: повторять
// её бессмысленно, сеть тут ни при чём. 400 — отказ в данных, 42xxx — класс
// ошибок Postgres (например, 42703: такого столбца нет), PGRST... — отказ
// PostgREST (например, PGRST204: лишнее поле).
function looksPermanent(error) {
  if (!error) return false;
  const status = Number(error.status || error.statusCode || 0);
  const code = String(error.code || "");
  if (status === 400) return true;
  if (/^42/.test(code)) return true;
  if (/^PGRST/.test(code)) return true;
  return false;
}

function report(state) {
  const q = { size: queue.length, state: queue.length ? state : "ok" };
  store.set({ queue: q });
  emit("queue", q);
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => { if (queue.length) flush(); }, RETRY);
}

export function queueSize() { return queue.length; }

export async function flush() {
  if (sending || !sb || !queue.length) return;
  sending = true;
  report("sending");
  try {
    while (queue.length) {
      const item = queue[0];
      const { error } = await sb.from(item.table).upsert(item.row);
      if (error) {
        if (isAuthError(error)) emit("auth", "stale");

        if (looksPermanent(error)) {
          item.tries = (item.tries || 0) + 1;
          if (item.tries >= MAX_TRIES) {
            // дальше пытаться бессмысленно: убираем из головы очереди,
            // чтобы не блокировать всё, что идёт следом
            queue.shift();
            stuck.push({ key: item.key, table: item.table, row: item.row, error: error.message || String(error), stuck_at: now() });
            saveQueue();
            saveStuck();
            console.warn("запись отложена насовсем (похоже на расхождение со схемой базы):", item.table, item.key, error);
            report("sending");
            continue;
          }
          saveQueue();
        }

        console.warn("запись не прошла, вернёмся к ней:", error.message || error);
        report("waiting");
        return;
      }
      queue.shift();
      saveQueue();
      report("sending");
    }
  } finally {
    sending = false;
    // если в очереди что-то осталось, плашка обязана это показать
    report(queue.length ? "waiting" : "ok");
  }
}

function isAuthError(e) {
  const s = Number(e && e.status);
  return s === 401 || s === 403;
}

// ── копия прогресса ────────────────────────────────

export async function exportAll() {
  const [users, settings, wp, rp, scp, dl] = await Promise.all([
    pageAll("app_user"),
    pageAll("settings"),
    pageAll("word_progress"),
    pageAll("rule_progress"),
    pageAll("scene_progress"),
    pageAll("day_log")
  ]);
  return {
    kind: "hasenstadt-progress",
    made_at: now(),
    users, settings,
    word_progress: wp, rule_progress: rp, scene_progress: scp, day_log: dl
  };
}

export async function importAll(obj) {
  if (!obj || obj.kind !== "hasenstadt-progress") throw new Error("не копия");
  const s = store.get();
  const myId = s.me.id;
  const partnerId = s.partner ? s.partner.id : null;

  // Своё перезаписывается полностью. Чужое — только если второй не заходил позже копии.
  let withPartner = false;
  if (partnerId) {
    const theirs = (obj.word_progress || []).filter((r) => r.user_id === partnerId);
    const newest = theirs.reduce((a, r) => Math.max(a, Date.parse(r.updated_at || 0) || 0), 0);
    const live = Object.values(s.partnerProgress.byWordId)
      .reduce((a, r) => Math.max(a, Date.parse(r.updated_at || 0) || 0), 0);
    withPartner = theirs.length > 0 && newest >= live;
  }
  const mine = (r) => r.user_id === myId || (withPartner && r.user_id === partnerId);

  for (const [table, rows] of [
    ["settings", (obj.settings || []).filter(mine)],
    ["word_progress", (obj.word_progress || []).filter(mine)],
    ["rule_progress", (obj.rule_progress || []).filter(mine)],
    ["scene_progress", (obj.scene_progress || []).filter(mine)],
    ["day_log", (obj.day_log || []).filter(mine)]
  ]) {
    for (let i = 0; i < rows.length; i += 300) {
      const part = rows.slice(i, i + 300);
      if (!part.length) continue;
      const { error } = await sb.from(table).upsert(part);
      if (error) throw error;
    }
  }
  return { partnerToo: withPartner };
}

// ── комнаты парных игр ─────────────────────────────

function roomId() {
  return Math.random().toString(36).slice(2, 10);
}

export async function openSketchRoom(taskId) {
  const s = store.get();
  const id = roomId();
  const { error } = await sb.from("sketch_room").insert({ id, task_id: taskId, created_by: s.me.id });
  if (error) throw error;
  return id;
}

export async function liveSketchRoom() {
  const { data, error } = await sb.from("sketch_room")
    .select("*").is("closed_at", null).order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

export async function closeSketchRoom(id) {
  await sb.from("sketch_room").update({ closed_at: now() }).eq("id", id);
}

export async function sketchMessages(roomId) {
  const { data, error } = await sb.from("sketch_message")
    .select("*").eq("room_id", roomId).order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendSketchMessage(roomId, body, marks) {
  const s = store.get();
  const { data, error } = await sb.from("sketch_message")
    .insert({ room_id: roomId, user_id: s.me.id, body, marks: marks || {} }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSketchMessage(id) {
  const { error } = await sb.from("sketch_message").delete().eq("id", id);
  if (error) throw error;
}

export async function openDuelRoom(words) {
  const s = store.get();
  const id = roomId();
  const state = { i: 0, presses: {}, score: {}, done: false };
  const { error } = await sb.from("duel_room")
    .insert({ id, created_by: s.me.id, words, state });
  if (error) throw error;
  return id;
}

export async function liveDuelRoom() {
  const { data, error } = await sb.from("duel_room")
    .select("*").order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  const row = (data && data[0]) || null;
  if (!row) return null;
  const fresh = Date.now() - Date.parse(row.created_at) < 60 * 60 * 1000;
  return fresh && !(row.state && row.state.done) ? row : null;
}

export async function duelRoom(id) {
  const { data, error } = await sb.from("duel_room").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveDuelState(id, state) {
  const { error } = await sb.from("duel_room").update({ state, updated_at: now() }).eq("id", id);
  if (error) throw error;
}

// Зовёт ли второй в парную игру прямо сейчас.
export async function invites() {
  const s = store.get();
  const out = {};
  if (!s.partner) return out;
  try {
    const r = await liveSketchRoom();
    if (r && r.created_by !== s.me.id) out.sketch = r;
  } catch (e) { /* молча: приглашение не обязательно */ }
  try {
    const r = await liveDuelRoom();
    if (r && r.created_by !== s.me.id) out.duel = r;
  } catch (e) { /* молча */ }
  return out;
}

// Живого канала в сборке нет намеренно: он держится на вебсокете, который
// у части операторов не проходит. Парные игры работают на опросе раз в три
// секунды — это тот самый запасной путь, человек разницы не замечает.
export function watch(table, filter, fn) {
  return () => {};
}

export const POLL = RETRY;
