// Экран ТРЕНАЖЁР. Главный рабочий экран.
// Всё умещается на экране высотой 900 точек без прокрутки.

import { el, put, clear } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import * as chk from "../check.js";
import * as tts from "../tts.js";
import * as mascot from "../mascot.js";
import { umlautRow, germanField, bindScreenKeys, arrowList } from "../keys.js";
import {
  note, speakBtn, say, sayIfAuto, sound, modal, sessionBar, setTitle, ico, switchBtn
} from "../ui.js";

const SEEN_PAIR = "hasen.seenPairNote";
const SEEN_LEAVE = "hasen.seenLeaveNote";

let S = null;          // сессия
let host = null;
let hare = null;
let stats = null;

export function mount(root, params) {
  host = root;
  const s = store.get();
  const mode = params && params.mode === "repeat" ? "repeat" : "normal";

  S = sch.buildSession(s.content, s.progress, s.partnerProgress, s.settings, db.today(), {
    mode,
    partnerExists: !!s.partner,
    hasGerman: s.voiceOk,
    pairCheck: false
  });
  stats = { cards: 0, newOpened: 0, gold: 0, silver: 0 };

  // второй мог зайти впервые или уже позаниматься: пересобираем пачку,
  // пока ни одна карточка не отвечена
  db.refreshPartner().then(() => {
    if (!S || stats.cards > 0 || S.at > 0) return;
    const st = store.get();
    S = sch.buildSession(st.content, st.progress, st.partnerProgress, st.settings, db.today(), {
      mode, partnerExists: !!st.partner, hasGerman: st.voiceOk, pairCheck: !!S.pairCheck
    });
    paint();
  });

  paint();
  return () => unmount();
}

export function unmount() {
  tts.stop();
  sessionBar(null);
  if (S && S.at !== undefined && S.at < S.queue.length && stats && stats.cards > 0) {
    if (!localStorage.getItem(SEEN_LEAVE)) {
      try { localStorage.setItem(SEEN_LEAVE, "1"); } catch (e) { /* не обязательно */ }
    }
  }
  S = null;
  host = null;
  hare = null;
}

// ── общий каркас экрана ────────────────────────────

function paint() {
  const s = store.get();
  if (!S) return;

  if (S.at === undefined) S.at = 0;

  if (!S.queue.length) { paintNothing(); return; }
  if (S.at >= S.queue.length) { paintFinish(); return; }

  const card = S.queue[S.at];
  const prog = s.progress.byWordId[card.wordId] || null;
  card.prog = prog;

  setTitle(s.settings.counter_digits ? T.trainer.counter(S.at + 1, S.queue.length) : T.menu.trainer);
  sessionBar(S.queue.length ? S.at / S.queue.length : 0);

  const box = el("div.trainer");

  // плашки состояния пачки
  if (S.cleanup) box.appendChild(note("calm", T.home.cleanup));
  if (S.allow && S.allow.why === "sync" && s.partner) box.appendChild(note("wait", T.home.waiting(s.partner.name)));
  if (!s.voiceOk && !S.voiceNoted) {
    S.voiceNoted = true;
    box.appendChild(note("calm", T.settings.noVoice));
  }
  if (card.again && !S.againNoted) {
    S.againNoted = true;
    box.appendChild(el("p.small.dim", { text: T.trainer.oneMore }));
  }

  box.appendChild(switchBtn(T.trainer.pairMode, !!S.pairCheck, (on) => {
    S.pairCheck = on;
    if (on && !localStorage.getItem(SEEN_PAIR)) {
      try { localStorage.setItem(SEEN_PAIR, "1"); } catch (e) { /* не обязательно */ }
      modal({ text: T.trainer.pairNote, okText: T.common.ok, cancelText: T.common.close });
    }
    card.state = "ask";
    card.result = null;
    card.step = 1;
    paint();
  }));

  const askZone = el("div.ask");
  const ansZone = el("div.answer-zone", { hidden: true });
  const hint = el("p.hint-line");
  const gradeRow = el("div.grades", { hidden: true });

  hare = mascot.make("matt", 70, "calm");
  hare.dataset.who = whoKey(s);
  mascot.set(hare, "calm");

  box.appendChild(askZone);
  box.appendChild(ansZone);
  box.appendChild(hint);
  box.appendChild(el("div.trainer-bottom", gradeRow, hare));

  put(host, box);

  const ctx = { card, prog, askZone, ansZone, hint, gradeRow, s };

  if (card.meet && card.state === "ask") paintMeet(ctx);
  else if (card.state === "ask") paintAsk(ctx);
  else paintAnswered(ctx);

  bindScreenKeys({
    Escape: () => { location.hash = "#/home"; },
    "Alt+Enter": () => tts.repeat({ voice: s.settings.voice_name, rate: s.settings.voice_rate })
  });
}

