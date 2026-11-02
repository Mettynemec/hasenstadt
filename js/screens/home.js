// Экран ГЛАВНАЯ. Отвечает на один вопрос: что делать сейчас.

import { el, put } from "../el.js";
import { T, words as wordsN, cards as cardsN } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import * as content from "../content.js";
import * as mascot from "../mascot.js";
import { note, checkBtn, renderMd, ico } from "../ui.js";
import { paintInvites } from "./games.js";

let off = null;

export function mount(root) {
  paint(root);
  const offs = ["progress", "settings", "partner", "partnerProgress"]
    .map((k) => store.on(k, () => paint(root)));
  off = () => { for (const f of offs) f(); };
  db.refreshPartner();
  return () => { if (off) off(); off = null; };
}

export function unmount() { if (off) off(); off = null; }

function paint(root) {
  const s = store.get();
  const c = s.content;
  const mine = s.progress;
  const theirs = s.partnerProgress;
  const partner = s.partner;
  const today = db.today();

  const box = el("div.stack");

  if (!c || !c.topics.length) {
    put(root, note("soft", T.err.noContent));
    return;
  }

  // ── задание дня ──
  const plan = sch.buildSession(c, mine, theirs, s.settings, today, {
    partnerExists: !!partner,
    hasGerman: s.voiceOk
  });

  // ── правило сейчас ──
  // показываем то правило, которого ждёт текущий блок; когда галочка стоит,
  // плашка сворачивается в одну строку
  const gate = plan.allow && plan.allow.topic && plan.allow.topic.rule_before
    ? c.rulesById[plan.allow.topic.rule_before]
    : null;
  const rule = gate && !sch.ruleDone(mine, gate.id) ? gate : null;
  box.appendChild(rule ? rulePanel(rule, root) : rulePanelDone(c, mine, gate));

  box.appendChild(el("p.day-task", { text: dayLine(plan, partner) }));

  if (plan.cleanup) box.appendChild(note("calm", T.home.cleanup));
  if (plan.allow.why === "sync" && partner) box.appendChild(note("wait", T.home.waiting(partner.name)));
  if (plan.allow.why === "topic" && plan.allow.topic) {
    box.appendChild(note("calm", T.home.topicOpen(
      plan.allow.topic.title_ru,
      sch.topicLeft(plan.allow.topic.id, mine, c),
      partner ? sch.topicLeft(plan.allow.topic.id, theirs, c) : 0,
      partner ? partner.name : "Амико"
    )));
  }

  // ── главная кнопка ──
  box.appendChild(el("a.btn.btn-main", { href: "#/trainer" }, T.home.go));
  box.appendChild(el("a.btn-text", { href: "#/trainer/repeat" }, T.home.onlyRepeat));

  box.appendChild(el("div.home-games",
    el("a.tile", { href: "#/game/city/wohnung" },
      el("div.row-tight", ico("home", 20), el("b", { text: T.game.cityTitle }))),
    el("a.tile", { href: "#/game/sketch" },
      el("div.row-tight", ico("words", 20), el("b", { text: "Сценка" })))
  ));

  // ── полоска пары ──
  box.appendChild(pairStrip(s, c));

  const invite = el("div");
  box.appendChild(invite);
  put(root, box);
  paintInvites(invite);
}

function dayLine(plan, partner) {
  const n = plan.total;
  if (plan.allow.why === "rule") return n ? T.home.taskNoRule(n) : T.home.taskNoRuleEmpty;
  if (plan.cleanup) return T.home.taskDebt(n);
  if (plan.allow.why === "sync" && partner) return T.home.taskWait(n, partner.name);
  if (plan.newPlanned > 0) return T.home.task(n, plan.newPlanned);
  if (n === 0) return T.home.allDone;
  return T.home.taskRepeat(n);
}

// ── плашка правила ─────────────────────────────────

function rulePanel(rule, root) {
  const s = store.get();
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
  if (cached === undefined) {
    content.ruleText(rule.id, s.config && s.config.CONTENT_VERSION).then(addText);
  } else {
    addText(cached);
  }

  box.appendChild(checkBtn(T.home.check, false, (on) => {
    db.saveRule(rule.id, on);
  }));
  box.appendChild(el("p.small.dim", { text: T.home.beforeCheck }));
  return box;
}

function rulePanelDone(c, mine, gate) {
  // галочка стоит: одна строка плюс текст из поля after_text
  const last = gate || [...c.rules].reverse().find((r) => sch.ruleDone(mine, r.id));
  const box = el("div.card.rule-box");
  if (last) {
    box.appendChild(el("p", { text: T.home.ruleNow(last.title) }));
    const next = last.topic_next && c.topics.find((t) => t.id === last.topic_next);
    if (last.after_text) box.appendChild(el("p.small.dim", { text: last.after_text }));
    if (next) box.appendChild(el("a.btn-text", { href: "#/words/" + next.id }, "открыть словарь «" + next.title_ru + "»"));
  } else {
    box.appendChild(el("p.small.dim", { text: T.home.noRuleText }));
  }
  return box;
}

// ── полоска пары ───────────────────────────────────

function pairStrip(s, c) {
  const box = el("div.card.pair-strip");
  const lines = el("div.pair-lines");

  lines.appendChild(el("p", { text: T.home.line(s.me.name, countOpen(s.progress), countGold(s.progress)) }));
  if (s.partner) {
    lines.appendChild(el("p", { text: T.home.line(s.partner.name, countOpen(s.partnerProgress), countGold(s.partnerProgress)) }));
  } else {
    lines.appendChild(el("p.dim", { text: T.home.partnerNever("Амико") }));
  }

  const amiko = mascot.make("amiko", 73, "calm");
  amiko.classList.add("small");
  box.appendChild(mascot.make("matt", 90, "calm"));
  box.appendChild(amiko);
  box.appendChild(lines);
  return box;
}

const countOpen = (side) => Object.keys(side.byWordId).length;
const countGold = (side) => Object.values(side.byWordId).filter((p) => p.grade === 5).length;
