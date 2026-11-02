// Город: карта мест, список сцен, механика сцены.
// Основная игра. Промах ничего не стоит и нигде не считается.

import { el, put, clear } from "../el.js";
import { T, scenes as scenesN, times } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import * as chk from "../check.js";
import * as tts from "../tts.js";
import * as mascot from "../mascot.js";
import { umlautRow, germanField, bindScreenKeys, arrowList } from "../keys.js";
import { note, ico, speakBtn, say, sayIfAuto, sound, setTitle } from "../ui.js";
import { placeState } from "../screens/games.js";

const MODE_KEY = "hasen.cityMode";
let live = null;

export function mount(root, params) {
  const s = store.get();
  const c = s.content;
  const place = c && c.placesById[params.placeId];
  if (!place) { location.replace("#/game"); return; }

  if (params.sceneId) {
    const scene = place.scenes.find((x) => x.id === params.sceneId);
    if (!scene) { location.replace("#/game/city/" + place.id); return; }
    startScene(root, place, scene);
  } else {
    paintPlace(root, place);
  }
  return () => unmount();
}

export function unmount() {
  tts.stop();
  live = null;
}

// ── экран места ────────────────────────────────────

function paintPlace(root, place) {
  const s = store.get();
  const c = s.content;
  const st = placeState(c, s.progress)[place.id] || { open: true, prevTitle: "" };
  setTitle(place.title_ru);

  const box = el("div.stack");
  box.appendChild(el("div.row",
    el("a.btn", { href: "#/game" }, "← " + T.game.toMap),
    el("span.grow"),
    place.title_de ? el("span.dim", { text: place.title_de }) : null
  ));

  if (!st.open) box.appendChild(note("calm", T.game.placeLocked(st.prevTitle || "предыдущее место")));

  if (place.numbers && place.numbers.length) box.appendChild(notrufBlock(place));
  if (place.howto && place.howto.length) box.appendChild(howtoBlock(place));

  const mode = currentMode();
  const modes = el("div.row");
  for (const [key, label] of [["one", T.game.modeOne], ["two", T.game.modeTwo]]) {
    const b = el("button.chip", { type: "button", text: label, aria: { pressed: String(mode === key) } });
    b.addEventListener("click", () => {
      try { localStorage.setItem(MODE_KEY, key); } catch (e) { /* не обязательно */ }
      paintPlace(root, place);
    });
    modes.appendChild(b);
  }
  box.appendChild(modes);
  if (mode === "two" && !s.partner) box.appendChild(note("calm", T.home.partnerNever("Амико")));

  const list = el("div.stack-s");
  if (!place.scenes.length) list.appendChild(el("p.small.dim", { text: T.err.noContent }));

  for (const scene of place.scenes) {
    const prog = s.progress.scenes[scene.id];
    const done = Number((prog && prog.done_count) || 0);
    const miss = place.always_open ? null : missing(scene, s, c);
    const can = st.open && !miss;

    const row = el(can ? "a.tile" : "div.tile",
      can ? { href: "#/game/city/" + place.id + "/" + scene.id } : { data: { locked: "true" } },
      el("div.row-tight",
        ico(done ? "check" : "dash", 20),
        el("b", { text: scene.title_ru }),
        done ? el("span.small.dim", { text: times(done) }) : null,
        miss ? ico("lock", 20) : null
      ),
      miss ? el("p.small.dim", { text: miss }) : null
    );
    list.appendChild(row);
  }
  box.appendChild(list);
  put(root, box);
}

const currentMode = () => (localStorage.getItem(MODE_KEY) === "two" ? "two" : "one");

function missing(scene, s, c) {
  for (const r of scene.needs_rules || []) {
    if (!sch.ruleDone(s.progress, r)) {
      const rule = c.rulesById[r];
      return T.game.needRule(rule ? rule.title : r);
    }
  }
  for (const wid of scene.needs_words || []) {
    if (!s.progress.byWordId[wid]) {
      const w = c.wordsById[wid];
      const topic = w && c.topics.find((t) => t.id === w.topic);
      return T.game.needWords(topic ? topic.title_ru : (w ? w.de : wid));
    }
  }
  return null;
}

