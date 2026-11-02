// Дуэль артиклей. Единственное место, где в программе есть скорость:
// они играют друг с другом по своей воле.

import { el, put, clear } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as tts from "../tts.js";
import { bindScreenKeys } from "../keys.js";
import { note, speakBtn, say, sound, setTitle } from "../ui.js";

const CIRCLE = 10;
const WAIT = 8000;
let live = null;

export function mount(root) {
  setTitle("Дуэль артиклей");
  live = { root, unwatch: null, timer: null };
  paintStart();
  return () => unmount();
}

export function unmount() {
  if (live) {
    if (live.unwatch) live.unwatch();
    clearTimeout(live.timer);
  }
  tts.stop();
  live = null;
}

function nouns() {
  const s = store.get();
  const c = s.content;
  const ids = new Set([
    ...Object.keys(s.progress.byWordId),
    ...Object.keys(s.partnerProgress.byWordId)
  ]);
  return [...ids]
    .map((id) => c.wordsById[id])
    .filter((w) => w && w.pos === "noun" && w.article);
}

async function paintStart() {
  const s = store.get();
  const { root } = live;
  const pool = nouns();

  const box = el("div.stack");
  if (pool.length < 3) {
    box.appendChild(note("calm", T.game.noNouns));
    box.appendChild(el("a.btn", { href: "#/game" }, T.game.toMap));
    put(root, box);
    return;
  }

  const alone = el("button.btn.btn-main", { type: "button", text: T.game.alone });
  alone.addEventListener("click", () => startSolo(pool));
  box.appendChild(alone);

  if (s.partner) {
    const call = el("button.btn", { type: "button", text: T.game.call(s.partner.name) });
    call.addEventListener("click", async () => {
      call.disabled = true;
      try {
        const words = shuffle(pool).slice(0, CIRCLE).map((w) => w.id);
        const id = await db.openDuelRoom(words);
        joinRoom(id, true);
      } catch (e) {
        console.error(e);
        box.appendChild(note("soft", T.err.noDb));
        call.disabled = false;
      }
    });
    box.appendChild(call);

    const waiting = el("div");
    box.appendChild(waiting);
    try {
      const room = await db.liveDuelRoom();
      if (room && room.created_by !== s.me.id) {
        const join = el("button.btn.btn-main", { type: "button", text: T.game.waitsDuel(s.partner.name) });
        join.addEventListener("click", () => joinRoom(room.id, false));
        put(waiting, join);
      } else if (!room) {
        put(waiting, el("p.small.dim", { text: T.game.offline(s.partner.name) }));
      }
    } catch (e) { /* молча: одиночный вариант на месте */ }
  }

  box.appendChild(el("a.btn-text", { href: "#/game" }, T.game.exit));
  put(root, box);
  alone.focus();
  bindScreenKeys({ Escape: () => { location.hash = "#/game"; } });
}

// ── одиночный круг ─────────────────────────────────

function startSolo(pool) {
  live.solo = { queue: shuffle(pool).slice(0, CIRCLE), at: 0, right: 0, wrong: [] };
  paintSolo();
}

