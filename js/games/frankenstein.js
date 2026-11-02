// Франкенштейн: настоящее немецкое составное слово, они пишут, что оно значит.
// Запинки здесь не записываются: это другие слова, не из основного словаря.

import { el, put, clear } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as chk from "../check.js";
import * as tts from "../tts.js";
import { germanField, bindScreenKeys } from "../keys.js";
import { note, speakBtn, say, sayIfAuto, sound, setTitle } from "../ui.js";

const CIRCLE = 8;
let live = null;

export function mount(root) {
  const s = store.get();
  const list = (s.content && s.content.compounds) || [];
  setTitle("Франкенштейн");
  if (!list.length) {
    put(root, el("div.stack",
      note("soft", T.err.noContent),
      el("a.btn", { href: "#/game" }, T.game.toMap)
    ));
    return;
  }
  start(root, list);
  return () => unmount();
}

export function unmount() { tts.stop(); live = null; }

function start(root, list) {
  live = { root, queue: shuffle(list).slice(0, CIRCLE), at: 0, right: 0 };
  paint();
}

function paint() {
  const { root, queue, at } = live;
  if (at >= queue.length) return finish();

  const item = queue[at];
  const full = (item.article ? item.article + " " : "") + item.de;

  const field = germanField({ "aria-label": T.game.frankQ });
  const btn = el("button.btn.btn-main", { type: "button", text: T.trainer.checkBtn });
  const partsBtn = el("button.btn", { type: "button", text: T.game.frankParts, disabled: true });
  const answer = el("div.answer-zone", { hidden: true });

  put(root, el("div.stack",
    el("p.circle-count", { text: T.game.wordNum(at + 1, queue.length) }),
    el("div.ask-word", el("span.word-big", { text: full }), speakBtn(full)),
    el("label.label", { text: T.game.frankQ }),
    field,
    el("div.row", btn, partsBtn),
    answer,
    el("a.btn-text", { href: "#/game" }, T.game.exit)
  ));
  field.focus();
  sayIfAuto(full);

  const showParts = () => {
    clear(answer);
    answer.hidden = false;
    answer.appendChild(el("p.de", { text: full }));
    answer.appendChild(el("p", {
      text: item.parts.map((p) => p.de + " (" + p.ru + ")").join(" + ") + " = " + item.ru
    }));
    answer.appendChild(speakBtn(full));
  };
  partsBtn.addEventListener("click", showParts);

  function check() {
    if (btn.disabled) return;
    const r = chk.checkRussian(field.value, [item.ru, ...(item.ru_ok || [])]);
    btn.disabled = true;
    field.disabled = true;
    partsBtn.disabled = false;
    if (r.ok) { live.right++; sound(r.almost ? "almost" : "right"); }
    showParts();
    if (r.almost) answer.insertBefore(el("p.small", { text: T.trainer.almost }), answer.firstChild);

    const next = el("button.btn.btn-main", { type: "button", text: T.common.ok });
    next.addEventListener("click", () => { live.at++; paint(); });
    answer.appendChild(next);
    next.focus();
    bindScreenKeys({ Enter: () => { live.at++; paint(); }, Escape: () => { location.hash = "#/game"; } });
  }

  btn.addEventListener("click", check);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } });
  bindScreenKeys({ Escape: () => { location.hash = "#/game"; } });
}

function finish() {
  const { root, queue, right } = live;
  db.logGame("frankenstein", { right, of: queue.length });

  const again = el("button.btn.btn-main", { type: "button", text: T.game.nextCircle });
  again.addEventListener("click", () => {
    const list = (store.get().content.compounds) || [];
    start(root, list);
  });

  put(root, el("div.stack",
    el("p.h-block", { text: T.game.guessed(right, queue.length) }),
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