function notrufBlock(place) {
  const box = el("div.card.card-accent.stack");
  box.appendChild(el("div.notruf-nums",
    place.numbers.map((n) => el("div.notruf-line",
      el("span.what", { text: n.what }),
      el("span", { text: n.words + " (" + n.digits + ")" }),
      n.de ? speakBtn(n.de) : null
    ))
  ));
  if (place.memo && place.memo.length) {
    box.appendChild(el("h2.h-block", { text: T.notruf.memo }));
    const list = el("div.stack");
    place.memo.forEach((m, i) => {
      list.appendChild(el("div.stack-s",
        el("p.h-block", { text: (i + 1) + ". " + m.point }),
        m.de
          ? el("div.row-tight", el("span.de", { text: m.de }),
              m.tr ? el("span.small.dim", { text: " — " + m.tr }) : null, speakBtn(m.de))
          : el("p.small.dim", { text: T.notruf.noText })
      ));
    });
    box.appendChild(list);
  }
  return box;
}

function howtoBlock(place) {
  const body = el("div.stack-s", { hidden: true });
  const btn = el("button.btn", { type: "button", text: T.game.howItWorks });
  btn.addEventListener("click", () => {
    if (!body.firstChild) for (const p of place.howto) body.appendChild(el("p.prose", { text: p }));
    body.hidden = !body.hidden;
  });
  return el("div.card.stack-s", btn, body);
}

// ── сцена: шаги ────────────────────────────────────

function startScene(root, place, scene) {
  const s = store.get();
  const mode = currentMode() === "two" && s.partner ? "two" : "one";
  const prog = s.progress.scenes[scene.id];
  const passes = Number((prog && prog.done_count) || 0);

  live = {
    root, place, scene, mode,
    steps: [],
    at: 0,
    lastWho: null,
    typed: passes >= 2,        // после двух прохождений кусочки больше не выдаются
    hint: false,
    stumbles: new Set()
  };

  setTitle(scene.title_ru);
  if (mode === "two") paintRolePick();
  else { buildSteps(null); paintStep(); }
}

function paintRolePick() {
  const s = store.get();
  const botName = (live.scene.roles && live.scene.roles.bot) || "собеседник";
  put(live.root, el("div.handover",
    el("p.who", { text: "Кто играет роль «" + botName + "»?" }),
    el("div.row",
      el("button.btn.btn-main", { type: "button", text: s.me.name, on: { click: () => pick(s.me.name) } }),
      el("button.btn.btn-main", { type: "button", text: s.partner.name, on: { click: () => pick(s.partner.name) } })
    )
  ));
  const b = live.root.querySelector(".btn-main");
  if (b) b.focus();

  function pick(name) { buildSteps(name); paintStep(); }
}

function buildSteps(roleOwner) {
  const s = store.get();
  const other = roleOwner
    ? (roleOwner === s.me.name ? (s.partner ? s.partner.name : s.me.name) : s.me.name)
    : null;

  live.steps = [];
  for (const line of live.scene.lines) {
    if (live.mode === "one") {
      live.steps.push({ kind: line.who === "bot" ? "choose" : "say", line });
    } else if (line.who === "bot") {
      // реплику собеседника собирает тот, кто взял его роль, а второй разбирает смысл
      live.steps.push({ kind: "say", line, who: roleOwner, botLine: true });
      live.steps.push({ kind: "choose", line, who: other });
    } else {
      live.steps.push({ kind: "say", line, who: other });
    }
  }
}

function paintStep() {
  const { steps } = live;
  if (live.at >= steps.length) { finishScene(); return; }
  const step = steps[live.at];

  // передача хода из рук в руки
  if (live.mode === "two" && step.who && step.who !== live.lastWho) {
    put(live.root, el("div.handover",
      el("p.who", { text: T.game.handover(step.who) }),
      el("button.btn.btn-main", {
        type: "button", text: T.game.ready(step.who),
        on: { click: () => { live.lastWho = step.who; paintStep(); } }
      })
    ));
    const b = live.root.querySelector(".btn-main");
    if (b) b.focus();
    bindScreenKeys({ Enter: () => { live.lastWho = step.who; paintStep(); } });
    return;
  }

  const lineNo = live.scene.lines.indexOf(step.line) + 1;
  const box = el("div.stack");
  box.appendChild(el("div.scene-head",
    el("span.dim", { text: live.place.title_ru + " → " + live.scene.title_ru }),
    el("span.small.dim", { text: T.game.replica(lineNo, live.scene.lines.length) })
  ));
  const body = el("div");
  box.appendChild(body);
  box.appendChild(el("div.row", el("a.btn-text", { href: "#/game/city/" + live.place.id }, T.game.exit)));
  put(live.root, box);

  if (step.kind === "choose") paintChoose(body, step.line);
  else paintSay(body, step);
}

