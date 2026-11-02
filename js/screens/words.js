// Экран СЛОВА: список блоков и экран одного блока.

import { el, put, clear } from "../el.js";
import { T, words as wordsN } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import * as tts from "../tts.js";
import { dictLine } from "../check.js";
import { note, pbar, dot, lockIcons, ico, speakBtn, say, switchBtn, modal, toast, setTitle } from "../ui.js";

let stopSpeakAll = null;
let offStore = null;

export function mount(root, params) {
  if (params && params.topicId) paintTopic(root, params.topicId);
  else paintList(root);
  offStore = store.on("progress", () => {
    if (params && params.topicId) paintTopic(root, params.topicId, true);
    else paintList(root);
  });
  return () => unmount();
}

export function unmount() {
  if (stopSpeakAll) { stopSpeakAll(); stopSpeakAll = null; }
  if (offStore) { offStore(); offStore = null; }
  tts.stop();
}

// ── список блоков ──────────────────────────────────

function paintList(root) {
  const s = store.get();
  const c = s.content;
  if (!c || !c.topics.length) { put(root, note("soft", T.err.noContent)); return; }

  setTitle(T.menu.words);
  const box = el("div.stack");
  const current = sch.currentTopic(c, s.progress);

  for (const t of c.topics.filter((x) => !x.bonus)) {
    box.appendChild(topicTile(t, s, c, current));
  }
  const bonus = c.topics.filter((x) => x.bonus);
  for (const t of bonus) box.appendChild(bonusTile(t, s, c));

  put(root, box);
}

function topicTile(t, s, c, current) {
  const list = c.byTopic[t.id] || [];
  const closed = sch.isTopicClosed(t.id, s.progress, s.partnerProgress, c, !!s.partner);
  const reached = list.some((w) => s.progress.byWordId[w.id]) || (current && current.id === t.id);
  const locked = !closed && !reached;

  const state = closed ? "check" : (current && current.id === t.id ? "dash" : "lock");
  const tile = el("a.tile.topic-tile", { href: "#/words/" + t.id, data: { locked: String(locked) } },
    el("div.topic-head",
      el("span.h-block", { text: t.title_ru }),
      t.title_de ? el("span.dim", { text: t.title_de }) : null,
      el("span.topic-state", ico(state, 20),
        el("span", { text: closed ? "закрыт" : (current && current.id === t.id ? "сейчас" : "впереди") }))
    ),
    el("p.small.dim", { text: wordsN(list.length) }),
    sideBars(s, c, t)
  );
  return tile;
}

function bonusTile(t, s, c) {
  const list = c.byTopic[t.id] || [];
  const taken = takenBonus(s.settings).includes(t.id);
  const box = el("div.card.bonus-tile.stack-s",
    el("div.topic-head",
      el("a", { href: "#/words/" + t.id, class: "h-block" }, t.title_ru),
      t.title_de ? el("span.dim", { text: t.title_de }) : null
    ),
    el("p.small.dim", { text: wordsN(list.length) }),
    sideBars(s, c, t),
    el("button.btn", { type: "button", text: taken ? T.words.bonusDrop : T.words.bonusTake,
      on: { click: () => toggleBonus(t.id) } }),
    el("p.small.dim", { text: T.words.bonusNote })
  );
  return box;
}

function sideBars(s, c, t) {
  const list = c.byTopic[t.id] || [];
  const row = el("div.stack-s");
  row.appendChild(sideLine(s.me.name, s.progress, list));
  if (s.partner) row.appendChild(sideLine(s.partner.name, s.partnerProgress, list));
  return row;
}

function sideLine(name, side, list) {
  const open = list.filter((w) => side.byWordId[w.id]).length;
  const gold = list.filter((w) => side.byWordId[w.id] && side.byWordId[w.id].grade === 5).length;
  return el("div.stack-s",
    el("div.row-tight",
      el("span.small.dim", { text: name }),
      el("span.small", { text: "открыто " + open + " из " + list.length + ", в золоте " + gold })
    ),
    pbar(list.length ? open / list.length : 0)
  );
}

function takenBonus(settings) {
  const v = settings && settings.bonus_topics;
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { return JSON.parse(v) || []; } catch (e) { return []; }
}

