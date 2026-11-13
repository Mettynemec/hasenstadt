// Сценка: свободный ролевой диалог вдвоём, в общем чате, по заданию-карточке.
// Смысл и логику диалога программа проверить не может — и говорит об этом прямо.

import { el, put, clear } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as chk from "../check.js";
import * as tts from "../tts.js";
import { umlautRow, bindScreenKeys } from "../keys.js";
import { note, toast, setTitle, speakBtn } from "../ui.js";

const SEIN = { ich: "bin", du: "bist", er: "ist", sie: "ist", es: "ist", wir: "sind", ihr: "seid" };
let live = null;

export function mount(root) {
  setTitle("Сценка");
  live = { root, room: null, task: null, messages: [], unwatch: null, poll: null, offer: 3 };
  paintPick();
  return () => unmount();
}

export function unmount() {
  if (live) {
    if (live.unwatch) live.unwatch();
    clearInterval(live.poll);
  }
  tts.stop();
  live = null;
}

// ── подходящие задания ─────────────────────────────

function suitable() {
  const s = store.get();
  const c = s.content;
  if (!c) return [];
  const both = (check) => {
    if (!s.partner) return check(s.progress);
    return check(s.progress) && check(s.partnerProgress);
  };
  return (c.sketchTasks || []).filter((t) =>
    both((side) => (t.needs_words || []).every((id) => side.byWordId[id])) &&
    both((side) => (t.needs_rules || []).every((id) => side.rules[id] && side.rules[id].done))
  );
}

async function paintPick() {
  const s = store.get();
  const all = suitable();
  const box = el("div.stack");

  if (!all.length) {
    box.appendChild(note("calm", T.game.noTasks));
    box.appendChild(el("a.btn", { href: "#/game" }, T.game.toMap));
    put(live.root, box);
    return;
  }
  if (all.length < 3) box.appendChild(note("calm", T.game.fewTasks(all.length)));

  // приглашение от второго, если он уже открыл комнату
  const invite = el("div");
  box.appendChild(invite);

  const list = el("div.stack-s");
  const show = (items) => {
    clear(list);
    for (const t of items) {
      const b = el("button.tile", { type: "button" },
        el("b", { text: t.title }),
        el("p.small.dim", { text: t.situation })
      );
      b.addEventListener("click", () => openRoom(t));
      list.appendChild(b);
    }
  };
  show(shuffle(all).slice(0, live.offer));

  const more = el("button.btn", { type: "button", text: T.game.moreTasks });
  more.addEventListener("click", () => show(shuffle(all).slice(0, 3)));
  const allB = el("button.btn", { type: "button", text: T.game.allTasks });
  allB.addEventListener("click", () => show(all));

  box.appendChild(list);
  box.appendChild(el("div.row", more, allB));
  box.appendChild(el("a.btn-text", { href: "#/game" }, T.game.exit));
  put(live.root, box);

  if (s.partner) {
    try {
      const room = await db.liveSketchRoom();
      if (room && room.created_by !== s.me.id) {
        const task = (store.get().content.sketchTasks || []).find((t) => t.id === room.task_id);
        const join = el("button.btn.btn-main", {
          type: "button", text: T.game.waitsSketch(s.partner.name, task ? task.title : room.task_id)
        });
        join.addEventListener("click", () => enterRoom(room.id, task));
        put(invite, join);
      }
    } catch (e) { /* молча */ }
  }
}

async function openRoom(task) {
  try {
    const id = await db.openSketchRoom(task.id);
    enterRoom(id, task);
  } catch (e) {
    console.error(e);
    put(live.root, el("div.stack", note("soft", T.err.noDb),
      el("button.btn", { type: "button", text: T.err.retry, on: { click: () => paintPick() } })));
  }
}

function enterRoom(id, task) {
  live.room = id;
  live.task = task;
  live.messages = [];
  if (live.unwatch) live.unwatch();
  live.unwatch = db.watch("sketch_message", "room_id=eq." + id, () => pull());
  live.poll = setInterval(pull, db.POLL);
  paintRoom();
  pull();
}

async function pull() {
  if (!live || !live.room) return;
  try {
    const msgs = await db.sketchMessages(live.room);
    live.messages = msgs;
    paintChat();
  } catch (e) { /* подождём следующего опроса */ }
}

// ── комната ────────────────────────────────────────