const advance = () => { live.at++; live.hint = false; paintStep(); };

// ── разбор реплики собеседника ─────────────────────

function paintChoose(body, line) {
  const said = el("div.said",
    el("p.de", { text: line.de }),
    el("button.btn", { type: "button", text: T.trainer.listenMore, on: { click: () => say(line.de) } })
  );
  const ruBox = el("p.small.dim", { hidden: true, text: line.ru || "" });
  said.appendChild(ruBox);

  const hare = mascot.make("amiko", 70, "calm");
  const list = el("div.stack-s");
  put(body, el("div.line-bot", hare, said), el("p.h-block", { text: T.game.botQ }), list);
  sayIfAuto(line.de);

  let order = shuffle((line.options_ru || []).map((text, i) => ({ text, i })));

  function render() {
    clear(list);
    order.forEach((o, k) => {
      const b = el("button.pick", { type: "button" },
        el("span.num", { text: String(k + 1) }),
        el("span.grow", { text: o.text })
      );
      b.addEventListener("click", () => choose(o, b));
      list.appendChild(b);
    });
    arrowList(list, ".pick");
    const first = list.querySelector(".pick");
    if (first) first.focus();
    bindScreenKeys({
      Digit1: () => clickAt(0), Digit2: () => clickAt(1), Digit3: () => clickAt(2), Digit4: () => clickAt(3),
      "Alt+Enter": () => say(line.de),
      Escape: () => { location.hash = "#/game/city/" + live.place.id; }
    });
  }
  const clickAt = (k) => { const b = list.querySelectorAll(".pick")[k]; if (b) b.click(); };

  function choose(o, b) {
    if (o.i === line.answer) {
      b.classList.add("is-right");
      for (const x of list.querySelectorAll(".pick")) x.disabled = true;
      ruBox.hidden = false;
      setTimeout(advance, 700);
    } else {
      // промах: перевод, ещё раз голосом, и вопрос заново с перемешанными вариантами
      ruBox.hidden = false;
      say(line.de);
      order = shuffle(order);
      render();
    }
  }
  render();
}

// ── реплика человека: сборка или печать ────────────

function paintSay(body, step) {
  const line = step.line;
  const task = line.task_ru || (step.botLine ? T.game.humanTurn : T.game.humanTurn);
  const useChunks = !live.typed || live.hint || step.botLine;
  if (useChunks) assemble(body, line, task, step);
  else typePhrase(body, line, task, step);
}

function assemble(body, line, task, step) {
  const target = line.de;
  const chunks = line.chunks && line.chunks.length ? line.chunks : String(target).split(/\s+/);

  const lineBox = el("div.build-line");
  const bankWrap = el("div.chunks");
  const sayB = el("button.btn.btn-main", { type: "button", text: T.game.say, disabled: true });

  put(body, el("div.turn-hand", el("p.h-block", { text: task }), lineBox, bankWrap, sayB));

  const taken = [];
  const bank = chunks.map((text) => {
    const b = el("button.chunk", { type: "button", text, data: { used: "false" } });
    b.addEventListener("click", () => {
      if (b.dataset.used === "true") return;
      b.dataset.used = "true";
      taken.push({ text, btn: b });
      render();
    });
    return b;
  });
  const order = shuffle(bank);

  function render() {
    clear(lineBox);
    taken.forEach((t, i) => {
      const b = el("button.chunk", { type: "button", text: t.text });
      b.addEventListener("click", () => { taken.splice(i, 1); t.btn.dataset.used = "false"; render(); });
      lineBox.appendChild(b);
    });
    clear(bankWrap);
    for (const b of order) bankWrap.appendChild(b);
    sayB.disabled = taken.length !== chunks.length;
    if (!sayB.disabled) sayB.focus();
  }
  render();
  arrowList(bankWrap, ".chunk", { axis: "horizontal" });

  function check() {
    if (sayB.disabled) return;
    const got = taken.map((t) => t.text).join(" ");
    if (got === target) {
      lineBox.dataset.bad = "false";
      sayB.disabled = true;
      say(target);
      sound("right");
      if (line.ru && !step.botLine) body.appendChild(el("p.small.dim", { text: line.ru }));
      setTimeout(advance, 1300);
      return;
    }
    lineBox.dataset.bad = "true";
    let bad = -1;
    for (let i = 0; i < taken.length; i++) {
      if (taken[i].text !== chunks[i]) { bad = i; break; }
    }
    if (bad < 0) bad = taken.length - 1;
    const t = taken.splice(bad, 1)[0];
    if (t) t.btn.dataset.used = "false";
    noteStumble(line, got);
    render();
  }
  sayB.addEventListener("click", check);

  bindScreenKeys({
    Enter: check,
    Backspace: () => { if (taken.length) { const t = taken.pop(); t.btn.dataset.used = "false"; render(); } },
    Escape: () => { location.hash = "#/game/city/" + live.place.id; }
  });
}