function toggleBonus(id) {
  const s = store.get();
  const cur = takenBonus(s.settings);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  db.saveSettings({ bonus_topics: next });
  store.set({ progress: s.progress });   // перерисовать
}

// ── экран одного блока ─────────────────────────────

const view = { filter: "all", query: "", partner: false, openId: null };

function paintTopic(root, topicId, keep) {
  const s = store.get();
  const c = s.content;
  const t = c && c.topics.find((x) => x.id === topicId);
  if (!t) { location.replace("#/words"); return; }
  if (!keep) { view.filter = "all"; view.query = ""; view.partner = false; view.openId = null; }

  setTitle(t.title_ru);
  const list = c.byTopic[t.id] || [];
  const side = view.partner && s.partner ? s.partnerProgress : s.progress;
  const readOnly = view.partner && !!s.partner;

  const reached = list.some((w) => s.progress.byWordId[w.id]);
  const current = sch.currentTopic(c, s.progress);
  const notStarted = !t.bonus && !reached && !(current && current.id === t.id);

  const box = el("div.stack");

  box.appendChild(el("div.row",
    el("a.btn", { href: "#/words" }, "← " + T.menu.words),
    el("span.grow"),
    t.title_de ? el("span.dim", { text: t.title_de }) : null
  ));

  if (notStarted) box.appendChild(note("calm", T.words.closedTopic));
  box.appendChild(sideBars(s, c, t));

  const speakAll = el("button.btn", { type: "button", text: T.words.speakAll });
  const stopBtn = el("button.btn", { type: "button", text: T.words.stop, hidden: true });
  speakAll.addEventListener("click", () => startSpeakAll(list, speakAll, stopBtn));
  stopBtn.addEventListener("click", () => { if (stopSpeakAll) stopSpeakAll(); });
  box.appendChild(el("div.row", speakAll, stopBtn));

  if (s.partner) {
    box.appendChild(switchBtn(T.words.showPartner(s.partner.name), view.partner, (on) => {
      view.partner = on;
      paintTopic(root, topicId, true);
    }));
  }
  if (readOnly) box.appendChild(note("calm", T.words.partnerOnly(s.partner.name)));

  // фильтры и поиск
  const chips = el("div.chips");
  for (const [key, label] of Object.entries(T.words.filters)) {
    const b = el("button.chip", { type: "button", text: label, aria: { pressed: String(view.filter === key) } });
    b.addEventListener("click", () => { view.filter = key; paintTopic(root, topicId, true); });
    chips.appendChild(b);
  }
  const search = el("input.field", { type: "search", placeholder: T.words.find, value: view.query, "aria-label": T.words.find });
  search.addEventListener("input", () => {
    view.query = search.value;
    paintRows();
  });
  box.appendChild(chips);
  box.appendChild(search);

  const rows = el("div");
  box.appendChild(rows);

  function paintRows() {
    const q = view.query.trim().toLowerCase();
    const shown = list.filter((w) => {
      const p = side.byWordId[w.id];
      if (!passFilter(p, view.filter)) return false;
      if (!q) return true;
      return (w.ru + " " + w.de + " " + w.tr).toLowerCase().includes(q);
    });
    clear(rows);
    if (!shown.length) { rows.appendChild(el("p.small.dim", { text: T.words.emptyList })); return; }
    for (const w of shown) rows.appendChild(wordRow(w, side.byWordId[w.id], readOnly, () => paintTopic(root, topicId, true)));
  }
  paintRows();

  put(root, box);
}

function passFilter(p, f) {
  const st = sch.stateOf(p);
  if (f === "all") return true;
  if (f === "new") return st === "new" || st === "plain";
  if (f === "bronze") return st === "bronze";
  if (f === "silver") return st === "silver";
  if (f === "gold") return st === "gold";
  if (f === "err") return !!p && Number(p.errors || 0) > 0;
  return true;
}

// ── строка слова ───────────────────────────────────