function whoKey(s) {
  const me = (s.me && s.me.name) || "";
  return me === "Амико" ? "amiko" : "matt";
}

// ── карточка знакомства ────────────────────────────

function paintMeet(ctx) {
  const { card, askZone } = ctx;
  const w = card.word;
  const full = chk.canonical(w);

  put(askZone,
    el("p.small.dim", { text: T.trainer.meet }),
    el("div.ask-word",
      el("span.word-big", { text: full }),
      w.plural ? el("span.dim", { text: w.plural }) : null,
      speakBtn(full)
    ),
    el("p", { text: w.tr }),
    el("p.h-block", { text: w.ru }),
    w.phrase_de ? el("div.row-tight",
      el("span", { text: w.phrase_de }),
      w.phrase_ru ? el("span.small.dim", { text: " — " + w.phrase_ru }) : null,
      speakBtn(w.phrase_de)
    ) : null,
    w.note ? el("p.small.dim", { text: w.note }) : null,
    el("button.btn.btn-main", { type: "button", text: T.trainer.gotIt, on: { click: next } })
  );
  sayIfAuto(full);
  if (hare) mascot.flash(hare, "wonder", 1300);

  function next() {
    card.meet = false;
    paint();
  }
  const b = askZone.querySelector(".btn-main");
  if (b) b.focus();
  bindScreenKeys({ Enter: next, Escape: () => { location.hash = "#/home"; } });
}

// ── задание ────────────────────────────────────────

function paintAsk(ctx) {
  const { card } = ctx;
  if (S.pairCheck) return paintPair(ctx);
  if (card.exercise === 1) return paintPick(ctx);
  if (card.exercise === 2) return paintBuild(ctx);
  if (card.exercise === 4) return paintHear(ctx);
  return paintType(ctx);
}

// режим «проверяем друг друга»: ответ скрыт, поля ввода нет
function paintPair(ctx) {
  const { card, askZone } = ctx;
  const w = card.word;
  const hearing = card.exercise === 4;

  put(askZone,
    el("p.small.dim", { text: hearing ? T.trainer.hearTitle : T.trainer.pick4 }),
    hearing
      ? el("button.btn.btn-main", { type: "button", text: T.trainer.listen, on: { click: () => say(chk.canonical(w)) } })
      : el("p.word-big", { text: card.exercise === 1 ? chk.canonical(w) : w.ru }),
    el("button.btn.btn-main", { type: "button", text: T.trainer.show, on: { click: reveal } })
  );
  if (hearing) sayIfAuto(chk.canonical(w));

  function reveal() {
    card.state = "answered";
    card.result = { ok: true, almost: false, articleError: false, caseWarning: false, pair: true };
    paint();
  }
  const btns = askZone.querySelectorAll(".btn-main");
  if (btns.length) btns[btns.length - 1].focus();
  bindScreenKeys({ Enter: reveal, Escape: () => { location.hash = "#/home"; } });
}

// тип первый: выбор из четырёх
function paintPick(ctx) {
  const { card, askZone, s } = ctx;
  const w = card.word;
  const full = chk.canonical(w);
  const options = pickOptions(w, s.content);

  const list = el("div.stack-s");
  put(askZone,
    el("div.ask-word", el("span.word-big", { text: full }), speakBtn(full)),
    el("p.small.dim", { text: T.trainer.pick4 }),
    list
  );

  options.forEach((o, i) => {
    const b = el("button.pick", { type: "button" },
      el("span.num", { text: String(i + 1) }),
      el("span.grow", { text: o.ru })
    );
    b.addEventListener("click", () => choose(i));
    list.appendChild(b);
  });
  arrowList(list, ".pick");
  sayIfAuto(full);

  const right = options.findIndex((o) => o.id === w.id);

  function choose(i) {
    const btns = [...list.querySelectorAll(".pick")];
    btns.forEach((b, k) => {
      b.disabled = true;
      if (k === right) b.classList.add("is-right");
      else if (k === i) b.classList.add("is-wrong");
    });
    answered(ctx, { ok: i === right, almost: false, articleError: false, caseWarning: false });
  }

  const first = list.querySelector(".pick");
  if (first) first.focus();
  bindScreenKeys({
    Digit1: () => choose(0), Digit2: () => choose(1), Digit3: () => choose(2), Digit4: () => choose(3),
    Escape: () => { location.hash = "#/home"; },
    "Alt+Enter": () => say(full)
  });
}