function typePhrase(body, line, task, step) {
  const field = germanField({ "aria-label": task });
  const row = umlautRow(field);
  const btn = el("button.btn.btn-main", { type: "button", text: T.game.say });
  const hintB = el("button.btn-text", { type: "button", text: T.game.hintChunks });

  put(body, el("div.turn-hand",
    el("p.h-block", { text: task }),
    field, row,
    el("div.row", btn, hintB)
  ));
  field.focus();

  // подсказка ничего не портит, нигде не отмечается и не считается
  hintB.addEventListener("click", () => { live.hint = true; paintSay(body, step); });

  function check() {
    const val = field.value;
    if (!val.trim()) return;
    const r = chk.checkGap(val, line.de);
    if (r.ok) {
      say(line.de);
      sound(r.almost ? "almost" : "right");
      const box = el("div.stack-s", el("p.de", { text: line.de }));
      if (r.almost) box.appendChild(el("p.small", { text: T.trainer.almost }));
      if (line.ru) box.appendChild(el("p.small.dim", { text: line.ru }));
      body.appendChild(box);
      btn.disabled = true;
      setTimeout(advance, 1300);
    } else {
      noteStumble(line, val);
      field.select();
    }
  }
  btn.addEventListener("click", check);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } });
  bindScreenKeys({ Escape: () => { location.hash = "#/game/city/" + live.place.id; } });
}

// Слова, встреченные в сцене, тихо проверяются. Никаких сообщений в этот момент.
function noteStumble(line, got) {
  const c = store.get().content;
  const mine = new Set(chk.normalizeDe(got).split(" ").filter(Boolean));
  for (const token of String(line.de).split(/\s+/)) {
    const norm = chk.normalizeDe(token);
    if (!norm || mine.has(norm)) continue;
    const w = c.words.find((x) => chk.normalizeDe(x.de) === norm);
    if (w) live.stumbles.add(w.id);
  }
}

// ── сцена пройдена ─────────────────────────────────

function finishScene() {
  const s = store.get();
  const { scene, place } = live;
  const prog = s.progress.scenes[scene.id] || { done_count: 0, pair_count: 0 };

  db.saveScene(scene.id, {
    done_count: Number(prog.done_count || 0) + 1,
    pair_count: Number(prog.pair_count || 0) + (live.mode === "two" ? 1 : 0)
  });

  for (const id of live.stumbles) {
    const p = s.progress.byWordId[id];
    if (!p) continue;
    db.saveWord(id, { game_stumbles: Number(p.game_stumbles || 0) + 1 });
  }
  db.logGame("city", { scene: scene.id, mode: live.mode, stumbles: [...live.stumbles] });

  // из магазинов и заведений выход ведёт на улицу, с улицы — на карту
  const next = place.exit_to ? s.content.placesById[place.exit_to] : null;
  const exitTo = next ? "#/game/city/" + next.id : "#/game";
  const again = el("button.btn.btn-main", { type: "button", text: T.game.sceneAgain });
  again.addEventListener("click", () => startScene(live.root, place, scene));

  const box = el("div.finish");
  box.appendChild(mascot.make(s.me.name === "Амико" ? "amiko" : "matt", 130, "praise"));
  box.appendChild(el("p.h-block", { text: T.game.sceneDone }));
  box.appendChild(again);
  box.appendChild(el("div.row",
    next ? el("a.btn", { href: exitTo }, T.game.exitTo(next.title_ru)) : null,
    el("a.btn", { href: "#/game/city/" + place.id }, "к сценам места"),
    el("a.btn", { href: "#/game" }, T.game.toMap)
  ));
  put(live.root, box);
  again.focus();
  bindScreenKeys({ Escape: () => { location.hash = exitTo; } });
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