export function wordRow(w, p, readOnly, redraw) {
  const wrap = el("div");
  const line = el("button.wline", { type: "button", aria: { expanded: String(view.openId === w.id) } },
    dot(sch.stateOf(p)),
    el("span.txt", el("b", { text: dictLine(w) })),
    p && Number(p.game_stumbles || 0) > 0 && p.grade === 5
      ? el("span.small.dim", { text: " · " + T.words.stumble }) : null
  );
  const speak = speakBtn(canonicalOf(w));
  const head = el("div.row-tight", { style: { alignItems: "stretch" } }, line, speak);
  head.style.display = "flex";
  line.style.flex = "1 1 auto";

  line.addEventListener("click", () => {
    view.openId = view.openId === w.id ? null : w.id;
    redraw();
  });

  wrap.appendChild(head);
  if (view.openId === w.id) wrap.appendChild(details(w, p, readOnly, redraw));
  return wrap;
}

function canonicalOf(w) {
  const art = w.pos === "noun" && w.article ? w.article + " " : "";
  return art + w.de;
}

function details(w, p, readOnly, redraw) {
  const s = store.get();
  const box = el("div.wdetail");

  if (w.phrase_de) {
    box.appendChild(el("div.row-tight",
      el("span.de", { text: w.phrase_de }),
      w.phrase_ru ? el("span.small.dim", { text: " — " + w.phrase_ru }) : null,
      speakBtn(w.phrase_de)
    ));
  }
  if (w.note) box.appendChild(el("p.small.dim", { text: w.note }));

  box.appendChild(lockIcons(p, T.words.locks));
  box.appendChild(el("p.small.dim", {
    text: T.words.shows(Number((p && p.shows) || 0)) + " · " + T.words.errors(Number((p && p.errors) || 0))
  }));

  if (readOnly) return box;

  const row = el("div.row");
  const gold = p && p.grade === 5;

  if (!gold) {
    const ready = sch.goldReady(p, s.voiceOk);
    const b = el("button.btn", { type: "button", text: T.words.toGold, class: ready ? "" : "btn-dim" });
    b.addEventListener("click", () => toGold(w, p, s.voiceOk, redraw));
    row.appendChild(b);
  } else {
    const b = el("button.btn", { type: "button", text: T.words.back });
    b.addEventListener("click", () => {
      modal({ text: T.words.backConfirm, okText: T.common.yes, cancelText: T.common.no, onOk: () => { backToTrainer(w); redraw(); } });
    });
    row.appendChild(b);
  }

  if (p) {
    const r = el("button.btn", { type: "button", text: T.words.resetLocks });
    r.addEventListener("click", () => {
      modal({ text: T.words.resetConfirm, okText: T.common.yes, cancelText: T.common.no, onOk: () => { resetLocks(w); redraw(); } });
    });
    row.appendChild(r);

    if (!gold) {
      const a = el("button.btn", { type: "button", text: T.words.askNow });
      a.addEventListener("click", () => { db.saveWord(w.id, { next_due: db.today() }); redraw(); });
      row.appendChild(a);
    }
  }

  box.appendChild(row);
  return box;
}

export function toGold(w, p, voiceOk, redraw) {
  const missing = sch.missingLock(p, voiceOk);
  const put2 = () => {
    db.saveWord(w.id, {
      topic_id: w.topic, grade: 5, gold_at: new Date().toISOString(), next_due: null
    });
    if (redraw) redraw();
  };
  if (missing) {
    modal({
      text: T.trainer.goldConfirm(T.words.locks[missing]),
      okText: T.trainer.yes, cancelText: T.trainer.notYet, onOk: put2
    });
  } else put2();
}

export function backToTrainer(w) {
  db.saveWord(w.id, { topic_id: w.topic, grade: 3, next_due: db.today(), gold_at: null });
}

export function resetLocks(w) {
  db.saveWord(w.id, {
    topic_id: w.topic,
    lock_see: false, lock_write: false, lock_hear: false,
    lock_see_day: null, lock_write_day: null, lock_hear_day: null,
    err_see: false, err_write: false, err_hear: false
  });
}

// ── озвучить весь блок по порядку ──────────────────

function startSpeakAll(list, btn, stopBtn) {
  let i = 0;
  let alive = true;
  btn.hidden = true;
  stopBtn.hidden = false;

  const stop = () => {
    alive = false;
    tts.stop();
    btn.hidden = false;
    stopBtn.hidden = true;
    stopSpeakAll = null;
  };
  stopSpeakAll = stop;

  const step = () => {
    if (!alive || i >= list.length) { stop(); return; }
    const w = list[i++];
    say(canonicalOf(w));
    setTimeout(step, 1700);
  };
  step();
}

export { view };