function pickOptions(w, c) {
  const same = (c.byTopic[w.topic] || []).filter((x) => x.id !== w.id && x.ru !== w.ru);
  const pool = same.filter((x) => x.pos === w.pos);
  const rest = same.filter((x) => x.pos !== w.pos);
  const others = c.words.filter((x) => x.topic !== w.topic && x.ru !== w.ru);
  const picks = [];
  for (const src of [shuffle(pool), shuffle(rest), shuffle(others)]) {
    for (const x of src) {
      if (picks.length >= 3) break;
      if (picks.some((p) => p.ru === x.ru)) continue;
      picks.push(x);
    }
    if (picks.length >= 3) break;
  }
  return shuffle([w, ...picks]);
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

// тип второй: сборка слова из слогов
function paintBuild(ctx) {
  const { card, askZone } = ctx;
  const w = card.word;
  const needArticle = w.pos === "noun" && !!w.article;
  const target = needArticle ? w.article + " " + w.de : w.de;
  const pieces = shuffle(needArticle ? [w.article, ...w.syllables] : [...w.syllables]);

  const line = el("div.build-line");
  const bank = el("div.chunks");
  const checkB = el("button.btn.btn-main", { type: "button", text: T.trainer.checkBtn, disabled: true });

  put(askZone,
    el("p.small.dim", { text: T.trainer.build }),
    el("p.word-big", { text: w.ru }),
    el("p", { text: w.tr }),
    line, bank, checkB
  );

  const taken = [];

  function render() {
    clear(line);
    taken.forEach((t, i) => {
      const b = el("button.chunk", { type: "button", text: t.text });
      b.addEventListener("click", () => { taken.splice(i, 1); t.btn.dataset.used = "false"; render(); });
      line.appendChild(b);
    });
    clear(bank);
    for (const b of bankBtns) bank.appendChild(b);
    checkB.disabled = taken.length !== pieces.length;
  }

  const bankBtns = pieces.map((piece) => {
    const b = el("button.chunk", { type: "button", text: piece, data: { used: "false" } });
    b.addEventListener("click", () => {
      if (b.dataset.used === "true") return;
      b.dataset.used = "true";
      taken.push({ text: piece, btn: b });
      render();
      if (taken.length === pieces.length) checkB.focus();
    });
    return b;
  });
  render();
  arrowList(bank, ".chunk", { axis: "horizontal" });

  function join() {
    // артикль отделяется пробелом, слоги склеиваются без пробела
    if (!needArticle) return taken.map((t) => t.text).join("");
    if (!taken.length) return "";
    return taken[0].text + " " + taken.slice(1).map((t) => t.text).join("");
  }

  function doCheck() {
    if (checkB.disabled) return;
    const ok = join() === target;
    line.dataset.bad = ok ? "false" : "true";
    for (const b of bankBtns) b.disabled = true;
    for (const b of line.querySelectorAll(".chunk")) b.disabled = true;
    checkB.disabled = true;
    answered(ctx, { ok, almost: false, articleError: false, caseWarning: false });
  }
  checkB.addEventListener("click", doCheck);

  const first = bank.querySelector(".chunk");
  if (first) first.focus();
  bindScreenKeys({
    Enter: doCheck,
    Backspace: () => { if (taken.length) { const t = taken.pop(); t.btn.dataset.used = "false"; render(); } },
    Escape: () => { location.hash = "#/home"; }
  });
}

// тип третий: печать в два шага
function paintType(ctx) {
  const { card, askZone } = ctx;
  const w = card.word;
  const skipTr = !String(w.tr || "").trim() || w.pos === "phrase";
  if (card.step === 1 && skipTr) card.step = 2;

  const isTr = card.step === 1;
  const field = germanField({ id: "ans", "aria-label": isTr ? T.trainer.trStep : T.trainer.deStep });
  const row = isTr ? null : umlautRow(field);
  const btn = el("button.btn.btn-main", { type: "button", text: T.trainer.checkBtn });

  put(askZone,
    el("p.word-big", { text: w.ru }),
    el("label.label", { for: "ans", text: isTr ? T.trainer.trStep : (w.pos === "noun" ? T.trainer.deStep : T.trainer.deStepNoArt) }),
    field,
    row,
    btn
  );

  function doCheck() {
    const val = field.value;
    if (!val.trim()) return;
    if (isTr) {
      const r = chk.checkTranscription(val, w);
      card.trResult = r;
      card.step = 2;
      card.trShown = r;
      paintType(ctx);
      return;
    }
    const r = chk.checkGerman(val, w);
    if (card.trResult && !card.trResult.ok) r.trMissed = card.trResult;
    answered(ctx, r);
  }

  btn.addEventListener("click", doCheck);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doCheck(); } });
  field.focus();

  if (card.step === 2 && card.trShown) {
    askZone.insertBefore(el("p.small.dim", {
      text: card.trShown.ok
        ? (card.trShown.almost ? T.trainer.almost + ": " + card.trShown.canonical : card.trShown.canonical)
        : card.trShown.canonical
    }), askZone.children[1]);
  }

  bindScreenKeys({ Escape: () => { location.hash = "#/home"; } });
}

