// Экран ПРОГРЕСС. Карточки по каждому, очки и уровни, золото по неделям,
// прогноз — и ниже привычная таблица по блокам и Город.

import { el, put } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import { note, setTitle } from "../ui.js";

const WEEKS = 8;

export function mount(root) {
  const s = store.get();
  const c = s.content;
  if (!c || !c.words.length) { put(root, note("soft", T.err.noContent)); return; }
  setTitle(T.menu.progress);

  const main = c.words.filter((w) => {
    const t = c.topics.find((x) => x.id === w.topic);
    return t && !t.bonus;
  });
  const today = db.today();

  const box = el("div.stack");

  box.appendChild(personCard(s.me.name, s.progress, main, s, today));
  if (s.partner) box.appendChild(personCard(s.partner.name, s.partnerProgress, main, s, today, s.partner.id));

  box.appendChild(goldChart(s, main.length, today));

  box.appendChild(el("h2.h-block", { text: T.progress.byTopic }));
  box.appendChild(topicTable(s, c));
  box.appendChild(el("p.small.dim", { text: T.progress.cellNote }));

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

// ── карточка человека: число, шкала, очки, уровень, прогноз ──

function personCard(name, side, main, s, today, userId) {
  const counts = { bronze: 0, silver: 0, gold: 0 };
  for (const w of main) {
    const st = sch.stateOf(side.byWordId[w.id]);
    if (counts[st] !== undefined) counts[st]++;
  }
  const learned = counts.bronze + counts.silver + counts.gold;
  const myId = userId || s.me.id;
  const pts = sch.pointsFor(s.dayLogAll, myId, side.today, today);
  const lvl = sch.levelOf(pts.total);
  const fc = sch.goldForecast(side, main.length, today);

  const box = el("div.card.card-accent.progress-card");
  box.appendChild(el("div.row-tight",
    el("p.word-big", { text: name }),
    el("span.small.dim", { text: lvl.name })
  ));
  box.appendChild(el("p.h-screen", { text: T.progress.learnedCard(learned, main.length) }));

  const scale = el("div.scale3");
  for (const [key, n] of [["bronze", counts.bronze], ["silver", counts.silver], ["gold", counts.gold]]) {
    const pct = main.length ? Math.round((n / main.length) * 100) : 0;
    scale.appendChild(el("span.scale3-seg", { data: { k: key }, style: { width: pct + "%" } }));
  }
  box.appendChild(scale);
  box.appendChild(el("div.row-tight.small.dim",
    el("span", { text: T.progress.scaleBronze + " " + counts.bronze }),
    el("span", { text: T.progress.scaleSilver + " " + counts.silver }),
    el("span", { text: T.progress.scaleGold + " " + counts.gold })
  ));

  box.appendChild(el("p", { text: T.progress.pointsTotal(pts.total) + " · " + T.progress.pointsWeek(pts.week) }));

  box.appendChild(el("p.small.dim", {
    text: fc.left === 0 ? T.progress.forecastDone
      : fc.enough ? T.progress.forecastLine(humanDate(fc.etaDate))
      : T.progress.forecastNone
  }));

  return box;
}

function humanDate(iso) {
  const [y, m, d] = String(iso).split("-");
  return d + "." + m + "." + y;
}

// ── золото по неделям, вручную в CSS, без библиотек ──

function goldChart(s, total, today) {
  const mineDates = sch.goldDates(s.progress);
  const theirDates = s.partner ? sch.goldDates(s.partnerProgress) : [];

  const buckets = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const end = sch.addDays(today, -7 * i);
    const start = sch.addDays(end, -6);
    buckets.push({ start, end, mine: 0, theirs: 0 });
  }
  const put1 = (d, key) => { const b = buckets.find((x) => d >= x.start && d <= x.end); if (b) b[key]++; };
  for (const d of mineDates) put1(d, "mine");
  for (const d of theirDates) put1(d, "theirs");

  const max = Math.max(1, ...buckets.map((b) => Math.max(b.mine, b.theirs)));

  const box = el("div.card.card-accent");
  box.appendChild(el("p.h-block", { text: T.progress.goldChartTitle }));
  const chart = el("div.gold-chart");
  for (const b of buckets) {
    const col = el("div.gold-col");
    col.appendChild(el("div.gold-bars",
      el("span.gold-bar.mine", { style: { height: Math.round((b.mine / max) * 100) + "%" }, title: String(b.mine) }),
      s.partner ? el("span.gold-bar.theirs", { style: { height: Math.round((b.theirs / max) * 100) + "%" }, title: String(b.theirs) }) : null
    ));
    col.appendChild(el("span.small.dim", { text: shortDate(b.end) }));
    chart.appendChild(col);
  }
  box.appendChild(chart);
  return box;
}

function shortDate(iso) {
  const [, m, d] = String(iso).split("-");
  return d + "." + m;
}

// ── по блокам (как было) ──

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
