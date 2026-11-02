// Экран ПРОГРЕСС. Только факты, никаких оценок и никаких сравнений.

import { el, put } from "../el.js";
import { T, cards as cardsN } from "../texts.js";
import { store } from "../store.js";
import * as sch from "../scheduler.js";
import { note, dot, setTitle } from "../ui.js";

export function mount(root) {
  const s = store.get();
  const c = s.content;
  if (!c || !c.words.length) { put(root, note("soft", T.err.noContent)); return; }
  setTitle(T.menu.progress);

  const main = c.words.filter((w) => {
    const t = c.topics.find((x) => x.id === w.topic);
    return t && !t.bonus;
  });

  const box = el("div.stack");

  // сверху: сколько выучено
  box.appendChild(el("p.h-block", { text: T.progress.learned(learnedCount(s.progress, main), main.length) }));
  if (s.partner) {
    box.appendChild(el("p.h-block", { text: s.partner.name + ": " + T.progress.learned(learnedCount(s.partnerProgress, main), main.length) }));
  }
  box.appendChild(el("p.small.dim.prose", { text: T.progress.whatCounts }));

  // сетки
  box.appendChild(gridBlock(s.me.name, s.progress, main, c));
  if (s.partner) box.appendChild(gridBlock(s.partner.name, s.partnerProgress, main, c));

  box.appendChild(legend());

  // по блокам
  box.appendChild(el("h2.h-block", { text: T.progress.byTopic }));
  box.appendChild(topicTable(s, c));
  box.appendChild(el("p.small.dim", { text: T.progress.cellNote }));

  // сегодня
  const t1 = s.progress.today || {};
  box.appendChild(el("p", { text: T.progress.today(Number(t1.cards || 0), Number(t1.new_n || 0)) }));
  if (s.partner) {
    const t2 = s.partnerProgress.today || {};
    box.appendChild(el("p", { text: s.partner.name + ": " + T.progress.today(Number(t2.cards || 0), Number(t2.new_n || 0)) }));
  }

  // город
  if (c.places.length) {
    box.appendChild(el("h2.h-block", { text: T.progress.city }));
    const list = el("div.stack-s");
    for (const place of c.places) {
      const total = place.scenes.length;
      const done = place.scenes.filter((sc) => {
        const r = s.progress.scenes[sc.id];
        return r && Number(r.done_count || 0) > 0;
      }).length;
      list.appendChild(el("p.small", { text: place.title_ru + " — " + T.progress.cityLine(done, total) }));
    }
    box.appendChild(list);
  }

  put(root, box);
}

export function unmount() {}

const learnedCount = (side, words) =>
  words.filter((w) => sch.isLearned(side.byWordId[w.id])).length;

function gridBlock(name, side, words, c) {
  const wrap = el("div.stack-s", el("p.small.dim", { text: name }));
  const grid = el("div.sqgrid");
  let lastTopic = null;
  for (const w of words) {
    if (lastTopic !== null && w.topic !== lastTopic) grid.appendChild(el("span.sq.sq-gap"));
    lastTopic = w.topic;
    const st = sch.stateOf(side.byWordId[w.id]);
    grid.appendChild(el("span.sq", { data: { s: st, w: w.id, t: w.topic }, title: w.de + " — " + w.ru }));
  }
  grid.addEventListener("click", (e) => {
    const sq = e.target.closest(".sq");
    if (!sq || !sq.dataset.t) return;
    location.hash = "#/words/" + sq.dataset.t;
  });
  wrap.appendChild(el("div.grid-wrap", grid));
  return wrap;
}

function legend() {
  const row = el("div.legend");
  for (const [key, label] of Object.entries(T.progress.legend)) {
    row.appendChild(el("span", dot(key), el("span", { text: label })));
  }
  return row;
}

function topicTable(s, c) {
  const head = el("tr",
    el("th", { text: T.progress.thTopic }),
    el("th", { text: T.progress.thAll }),
    el("th", { text: s.me.name })
  );
  if (s.partner) head.appendChild(el("th", { text: s.partner.name }));

  const body = el("tbody");
  for (const t of c.topics) {
    const list = c.byTopic[t.id] || [];
    if (!list.length) continue;
    const row = el("tr",
      el("td", { text: t.title_ru }),
      el("td", { text: String(list.length) }),
      el("td", { text: cell(s.progress, list) })
    );
    if (s.partner) row.appendChild(el("td", { text: cell(s.partnerProgress, list) }));
    body.appendChild(row);
  }
  return el("table.tbl", el("thead", head), body);
}

function cell(side, list) {
  let open = 0, b = 0, si = 0, g = 0;
  for (const w of list) {
    const p = side.byWordId[w.id];
    if (!p) continue;
    open++;
    if (p.grade === 3) b++;
    else if (p.grade === 4) si++;
    else if (p.grade === 5) g++;
  }
  return open + " · " + b + " / " + si + " / " + g;
}