function paintSolo() {
  const { root, solo } = live;
  if (solo.at >= solo.queue.length) return finishSolo();
  const w = solo.queue[solo.at];

  const btns = el("div.article-btns");
  const answer = el("div.answer-zone", { hidden: true });

  put(root, el("div.stack",
    el("p.circle-count", { text: T.game.wordNum(solo.at + 1, solo.queue.length) }),
    el("div.ask-word", el("span.word-big", { text: w.de }), el("span.dim", { text: w.ru })),
    el("p.h-block", { text: T.trainer.articleQ }),
    btns,
    answer,
    el("a.btn-text", { href: "#/game" }, T.game.exit)
  ));

  for (const a of ["der", "die", "das"]) {
    const b = el("button.btn", { type: "button", text: a });
    b.addEventListener("click", () => press(a, b));
    btns.appendChild(b);
  }
  const first = btns.querySelector(".btn");
  if (first) first.focus();

  function press(a, b) {
    for (const x of btns.querySelectorAll(".btn")) {
      x.disabled = true;
      if (x.textContent === w.article) x.classList.add("is-right");
    }
    const ok = a === w.article;
    if (ok) { solo.right++; sound("right"); }
    else { solo.wrong.push(w); stumble(w); }

    answer.hidden = false;
    clear(answer);
    answer.appendChild(el("div.row-tight", el("b", { text: w.article + " " + w.de }), speakBtn(w.article + " " + w.de)));
    const next = el("button.btn.btn-main", { type: "button", text: T.common.ok });
    next.addEventListener("click", () => { solo.at++; paintSolo(); });
    answer.appendChild(next);
    next.focus();
    bindScreenKeys({ Enter: () => { solo.at++; paintSolo(); }, Escape: () => { location.hash = "#/game"; } });
  }

  bindScreenKeys({
    Digit1: () => btns.children[0].click(),
    Digit2: () => btns.children[1].click(),
    Digit3: () => btns.children[2].click(),
    Escape: () => { location.hash = "#/game"; }
  });
}

function finishSolo() {
  const { root, solo } = live;
  db.logGame("duel", { solo: true, right: solo.right, of: solo.queue.length });

  const again = el("button.btn.btn-main", { type: "button", text: T.game.nextCircle });
  again.addEventListener("click", () => startSolo(nouns()));

  put(root, el("div.stack",
    el("p.h-block", { text: T.game.rightOf(solo.right, solo.queue.length) }),
    solo.wrong.length ? el("div.stack-s",
      solo.wrong.map((w) => el("p.small", { text: w.article + " " + w.de + " — " + w.ru }))
    ) : null,
    again,
    el("a.btn", { href: "#/game" }, T.game.exit)
  ));
  again.focus();
}

// ── круг на двоих ──────────────────────────────────

function joinRoom(id, mine) {
  const s = store.get();
  live.room = { id, mine, row: null };
  if (live.unwatch) live.unwatch();
  live.unwatch = db.watch("duel_room", "id=eq." + id, () => pull());
  live.poll = setInterval(pull, db.POLL);
  pull();
  put(live.root, el("div.stack", el("p.small.dim", { text: T.err.loading })));
}

async function pull() {
  if (!live || !live.room) return;
  try {
    const row = await db.duelRoom(live.room.id);
    if (!row) return;
    live.room.row = row;
    paintPair();
  } catch (e) { /* подождём следующего опроса */ }
}

