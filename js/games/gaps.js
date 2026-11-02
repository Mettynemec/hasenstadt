// Пропуски: услышал фразу — вписал пропущенное слово.
// Смягчённая замена диктанта.

import { el, put, clear } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as chk from "../check.js";
import * as tts from "../tts.js";
import { germanField, umlautRow, bindScreenKeys } from "../keys.js";
import { note, speakBtn, say, sayIfAuto, sound, setTitle } from "../ui.js";

const CIRCLE = 10;
const KEY = "gaps_done";
let live = null;

export function mount(root) {
  setTitle("Пропуски");
  const pool = buildPool();
  if (!pool.length) {
    put(root, el("div.stack",
      note("calm", T.game.noPhrases),
      el("a.btn", { href: "#/game" }, T.game.toMap)
    ));
    return;
  }
  start(root, pool);
  return () => unmount();
}

export function unmount() { tts.stop(); live = null; }

// Фразы из phrases.json и из реплик пройденных сцен Города.
function buildPool() {
  const s = store.get();
  const c = s.content;
  if (!c) return [];
  const out = [];

  for (const f of c.phrases || []) {
    const ok = (f.needs_words || []).every((id) => s.progress.byWordId[id]);
    if (!ok) continue;
    if (!f.gap_words || !f.gap_words.length) continue;
    out.push({ de: f.de, ru: f.ru, gaps: f.gap_words });
  }

  for (const place of c.places || []) {
    for (const scene of place.scenes || []) {
      const r = s.progress.scenes[scene.id];
      if (!r || !Number(r.done_count || 0)) continue;
      for (const line of scene.lines || []) {
        if (!line.de) continue;
        const words = String(line.de).replace(/[.,!?;:]/g, "").split(/\s+/);
        const gaps = words.filter((w) => c.words.some((x) => chk.normalizeDe(x.de) === chk.normalizeDe(w)));
        if (gaps.length) out.push({ de: line.de, ru: line.ru || "", gaps });
      }
    }
  }
  return out;
}

function howManyGaps() {
  const s = store.get();
  const manual = s.settings && s.settings.gaps_count;
  if (manual) return Number(manual);
  const done = Number(db.kvGet(KEY, 0));
  if (done < 30) return 1;
  if (done <= 70) return 2;
  return 3;
}

function start(root, pool) {
  live = { root, pool, queue: shuffle(pool).slice(0, CIRCLE), at: 0, right: 0, stumbles: new Set() };
  paint();
}

function paint() {
  const { root, queue, at } = live;
  if (at >= queue.length) return finish();

  const s = store.get();
  const item = queue[at];
  const want = howManyGaps();
  const tokens = String(item.de).split(/\s+/);

  // вырезаются только слова из gap_words, служебные не вырезаются никогда
  const candidates = [];
  tokens.forEach((t, i) => {
    const bare = t.replace(/[.,!?;:]/g, "");
    if (item.gaps.some((g) => chk.normalizeDe(g) === chk.normalizeDe(bare))) candidates.push(i);
  });
  const cut = shuffle(candidates).slice(0, Math.max(1, Math.min(want, candidates.length))).sort((a, b) => a - b);

  const phrase = el("p.phrase-line");
  const fields = [];
  tokens.forEach((t, i) => {
    if (cut.includes(i)) {
      const bare = t.replace(/[.,!?;:]/g, "");
      const tail = t.slice(bare.length);
      const f = germanField({ class: "gap-input", "aria-label": T.game.gapsTitle });
      f.style.minWidth = Math.max(5, bare.length + 1) + "ch";
      f.dataset.want = bare;
      fields.push(f);
      phrase.appendChild(f);
      if (tail) phrase.appendChild(document.createTextNode(tail));
    } else {
      phrase.appendChild(document.createTextNode(t));
    }
    phrase.appendChild(document.createTextNode(" "));
  });

  const listen = el("button.btn", { type: "button", text: T.trainer.listenMore });
  listen.addEventListener("click", () => say(item.de));
  const btn = el("button.btn.btn-main", { type: "button", text: T.trainer.checkBtn });
  const answer = el("div.answer-zone", { hidden: true });

  const counter = el("div.row");
  for (const n of [1, 2, 3]) {
    const b = el("button.chip", { type: "button", text: String(n), aria: { pressed: String(want === n) } });
    b.addEventListener("click", () => { db.saveSettings({ gaps_count: n }); paint(); });
    counter.appendChild(b);
  }

  put(root, el("div.stack",
    el("p.circle-count", { text: T.game.phraseNum(at + 1, queue.length) }),
    el("p.h-block", { text: T.game.gapsTitle }),
    el("div.row", el("button.btn.btn-main", { type: "button", text: T.trainer.listen, on: { click: () => say(item.de) } }), listen),
    phrase,
    fields.length ? umlautRow(fields[0]) : null,
    btn,
    answer,
    el("div.row", el("span.small.dim", { text: T.game.gapsCount + ":" }), counter),
    el("a.btn-text", { href: "#/game" }, T.game.exit)
  ));
  sayIfAuto(item.de);
  if (fields[0]) fields[0].focus();

  for (const [i, f] of fields.entries()) {
    f.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (i + 1 < fields.length) fields[i + 1].focus();
        else check();
      }
    });
  }

  function check() {
    if (btn.disabled) return;
    let ok = true;
    let almost = false;
    for (const f of fields) {
      const r = chk.checkGap(f.value, f.dataset.want);
      if (!r.ok) {
        ok = false;
        const w = store.get().content.words.find((x) => chk.normalizeDe(x.de) === chk.normalizeDe(f.dataset.want));
        if (w) live.stumbles.add(w.id);
      } else if (r.almost) almost = true;
      f.disabled = true;
    }
    btn.disabled = true;
    if (ok) { live.right++; sound(almost ? "almost" : "right"); }

    clear(answer);
    answer.hidden = false;
    answer.appendChild(el("p.de", { text: item.de }));
    if (almost) answer.appendChild(el("p.small", { text: T.trainer.almost }));
    if (item.ru) answer.appendChild(el("p.small.dim", { text: item.ru }));
    answer.appendChild(speakBtn(item.de));
    say(item.de);

    const next = el("button.btn.btn-main", { type: "button", text: T.common.ok });
    next.addEventListener("click", step);
    answer.appendChild(next);
    next.focus();
    bindScreenKeys({ Enter: step, Escape: () => { location.hash = "#/game"; } });
  }

  function step() {
    db.kvSet(KEY, Number(db.kvGet(KEY, 0)) + 1);
    live.at++;
    paint();
  }

  btn.addEventListener("click", check);
  bindScreenKeys({ "Alt+Enter": () => say(item.de), Escape: () => { location.hash = "#/game"; } });
}

function finish() {
  const { root, queue, right } = live;
  const s = store.get();
  for (const id of live.stumbles) {
    const p = s.progress.byWordId[id];
    if (!p) continue;
    db.saveWord(id, { game_stumbles: Number(p.game_stumbles || 0) + 1 });
  }
  db.logGame("gaps", { right, of: queue.length });

  const again = el("button.btn.btn-main", { type: "button", text: T.game.nextCircle });
  again.addEventListener("click", () => start(root, buildPool()));

  put(root, el("div.stack",
    el("p.h-block", { text: T.game.rightOf(right, queue.length) }),
    again,
    el("a.btn", { href: "#/game" }, T.game.exit)
  ));
  again.focus();
  bindScreenKeys({ Escape: () => { location.hash = "#/game"; } });
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
