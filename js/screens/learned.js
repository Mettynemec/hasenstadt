// Экран ВЫУЧЕННОЕ: бронза, серебро, золото.

import { el, put, clear } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import { dictLine, canonical } from "../check.js";
import { note, dot, lockIcons, speakBtn, switchBtn, modal, setTitle } from "../ui.js";
import { toGold, toBronze, toSilver, toHard, fromHard, backToTrainer, resetLocks } from "./words.js";

const TABS = ["hard", "plain", "bronze", "silver", "gold"];
const view = { tab: "gold", sort: "abc", query: "", partner: false, onlyStumbled: false, openId: null };
let offStore = null;

export function mount(root) {
  paint(root);
  offStore = store.on("progress", () => paint(root));
  return () => unmount();
}

export function unmount() { if (offStore) { offStore(); offStore = null; } }

function paint(root) {
  const s = store.get();
  const c = s.content;
  if (!c) { put(root, note("soft", T.err.noContent)); return; }
  setTitle(T.menu.learned);

  const side = view.partner && s.partner ? s.partnerProgress : s.progress;
  const readOnly = view.partner && !!s.partner;

  const counts = { hard: 0, plain: 0, bronze: 0, silver: 0, gold: 0 };
  for (const p of Object.values(side.byWordId)) {
    const st = sch.stateOf(p);
    if (counts[st] !== undefined) counts[st]++;
  }

  const box = el("div.stack");

  const tabs = el("div.tabs", { role: "tablist" });
  for (const key of TABS) {
    const b = el("button.tab", { type: "button", role: "tab", aria: { selected: String(view.tab === key) } },
      el("span", { text: T.words.tabs[key] }),
      el("span.small.dim", { text: " " + counts[key] })
    );
    b.addEventListener("click", () => { view.tab = key; view.openId = null; paint(root); });
    tabs.appendChild(b);
  }
  box.appendChild(tabs);
  // «Изученное» легко спутать с названием экрана — поясняем прямо под вкладкой
  if (view.tab === "plain") box.appendChild(el("p.small.dim", { text: T.words.plainNote }));

  const tools = el("div.row");
  for (const [key, label] of [["abc", T.words.sortAbc], ["topic", T.words.sortTopic], ["date", T.words.sortDate]]) {
    const b = el("button.chip", { type: "button", text: label, aria: { pressed: String(view.sort === key) } });
    b.addEventListener("click", () => { view.sort = key; paint(root); });
    tools.appendChild(b);
  }
  box.appendChild(tools);

  const search = el("input.field", { type: "search", placeholder: T.words.find, value: view.query, "aria-label": T.words.find });
  search.addEventListener("input", () => { view.query = search.value; rows(); });
  box.appendChild(search);

  if (view.tab === "gold") {
    box.appendChild(switchBtn(T.words.onlyStumbled, view.onlyStumbled, (on) => { view.onlyStumbled = on; paint(root); }));
  }
  if (s.partner) {
    box.appendChild(switchBtn(T.words.showPartner(s.partner.name), view.partner, (on) => { view.partner = on; paint(root); }));
  }
  if (readOnly) box.appendChild(note("calm", T.words.partnerOnly(s.partner.name)));

  const list = el("div");
  box.appendChild(list);
  put(root, box);

  function rows() {
    const q = view.query.trim().toLowerCase();
    let items = [];
    for (const [id, p] of Object.entries(side.byWordId)) {
      const w = c.wordsById[id];
      if (!w) continue;
      if (sch.stateOf(p) !== view.tab) continue;
      if (view.tab === "gold" && view.onlyStumbled && !Number(p.game_stumbles || 0)) continue;
      if (q && !(w.ru + " " + w.de + " " + w.tr).toLowerCase().includes(q)) continue;
      items.push({ w, p });
    }
    items = sortItems(items, c);

    clear(list);
    if (!items.length) {
      const empty = { hard: T.words.emptyHard, plain: T.words.emptyPlain,
        bronze: T.words.emptyBronze, silver: T.words.emptySilver, gold: T.words.emptyGold }[view.tab];
      list.appendChild(el("p.small.dim", { text: empty }));
      return;
    }
    for (const it of items) list.appendChild(row(it.w, it.p, readOnly, () => paint(root)));
  }
  rows();
}