function paintRoom() {
  const s = store.get();
  const t = live.task || { title: "", situation: "", roles: [], must: [] };

  const chat = el("div.chat", { id: "chat" });
  const field = el("textarea.field", { rows: 2, "aria-label": "сообщение", spellcheck: false });
  field.setAttribute("autocapitalize", "off");
  const row = umlautRow(field);
  const send = el("button.btn.btn-main", { type: "button", text: "отправить" });
  const mustBox = el("div.stack-s");
  const counter = el("p.small.dim");

  const copy = el("button.btn", { type: "button", text: T.game.copy });
  copy.addEventListener("click", doCopy);
  const stop = el("button.btn", { type: "button", text: T.game.endSketch });
  stop.addEventListener("click", finish);

  put(live.root, el("div.stack",
    el("div.card.card-accent.stack-s",
      el("p.h-block", { text: t.title }),
      el("p", { text: T.game.situation + ". " + t.situation }),
      t.roles && t.roles.length ? el("div.stack-s",
        el("p.small.dim", { text: T.game.roles }),
        t.roles.map((r) => el("p", { text: "— " + r }))
      ) : null,
      el("p.small.dim", { text: T.game.mustList }),
      mustBox,
      counter
    ),
    chat,
    field, row,
    el("div.row", send, copy, stop),
    el("p.small.dim.prose", { text: T.game.limit }),
    el("a.btn-text", { href: "#/game" }, T.game.exit)
  ));

  live.refs = { chat, field, mustBox, counter };
  field.focus();

  function doSend() {
    const body = field.value.trim();
    if (!body) return;
    field.value = "";
    const marks = analyze(body);
    db.sendSketchMessage(live.room, body, marks)
      .then(() => pull())
      .catch((e) => { console.warn(e); toast(T.err.noNet); });
  }
  send.addEventListener("click", doSend);
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  bindScreenKeys({ Escape: () => { location.hash = "#/game"; } });
  paintChat();
}

function paintChat() {
  if (!live || !live.refs) return;
  const s = store.get();
  const { chat, mustBox, counter } = live.refs;

  clear(chat);
  for (const m of live.messages) {
    const mine = m.user_id === s.me.id;
    const who = mine ? s.me.name : (s.partner ? s.partner.name : "");
    const box = el("div.msg", { data: { mine: String(mine) } },
      el("span.who", { text: who }),
      el("span", { text: m.body })
    );
    const marks = m.marks || {};
    if (marks.unknown && marks.unknown.length) {
      box.appendChild(el("span.marks.unknown", { text: T.game.noWords + marks.unknown.join(", ") }));
    }
    for (const h of marks.hints || []) box.appendChild(el("span.marks", { text: h }));

    if (mine && Date.now() - Date.parse(m.created_at) < 60000) {
      const del = el("button.btn-text", { type: "button", text: "удалить" });
      del.addEventListener("click", async () => {
        try { await db.deleteSketchMessage(m.id); pull(); } catch (e) { toast(T.err.noNet); }
      });
      box.appendChild(del);
    }
    box.appendChild(speakBtn(m.body));
    chat.appendChild(box);
  }
  chat.scrollTop = chat.scrollHeight;

  // обязательный набор
  const t = live.task || { must: [] };
  const text = chk.normalizeDe(live.messages.map((m) => m.body).join(" "));
  let used = 0;
  clear(mustBox);
  for (const item of t.must || []) {
    const form = formOf(item);
    const hit = text.includes(chk.normalizeDe(form));
    if (hit) used++;
    mustBox.appendChild(el("p.small", { text: (hit ? "✓ " : "· ") + form }));
  }
  counter.textContent = T.game.used(used, (t.must || []).length);
}

function formOf(item) {
  const c = store.get().content;
  const w = c.wordsById[item];
  if (!w) return item;
  return w.pos === "noun" && w.article ? w.article + " " + w.de : w.de;
}

// ── разбор сообщения ───────────────────────────────

let knownSet = null;

function known() {
  if (knownSet) return knownSet;
  const c = store.get().content;
  const set = new Set(["der", "die", "das", "ein", "eine", "einen", "nicht", "und", "ja", "nein", "bitte", "danke"]);
  const add = (s) => {
    for (const tok of chk.normalizeDe(String(s)).split(" ")) if (tok) set.add(tok);
  };
  for (const w of c.words || []) { add(w.de); if (w.phrase_de) add(w.phrase_de); }
  for (const x of c.compounds || []) add(x.de);
  for (const f of c.phrases || []) add(f.de);
  for (const p of c.places || []) for (const sc of p.scenes || []) for (const l of sc.lines || []) if (l.de) add(l.de);
  knownSet = set;
  return set;
}

