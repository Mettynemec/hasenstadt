// Экран ГЛАВНАЯ. Отвечает на один вопрос: что делать сейчас.

import { el, put } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import * as content from "../content.js";
import * as mascot from "../mascot.js";
import { note, checkBtn, renderMd, ico, pbar } from "../ui.js";
import { paintInvites } from "./games.js";

let off = null;

export function mount(root) {
  paint(root);
  const offs = ["progress", "settings", "partner", "partnerProgress", "dayLogAll"]
    .map((k) => store.on(k, () => paint(root)));
  off = () => { for (const f of offs) f(); };
  db.refreshPartner();
  return () => { if (off) off(); off = null; };
}

export function unmount() { if (off) off(); off = null; }

function paint(root) {
  const s = store.get();
  const c = s.content;
  if (!c || !c.topics.length) { put(root, note("soft", T.err.noContent)); return; }

  const box = el("div.stack");
  const steps = sch.pathStatus(c, s.progress);
  const current = steps.find((x) => x.state === "open");

  box.appendChild(whereCard(current, c, s));
  box.appendChild(el("a.btn.btn-main", { href: "#/trainer/repeat" }, T.home.repeatBtn));
  box.appendChild(pathRibbon(steps));
  box.appendChild(competeCard(s));

  box.appendChild(el("div.home-games",
    el("a.tile", { href: "#/game/city/wohnung" },
      el("div.row-tight", ico("home", 20), el("b", { text: T.home.cityLink }))),
    el("a.tile", { href: "#/game/sketch" },
      el("div.row-tight", ico("words", 20), el("b", { text: T.home.sketchLink })))
  ));

  const invite = el("div");
  box.appendChild(invite);
  put(root, box);
  paintInvites(invite);
}

// ── где вы сейчас ───────────────────────────────────

function whereCard(current, c, s) {
  if (!current) return allDoneCard(c, s);
  if (current.kind === "rule") return rulePanel(current.item, s);
  return wordsPanel(current.item, c, s);
}

function allDoneCard(c, s) {
  const box = el("div.card.card-accent");
  const noProgress = !Object.keys(s.progress.byWordId).length && !Object.keys(s.progress.rules).length;
  if (noProgress && c.path && c.path.length) {
    const first = c.path[0];
    const title = first.type === "rule"
      ? (c.rulesById[first.id] ? c.rulesById[first.id].title : "")
      : ((c.topics.find((t) => t.id === first.topic) || {}).title_ru || "");
    box.appendChild(el("p.h-block", { text: T.home.firstTime(title) }));
  } else {
    box.appendChild(el("p.h-block", { text: T.home.allDone }));
  }
  return box;
}

function rulePanel(rule, s) {
  const box = el("div.card.card-accent.rule-box");
  box.appendChild(el("p.h-block", { text: T.home.ruleNow(rule.title) }));

  const textBox = el("div", { hidden: true });
  const cached = content.ruleTextCached(rule.id);

  const addText = (md) => {
    if (md) {
      const btn = el("button.btn", { type: "button", text: T.home.read });
      btn.addEventListener("click", () => {
        const open = !textBox.hidden;
        textBox.hidden = open;
        btn.textContent = open ? T.home.read : T.home.hideRead;
        if (!open && !textBox.firstChild) textBox.appendChild(renderMd(md));
      });
      box.insertBefore(btn, textBox);
    } else {
      box.insertBefore(el("p.small.dim", { text: T.home.noRuleText }), textBox);
    }
  };

  box.appendChild(textBox);
  if (cached === undefined) content.ruleText(rule.id, s.config && s.config.CONTENT_VERSION).then(addText);
  else addText(cached);

  box.appendChild(checkBtn(T.home.check, false, (on) => db.saveRule(rule.id, on)));
  box.appendChild(el("p.small.dim", { text: T.home.beforeCheck }));
  return box;
}

function wordsPanel(topic, c, s) {
  const words = c.byTopic[topic.id] || [];
  const total = words.length;
  let opened = 0, bronzeUp = 0;
  for (const w of words) {
    const p = s.progress.byWordId[w.id];
    if (!p) continue;
    opened++;
    if (p.hard || Number(p.grade) >= 3) bronzeUp++;
  }

  const box = el("div.card.card-accent");
  box.appendChild(el("p.h-block", { text: T.home.wordsNow(topic.title_ru) }));
  box.appendChild(pbar(total ? bronzeUp / total : 0));
  box.appendChild(el("p.small.dim", { text: T.home.openOf(opened, total) + " · " + T.home.bronzeUp(bronzeUp) }));

  if (opened < total) {
    const debt = sch.debtList(c, s.progress, db.today());
    const limit = Number(s.settings.debt_limit) || 80;
    if (debt.length > limit) box.appendChild(note("calm", T.home.newOff));
    else box.appendChild(el("a.btn.btn-main", { href: "#/trainer/new/" + topic.id }, T.home.learnNew));
  } else {
    box.appendChild(el("p.small.dim", { text: T.home.noNewLeft }));
  }
  return box;
}

// ── лента пути ──────────────────────────────────────

function pathRibbon(steps) {
  if (!steps.length) return el("div");
  const curIdx = steps.findIndex((x) => x.state === "open");
  const from = curIdx < 0 ? Math.max(0, steps.length - 3) : Math.max(0, curIdx - 1);
  const slice = steps.slice(from, from + 4);

  const row = el("div.path-ribbon");
  for (const st of slice) {
    const title = st.kind === "rule" ? st.item.title : st.item.title_ru;
    const icon = st.state === "done" ? "check" : (st.state === "open" ? "dash" : "lock");
    row.appendChild(el("span.path-step", { data: { state: st.state } },
      ico(icon, 16), el("span", { text: title })
    ));
  }
  return row;
}

// ── соревнование ─────────────────────────────────────

function competeCard(s) {
  const today = db.today();
  const myName = s.me.name;
  const mine = sch.pointsFor(s.dayLogAll, s.me.id, s.progress.today, today);
  const lvl = sch.levelOf(mine.total);

  const box = el("div.card.pair-strip");
  const lines = el("div.pair-lines");
  lines.appendChild(el("p", { text: T.home.pointsLine(myName, mine.total, mine.week) }));
  lines.appendChild(el("p.small.dim", { text: lvl.name }));

  let myState = "glad", theirState = "glad";
  if (s.partner) {
    const theirs = sch.pointsFor(s.dayLogAll, s.partner.id, s.partnerProgress.today, today);
    lines.appendChild(el("p", { text: T.home.pointsLine(s.partner.name, theirs.total, theirs.week) }));
    const diff = mine.total - theirs.total;
    if (diff > 0) { myState = "proud"; theirState = "leaf"; }
    else if (diff < 0) { myState = "leaf"; theirState = "proud"; }
    lines.appendChild(el("p.small.dim", {
      text: diff === 0 ? T.home.equalPoints : T.home.ahead(diff > 0 ? myName : s.partner.name, Math.abs(diff))
    }));
  } else {
    lines.appendChild(el("p.dim", { text: T.home.partnerNever("Амико") }));
  }

  const myKey = myName === "Амико" ? "amiko" : "matt";
  const theirKey = myKey === "matt" ? "amiko" : "matt";
  const pair = el("div.row-tight");
  pair.appendChild(mascot.make(myKey, 90, myState));
  if (s.partner) pair.appendChild(mascot.make(theirKey, 90, theirState));

  box.appendChild(pair);
  box.appendChild(lines);
  return box;
}