function sortItems(items, c) {
  if (view.sort === "abc") return items.sort((a, b) => a.w.de.localeCompare(b.w.de, "de"));
  if (view.sort === "topic") {
    const order = {};
    c.topics.forEach((t, i) => { order[t.id] = i; });
    return items.sort((a, b) => (order[a.w.topic] - order[b.w.topic]) || (a.w.order - b.w.order));
  }
  return items.sort((a, b) => {
    const da = a.p.gold_at || a.p.updated_at || "";
    const dbb = b.p.gold_at || b.p.updated_at || "";
    return String(dbb).localeCompare(String(da));
  });
}

function row(w, p, readOnly, redraw) {
  const wrap = el("div");
  const line = el("button.wline", { type: "button", aria: { expanded: String(view.openId === w.id) } },
    dot(sch.stateOf(p)),
    el("span.txt", el("b", dictLine(w, store.get().settings))),
    Number(p.game_stumbles || 0) > 0 ? el("span.small.dim", { text: " · " + T.words.stumble }) : null
  );
  line.addEventListener("click", () => { view.openId = view.openId === w.id ? null : w.id; redraw(); });

  const head = el("div.row-tight", line, speakBtn(canonical(w)));
  head.style.display = "flex";
  line.style.flex = "1 1 auto";
  wrap.appendChild(head);

  if (view.openId === w.id) {
    const s = store.get();
    const box = el("div.wdetail");
    if (w.phrase_de) {
      box.appendChild(el("div.row-tight", el("span.small", { text: w.phrase_de }),
        w.phrase_ru ? el("span.small.dim", { text: " — " + w.phrase_ru }) : null, speakBtn(w.phrase_de)));
    }
    const st = sch.stateOf(p);
    if (st !== "hard") {
      box.appendChild(lockIcons(p, T.words.locks));
      box.appendChild(el("p.small.dim", {
        text: T.words.shows(Number(p.shows || 0)) + " · " + T.words.errors(Number(p.errors || 0))
      }));
    }

    if (!readOnly) {
      const r = el("div.row");

      if (st === "hard") {
        const take = el("button.btn", { type: "button", text: T.words.fromHard });
        take.addEventListener("click", () => fromHard(w, redraw));
        r.appendChild(take);
        box.appendChild(r);
        wrap.appendChild(box);
        return wrap;
      }

      const back = el("button.btn", { type: "button", text: T.words.back });
      back.addEventListener("click", () => {
        if (p.grade === 5) {
          modal({ text: T.words.backConfirm, okText: T.common.yes, cancelText: T.common.no,
            onOk: () => { backToTrainer(w); redraw(); } });
        } else { backToTrainer(w); redraw(); }
      });
      r.appendChild(back);

      if (p.grade !== 5) {
        const a = el("button.btn", { type: "button", text: T.words.askNow });
        a.addEventListener("click", () => { db.saveWord(w.id, { next_due: db.today() }); redraw(); });
        r.appendChild(a);
      }

      const res = el("button.btn", { type: "button", text: T.words.resetLocks });
      res.addEventListener("click", () => {
        modal({ text: T.words.resetConfirm, okText: T.common.yes, cancelText: T.common.no,
          onOk: () => { resetLocks(w); redraw(); } });
      });
      r.appendChild(res);

      const hardBtn = el("button.btn", { type: "button", text: T.words.toHard });
      hardBtn.addEventListener("click", () => toHard(w, redraw));
      r.appendChild(hardBtn);

      // ручной перевод на следующий уровень — в самом конце строки действий
      if (st === "plain") {
        const b = el("button.btn", { type: "button", text: T.words.toBronze });
        b.addEventListener("click", () => toBronze(w, redraw));
        r.appendChild(b);
      } else if (st === "bronze") {
        const b = el("button.btn", { type: "button", text: T.words.toSilver });
        b.addEventListener("click", () => toSilver(w, redraw));
        r.appendChild(b);
      } else if (st === "silver") {
        const g = el("button.btn", { type: "button", text: T.words.toGold });
        g.addEventListener("click", () => toGold(w, p, s.voiceOk, redraw));
        r.appendChild(g);
      }

      box.appendChild(r);
    }
    wrap.appendChild(box);
  }
  return wrap;
}