// тип четвёртый: на слух
function paintHear(ctx) {
  const { card, askZone } = ctx;
  const w = card.word;
  const full = chk.canonical(w);
  const field = germanField({ id: "ans", "aria-label": T.trainer.hearTitle });
  const row = umlautRow(field);
  const btn = el("button.btn.btn-main", { type: "button", text: T.trainer.checkBtn });
  const listen = el("button.btn", { type: "button", text: T.trainer.listenMore });

  put(askZone,
    el("p.small.dim", { text: T.trainer.hearTitle }),
    el("button.btn.btn-main", { type: "button", text: T.trainer.listen, on: { click: () => say(full) } }),
    listen,
    field, row, btn
  );
  listen.addEventListener("click", () => say(full));
  sayIfAuto(full);

  function doCheck() {
    if (!field.value.trim()) return;
    answered(ctx, chk.checkGerman(field.value, w));
  }
  btn.addEventListener("click", doCheck);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doCheck(); } });
  field.focus();
  bindScreenKeys({ Escape: () => { location.hash = "#/home"; }, "Alt+Enter": () => say(full) });
}

// ── после ответа ───────────────────────────────────

function answered(ctx, result) {
  const { card } = ctx;
  card.result = result;
  card.state = "answered";

  if (!result.pair) writeAnswer(card, result);
  paintAnswered(ctx, true);
}

function writeAnswer(card, result) {
  const s = store.get();
  const w = card.word;
  const prog = s.progress.byWordId[w.id] || null;
  const day = db.today();
  const lock = card.lock;

  const patch = {
    topic_id: w.topic,
    shows: Number((prog && prog.shows) || 0) + 1,
    last_seen: new Date().toISOString()
  };
  if (!prog) patch.first_seen = new Date().toISOString();
  if (lock) patch.last_lock = lock;

  const bad = !result.ok || result.articleError || (result.trMissed && !result.trMissed.ok);
  if (bad) {
    patch.errors = Number((prog && prog.errors) || 0) + 1;
    if (lock) patch["err_" + lock] = true;
  } else if (lock) {
    patch["err_" + lock] = false;
    if (card.canOpenLock) {
      patch["lock_" + lock] = true;
      patch["lock_" + lock + "_day"] = day;
    }
  }

  db.saveWord(w.id, patch);
  db.bumpDay({ cards: 1, right_n: bad ? 0 : 1, wrong_n: bad ? 1 : 0 });
  stats.cards++;

  if (result.ok && !bad) sound(result.almost ? "almost" : "right");
}