function paintPair() {
  const s = store.get();
  const c = s.content;
  const row = live.room.row;
  const st = row.state || { i: 0, presses: {}, score: {} };
  const ids = row.words || [];

  if (st.done || st.i >= ids.length) return finishPair();

  const w = c.wordsById[ids[st.i]];
  if (!w) { st.i++; return save(st); }

  const myPress = st.presses && st.presses[s.me.id];
  const theirId = s.partner ? s.partner.id : null;
  const theirPress = theirId && st.presses ? st.presses[theirId] : null;
  const both = !!myPress && !!theirPress;

  const box = el("div.stack");
  box.appendChild(el("p.circle-count", { text: T.game.wordNum(st.i + 1, ids.length) }));
  box.appendChild(el("p", {
    text: T.game.duelScore(s.me.name, num(st.score, s.me.id), s.partner ? s.partner.name : "", num(st.score, theirId))
  }));
  box.appendChild(el("div.ask-word", el("span.word-big", { text: w.de }), el("span.dim", { text: w.ru })));

  const btns = el("div.article-btns");
  for (const a of ["der", "die", "das"]) {
    const b = el("button.btn", { type: "button", text: a, disabled: !!myPress });
    if (both && a === w.article) b.classList.add("is-right");
    b.addEventListener("click", () => press(a));
    btns.appendChild(b);
  }
  box.appendChild(el("p.h-block", { text: T.trainer.articleQ }));
  box.appendChild(btns);

  if (myPress && !theirPress) box.appendChild(el("p.small.dim", { text: "ждём второго" }));

  if (both) {
    const firstId = myPress.at <= theirPress.at ? s.me.id : theirId;
    const nameOf = (id) => (id === s.me.id ? s.me.name : (s.partner ? s.partner.name : ""));
    box.appendChild(el("div.answer-zone",
      el("b", { text: w.article + " " + w.de }),
      el("p.small", { text: "раньше нажал: " + nameOf(firstId) }),
      el("p.small.dim", {
        text: nameOf(s.me.id) + ": " + myPress.a + " · " + nameOf(theirId) + ": " + theirPress.a
      }),
      speakBtn(w.article + " " + w.de)
    ));
    if (live.room.mine) {
      clearTimeout(live.timer);
      live.timer = setTimeout(() => nextWord(st, w), 1700);
    }
  } else if (live.room.mine && myPress) {
    clearTimeout(live.timer);
    live.timer = setTimeout(() => nextWord(st, w), WAIT);
  }

  box.appendChild(el("a.btn-text", { href: "#/game" }, T.game.exit));
  put(live.root, box);
  if (!myPress) {
    const first = btns.querySelector(".btn");
    if (first) first.focus();
    bindScreenKeys({
      Digit1: () => btns.children[0].click(),
      Digit2: () => btns.children[1].click(),
      Digit3: () => btns.children[2].click(),
      Escape: () => { location.hash = "#/game"; }
    });
  } else {
    bindScreenKeys({ Escape: () => { location.hash = "#/game"; } });
  }

  function press(a) {
    const s2 = store.get();
    st.presses = st.presses || {};
    st.presses[s2.me.id] = { a, at: Date.now() };
    if (a === w.article) {
      st.score = st.score || {};
      st.score[s2.me.id] = num(st.score, s2.me.id) + 1;
      sound("right");
    } else {
      stumble(w);
      st.wrong = st.wrong || [];
      if (!st.wrong.includes(w.id)) st.wrong.push(w.id);
    }
    save(st);
  }
}

function nextWord(st, w) {
  st.i = Number(st.i || 0) + 1;
  st.presses = {};
  if (st.i >= (live.room.row.words || []).length) st.done = true;
  save(st);
}

function save(st) {
  if (!live || !live.room) return;
  live.room.row.state = st;
  paintPair();
  db.saveDuelState(live.room.id, st).catch(() => { /* повторим по опросу */ });
}

function finishPair() {
  const s = store.get();
  const row = live.room.row;
  const st = row.state || {};
  const c = s.content;
  clearInterval(live.poll);
  if (live.unwatch) { live.unwatch(); live.unwatch = null; }
  db.logGame("duel", { room: live.room.id, score: st.score || {} });

  const wrong = (st.wrong || []).map((id) => c.wordsById[id]).filter(Boolean);
  const again = el("button.btn.btn-main", { type: "button", text: T.game.nextCircle });
  again.addEventListener("click", () => paintStart());

  put(live.root, el("div.stack",
    el("p.h-block", {
      text: T.game.duelScore(s.me.name, num(st.score, s.me.id),
        s.partner ? s.partner.name : "", num(st.score, s.partner ? s.partner.id : null))
    }),
    wrong.length ? el("div.stack-s", wrong.map((w) => el("p.small", { text: w.article + " " + w.de + " — " + w.ru }))) : null,
    again,
    el("a.btn", { href: "#/game" }, T.game.exit)
  ));
  again.focus();
}

function num(obj, id) { return Number((obj && id && obj[id]) || 0); }

// неверный артикль у золотого слова тихо увеличивает счётчик запинок
function stumble(w) {
  const p = store.get().progress.byWordId[w.id];
  if (!p || p.grade !== 5) return;
  db.saveWord(w.id, { game_stumbles: Number(p.game_stumbles || 0) + 1 });
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