function analyze(body) {
  const c = store.get().content;
  const set = known();
  const unknown = [];
  const hints = [];
  const tokens = String(body).split(/\s+/);

  tokens.forEach((raw, i) => {
    const t = chk.normalizeDe(raw.replace(/[.,!?;:]/g, ""));
    if (!t) return;
    if (set.has(t)) return;

    // опечатка в одну букву
    let near = null;
    for (const w of c.words || []) {
      const want = chk.normalizeDe(w.de);
      if (want.length >= 4 && t.length >= 4 && chk.distance(t, want, 1) === 1) { near = w.de; break; }
    }
    if (near) hints.push(T.game.maybeMeant(near));
    else unknown.push(raw);
  });

  // артикль у существительных
  tokens.forEach((raw, i) => {
    const t = chk.normalizeDe(raw.replace(/[.,!?;:]/g, ""));
    const w = (c.words || []).find((x) => x.pos === "noun" && x.article && chk.normalizeDe(x.de) === t);
    if (!w) return;
    const prev = i > 0 ? chk.normalizeDe(tokens[i - 1].replace(/[.,!?;:]/g, "")) : "";
    if (["der", "die", "das"].includes(prev)) {
      if (prev !== chk.normalizeDe(w.article)) hints.push(w.article + " " + w.de);
    } else if (!["ein", "eine", "einen", "mein", "meine", "dein", "deine", "kein", "keine", "den", "dem"].includes(prev)) {
      hints.push(T.game.artLost + ": " + w.article + " " + w.de);
    }
  });

  // формы sein: проверяем только то, что уже проходили
  tokens.forEach((raw, i) => {
    const t = chk.normalizeDe(raw.replace(/[.,!?;:]/g, ""));
    if (!SEIN[t]) return;
    const next = i + 1 < tokens.length ? chk.normalizeDe(tokens[i + 1].replace(/[.,!?;:]/g, "")) : "";
    const seinForms = ["bin", "bist", "ist", "sind", "seid"];
    if (seinForms.includes(next) && next !== SEIN[t]) hints.push(t + " " + SEIN[t]);
  });

  return { unknown: [...new Set(unknown)], hints: [...new Set(hints)] };
}

// ── копирование и итог ─────────────────────────────

function dialogText() {
  const s = store.get();
  const t = live.task || { title: "", situation: "", roles: [], must: [] };
  const lines = [];
  lines.push("Сценка: " + t.title);
  lines.push("Ситуация: " + t.situation);
  if (t.roles && t.roles.length) lines.push("Роли: " + t.roles.join(" / "));
  if (t.must && t.must.length) lines.push("Обязательный набор: " + t.must.map(formOf).join(", "));
  lines.push("");
  for (const m of live.messages) {
    const who = m.user_id === s.me.id ? s.me.name : (s.partner ? s.partner.name : "второй");
    lines.push(who + ": " + m.body);
  }
  return lines.join("\n");
}

async function doCopy() {
  const text = dialogText();
  try {
    await navigator.clipboard.writeText(text);
    toast(T.game.copied);
  } catch (e) {
    const ta = el("textarea", { value: text, style: { position: "fixed", left: "-999px" } });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast(T.game.copied); } catch (x) { /* ничего */ }
    ta.remove();
  }
}

function finish() {
  const s = store.get();
  const t = live.task || { must: [] };
  const text = chk.normalizeDe(live.messages.map((m) => m.body).join(" "));
  const used = (t.must || []).filter((item) => text.includes(chk.normalizeDe(formOf(item)))).length;

  clearInterval(live.poll);
  if (live.unwatch) { live.unwatch(); live.unwatch = null; }
  db.closeSketchRoom(live.room).catch(() => { /* не важно */ });
  db.logGame("sketch", { task: t.id, used, of: (t.must || []).length, messages: live.messages.length });

  const again = el("button.btn.btn-main", { type: "button", text: "ещё задание" });
  again.addEventListener("click", () => { live.room = null; paintPick(); });

  put(live.root, el("div.stack",
    el("p.h-block", { text: "Сценка закончена." }),
    el("p", { text: "Сообщений: " + live.messages.length }),
    el("p", { text: T.game.used(used, (t.must || []).length) }),
    el("div.row",
      el("button.btn", { type: "button", text: T.game.copy, on: { click: doCopy } }),
      again
    ),
    el("p.small.dim.prose", { text: T.game.limit }),
    el("a.btn-text", { href: "#/game" }, T.game.exit)
  ));
  again.focus();
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