function paintAnswered(ctx, fresh) {
  const { card, ansZone, hint, gradeRow, askZone } = ctx;
  const s = store.get();
  const w = card.word;
  const r = card.result || {};
  const prog = s.progress.byWordId[w.id] || null;

  ansZone.hidden = false;
  clear(ansZone);
  ansZone.appendChild(el("div.row-tight",
    el("b", { text: chk.dictLine(w) }),
    speakBtn(chk.canonical(w))
  ));

  if (r.almost) ansZone.appendChild(el("p.small", { text: T.trainer.almost }));
  if (r.trMissed && !r.trMissed.ok) ansZone.appendChild(el("p.small.dim", { text: w.tr }));
  if (r.caseWarning) ansZone.appendChild(el("p.small", { text: T.trainer.bigLetter }));
  if (r.articleError) {
    ansZone.appendChild(el("p.small", { text: T.trainer.artIs(w.article) }));
    ansZone.appendChild(articleFix(w));
  }
  if (w.phrase_de) {
    ansZone.appendChild(el("div.row-tight",
      el("span.small", { text: w.phrase_de }),
      w.phrase_ru ? el("span.small.dim", { text: " — " + w.phrase_ru }) : null
    ));
  }

  // кнопка ругательства: только при верном ответе
  if (r.ok && !r.articleError && s.settings.insult_button && (s.content.insults || []).length) {
    const b = el("button.btn", { type: "button", text: T.trainer.insult });
    b.addEventListener("click", () => {
      const bubble = mascot.insultBubble(s.content.insults, (t) => say(t));
      if (!bubble) return;
      ansZone.appendChild(bubble);
      b.disabled = true;
      if (hare) mascot.set(hare, "angry");
      const close = (e) => {
        if (e.type === "keydown" && e.key !== "Escape") return;
        bubble.remove();
        if (hare) mascot.set(hare, "calm");
        window.removeEventListener("keydown", close);
        window.removeEventListener("pointerdown", close);
      };
      setTimeout(() => {
        window.addEventListener("keydown", close);
        window.addEventListener("pointerdown", close);
      }, 300);
    });
    ansZone.appendChild(b);
  }

  // кролик: доволен при верном, молчит при неверном
  if (hare && fresh) {
    if (r.pair) mascot.set(hare, "calm");
    else if (r.ok && !r.articleError) mascot.flash(hare, "glad", 1300);
    else mascot.set(hare, "calm");
  }

  // подсказка над оценками
  const sug = r.pair ? "" : sch.suggestGrade(prog, s.voiceOk);
  hint.textContent = sug === "gold" ? T.trainer.hintGold : sug === "silver" ? T.trainer.hintSilver : "";

  // оценки
  gradeRow.hidden = false;
  clear(gradeRow);
  const ready = sch.goldReady(prog, s.voiceOk);
  for (const g of T.trainer.grades) {
    const b = el("button.grade.g" + g.n, { type: "button", data: g.n === 5 ? { dim: String(!ready) } : {} },
      el("span.g-num", { text: String(g.n) }),
      el("span.g-cap", { text: g.cap })
    );
    b.addEventListener("click", () => grade(g.n));
    gradeRow.appendChild(b);
  }
  arrowList(gradeRow, ".grade", { axis: "horizontal" });
  const first = gradeRow.querySelector(".grade");
  if (first) first.focus();

  bindScreenKeys({
    Digit1: () => grade(1), Digit2: () => grade(2), Digit3: () => grade(3),
    Digit4: () => grade(4), Digit5: () => grade(5),
    Escape: () => { location.hash = "#/home"; },
    "Alt+Enter": () => say(chk.canonical(w))
  });

  function grade(n) {
    const progNow = store.get().progress.byWordId[w.id] || null;
    if (n === 5) {
      const missing = sch.missingLock(progNow, s.voiceOk);
      if (missing) {
        modal({
          text: T.trainer.goldConfirm(T.words.locks[missing]),
          okText: T.trainer.yes, cancelText: T.trainer.notYet,
          onOk: () => applyGrade(card, 5)
        });
        return;
      }
    }
    applyGrade(card, n);
  }
}

function articleFix(w) {
  const box = el("div.article-btns");
  for (const a of ["der", "die", "das"]) {
    const b = el("button.btn", { type: "button", text: a });
    b.addEventListener("click", () => {
      for (const x of box.querySelectorAll(".btn")) {
        x.disabled = true;
        if (x.textContent === w.article) x.classList.add("is-right");
      }
      say(chk.canonical(w));
    });
    box.appendChild(b);
  }
  return box;
}

// ── после оценки ───────────────────────────────────

function applyGrade(card, n) {
  const s = store.get();
  const w = card.word;
  const prog = s.progress.byWordId[w.id] || null;
  const day = db.today();
  const wasNew = !prog || Number(prog.shows || 0) <= 1;
  const firstToday = prog && prog.first_seen && String(prog.first_seen).slice(0, 10) === day;

  const patch = { topic_id: w.topic, grade: n, next_due: sch.nextDue(n, day) };
  if (n === 5) { patch.gold_at = new Date().toISOString(); patch.next_due = null; }
  const before = prog ? prog.grade : null;
  db.saveWord(w.id, patch);

  if (n === 5 && before !== 5) { stats.gold++; sound("gold"); if (hare) mascot.flash(hare, "proud", 1300); }
  if (n === 4 && before !== 4) stats.silver++;

  // новое слово засчитывается один раз; в дневную норму идут только слова
  // основной последовательности, бонусный блок на счёт не влияет
  const topic = s.content.topics.find((t) => t.id === w.topic);
  if (wasNew && firstToday && !card.counted) {
    card.counted = true;
    stats.newOpened++;
    if (topic && !topic.bonus) db.bumpDay({ new_n: 1 });
  }

  // оценка один: слово возвращается в эту же сессию
  if (n === 1) {
    const fresh = store.get().progress.byWordId[w.id];
    sch.pushBack(S, card, fresh, day, s.voiceOk);
  }

  S.at++;
  paint();
}

// ── пачка кончилась и нечего показывать ────────────

function paintFinish() {
  const s = store.get();
  setTitle(T.menu.trainer);
  sessionBar(1);

  const box = el("div.finish");
  const h = mascot.make(whoKey(s), 130, "calm");
  box.appendChild(h);
  box.appendChild(el("p.h-block", { text: T.trainer.finish }));
  box.appendChild(el("p", { text: T.trainer.finishCards(stats.cards, stats.newOpened) }));
  if (stats.gold) box.appendChild(el("p.small.dim", { text: T.trainer.finishGold(stats.gold) }));
  if (stats.silver) box.appendChild(el("p.small.dim", { text: T.trainer.finishSilver(stats.silver) }));

  const again = el("button.btn.btn-main", { type: "button", text: T.trainer.again });
  again.addEventListener("click", () => {
    const st = store.get();
    S = sch.buildSession(st.content, st.progress, st.partnerProgress, st.settings, db.today(), {
      mode: "normal", partnerExists: !!st.partner, hasGerman: st.voiceOk
    });
    S.at = 0;
    stats = { cards: 0, newOpened: 0, gold: 0, silver: 0 };
    paint();
  });

  box.appendChild(again);
  box.appendChild(el("div.row",
    el("a.btn", { href: "#/home" }, T.trainer.toHome),
    el("a.btn", { href: "#/game" }, T.trainer.toGame)
  ));
  put(host, box);
  again.focus();
  bindScreenKeys({ Escape: () => { location.hash = "#/home"; } });
}

function paintNothing() {
  const s = store.get();
  setTitle(T.menu.trainer);
  sessionBar(null);

  const box = el("div.stack");
  if (S.allow && S.allow.why === "rule") {
    box.appendChild(note("calm", T.trainer.noNewRule));
    box.appendChild(el("a.btn", { href: "#/home" }, T.trainer.toRule));
  }
  if (S.allow && S.allow.why === "sync" && s.partner) {
    box.appendChild(note("wait", T.home.waiting(s.partner.name)));
  }
  box.appendChild(note("calm", T.trainer.nothing));

  const anyway = el("button.btn", { type: "button", text: T.trainer.anyway });
  anyway.addEventListener("click", () => {
    const st = store.get();
    const extra = sch.buildSession(st.content, st.progress, st.partnerProgress,
      { ...st.settings, debt_limit: 100000 }, db.today(), {
        mode: "repeat", partnerExists: !!st.partner, hasGerman: st.voiceOk, force: true
      });
    if (!extra.queue.length) {
      // досрочных повторений тоже нет: честно говорим и не прячем кнопку
      box.appendChild(el("p.small.dim", { text: T.words.emptyList }));
      return;
    }
    S = extra;
    S.at = 0;
    paint();
  });

  box.appendChild(el("div.row", anyway,
    el("a.btn", { href: "#/game" }, T.trainer.toGame),
    el("a.btn", { href: "#/home" }, T.trainer.toHome)
  ));
  put(host, box);
  bindScreenKeys({ Escape: () => { location.hash = "#/home"; } });
}
