// Общие элементы: меню, шапка, плашки, модальные окна, звуки, значки.

import { el, put, clear } from "./el.js";
import { T } from "./texts.js";
import { store } from "./store.js";
import * as db from "./db.js";
import * as tts from "./tts.js";

// Тема, размер шрифта, анимации. Применяется сразу, без перезагрузки.
export function applyLook(settings) {
  const s = settings || {};
  document.documentElement.dataset.theme = s.theme === "light" ? "light" : "dark";
  document.documentElement.style.fontSize = (Number(s.font_px) || 21) + "px";
  document.body.classList.toggle("no-anim", s.animations === false);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", s.theme === "light" ? "rgb(237, 241, 249)" : "rgb(13, 23, 33)");
}

// ── значки, нарисованные кодом ─────────────────────

const PATHS = {
  home: "M3 11 L11.5 3.5 L20 11 M5.5 9 V19.5 H17.5 V9",
  rules: "M5 4.5 H15.5 L18.5 7.5 V19.5 H5 Z M15.5 4.5 V7.5 H18.5 M8 11.5 H15 M8 15 H13",
  words: "M3.5 6.5 H20 M3.5 11.5 H20 M3.5 16.5 H14",
  trainer: "M3 6.5 H20 V16.5 H3 Z M7.5 11.5 H15.5",
  learned: "M19.5 11.5 A8 8 0 1 1 11.5 3.5 M7.5 11 L10.5 14 L18.5 5.5",
  game: "M11.5 20 C11.5 20 18 13.5 18 9 A6.5 6.5 0 1 0 5 9 C5 13.5 11.5 20 11.5 20 Z M11.5 9 h0.01",
  progress: "M4 19 V11 M9.5 19 V4.5 M15 19 V14 M20 19 V8",
  settings: "M11.5 14.5 A3 3 0 1 0 11.5 8.5 A3 3 0 1 0 11.5 14.5 M11.5 2.5 V5 M11.5 18 V20.5 M3 11.5 H5.5 M17.5 11.5 H20 M5.2 5.2 L7 7 M16 16 L17.8 17.8 M17.8 5.2 L16 7 M7 16 L5.2 17.8",
  more: "M5 11.5 h0.01 M11.5 11.5 h0.01 M18 11.5 h0.01",
  lock: "M7 10 V7.5 A4.5 4.5 0 0 1 16 7.5 V10 M4.5 10 H18.5 V19.5 H4.5 Z",
  unlock: "M7 10 V7.5 A4.5 4.5 0 0 1 16 7.5 M4.5 10 H18.5 V19.5 H4.5 Z",
  check: "M4 12 L9 17 L19 6",
  dash: "M4 11.5 H19",
  speaker: "M4 9 H7 L12 5 V18 L7 14 H4 Z M15.5 8.5 A4.3 4.3 0 0 1 15.5 14.5",
  dot: "M11.5 11.5 h0.01",
  phone: "M6 4 H9.5 L11 8 L9 10 C10 13 12 15 15 16 L17 14 L20.5 15.5 V19 C20.5 19 15 20 10 15 C5 10 6 4 6 4 Z",
  bag: "M6 8 H17 L18 19.5 H5 Z M8.5 8 V6 A3 3 0 0 1 14.5 6 V8",
  street: "M11.5 3 V20 M7 6 H5 V10 H7 M16 13 H18 V17 H16",
  cart: "M3 5 H6 L8.5 15 H18 L20 8 H7 M9 19 h0.01 M17 19 h0.01",
  bus: "M4 6 H19 V15 H4 Z M4 10.5 H19 M7 18 h0.01 M16 18 h0.01 M6 15 V18 M17 15 V18",
  cup: "M5 7 H15 V13 A5 5 0 0 1 5 13 Z M15 8.5 H18 A2 2 0 0 1 18 12.5 H15 M4 19 H16",
  tree: "M11.5 20 V13 M11.5 13 L6 13 L11.5 3.5 L17 13 Z",
  cross: "M9 4 H14 V9 H19 V14 H14 V19 H9 V14 H4 V9 H9 Z",
  heart: "M11.5 19 C11.5 19 4 14 4 9 A3.8 3.8 0 0 1 11.5 7 A3.8 3.8 0 0 1 19 9 C19 14 11.5 19 11.5 19 Z",
  forest: "M7 20 V15 M7 15 L3 15 L7 6 L11 15 Z M16 20 V16 M16 16 L12.5 16 L16 8 L19.5 16 Z",
  film: "M4 5 H19 V18 H4 Z M4 9 H19 M4 14 H19 M8 5 V18 M15 5 V18",
  door: "M6 3 H17 V20 H6 Z M14 11.5 h0.01"
};

export function ico(name, size) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 23 23");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (size) { svg.setAttribute("width", size); svg.setAttribute("height", size); }
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", PATHS[name] || PATHS.dot);
  svg.appendChild(p);
  return svg;
}

// ── каркас ─────────────────────────────────────────

const MENU = [
  ["home", "home", "#/home", false],
  ["rules", "rules", "#/rules", false],
  ["words", "words", "#/words", true],
  ["trainer", "trainer", "#/trainer", false],
  ["learned", "learned", "#/learned", true],
  ["game", "game", "#/game", false],
  ["progress", "progress", "#/progress", true],
  ["settings", "settings", "#/settings", true]
];

let refs = {};

export function buildShell(root, appName) {
  const menu = el("nav.menu", { "aria-label": "меню" });

  for (const [key, icon, href, phoneHide] of MENU) {
    const b = el("a.menu-item" + (phoneHide ? ".phone-hide" : ""), { href },
      ico(icon),
      el("span.menu-label", { text: T.menu[key] })
    );
    b.dataset.key = key;
    menu.appendChild(b);
  }
  const moreBtn = el("button.menu-item.menu-more", { type: "button", aria: { expanded: "false" } },
    ico("more"), el("span.menu-label", { text: T.menu.more }));
  moreBtn.addEventListener("click", () => toggleMore(moreBtn));
  menu.appendChild(moreBtn);

  const foot = el("div.menu-foot",
    el("div", { text: "" }),
    el("div.small", { text: appName })
  );
  menu.appendChild(foot);

  const title = el("h1.h-screen", { id: "screen-title", text: "" });
  const chip = el("button.save-chip", { type: "button", data: { state: "ok" } },
    ico("check", 17), el("span", { text: T.save.ok }));
  chip.addEventListener("click", showQueue);

  const bar = el("div.bar", { hidden: true }, el("div.bar-fill"));
  const main = el("main.main", { id: "main" });

  const shell = el("div.shell", menu,
    el("div.side",
      el("header.top", title, chip),
      bar,
      main
    )
  );

  put(root, shell);
  refs = { menu, title, chip, bar, main, foot: foot.firstChild, moreBtn };

  db.on("queue", paintChip);
  paintChip(store.get().queue);
  return refs;
}

export function setWho(name) { if (refs.foot) refs.foot.textContent = name; }

export function screenEl() { return refs.main; }

export function setTitle(text) {
  if (refs.title) refs.title.textContent = text;
  document.title = text ? text + " — " + (store.get().appName || "Hasenstadt") : "Hasenstadt";
}

export function markMenu(key) {
  if (!refs.menu) return;
  for (const a of refs.menu.querySelectorAll(".menu-item")) {
    a.setAttribute("aria-current", a.dataset.key === key ? "true" : "false");
  }
  closeMore();
}

export function sessionBar(part) {
  if (!refs.bar) return;
  if (part === null || part === undefined) { refs.bar.hidden = true; return; }
  refs.bar.hidden = false;
  refs.bar.firstChild.style.transform = "scaleX(" + Math.max(0, Math.min(1, part)) + ")";
}

// ── меню «ещё» на телефоне ─────────────────────────

let moreSheet = null;

function toggleMore(btn) {
  if (moreSheet) { closeMore(); return; }
  moreSheet = el("div.more-sheet", { role: "menu" },
    MENU.filter((m) => m[3]).map(([key, icon, href]) =>
      el("a.btn.btn-wide", { href, on: { click: closeMore } }, ico(icon, 20), T.menu[key]))
  );
  document.body.appendChild(moreSheet);
  btn.setAttribute("aria-expanded", "true");
  const first = moreSheet.querySelector("a");
  if (first) first.focus();
}

export function closeMore() {
  if (moreSheet) moreSheet.remove();
  moreSheet = null;
  if (refs.moreBtn) refs.moreBtn.setAttribute("aria-expanded", "false");
}

// ── плашка записи ──────────────────────────────────

function paintChip(q) {
  if (!refs.chip) return;
  const state = (q && q.state) || "ok";
  refs.chip.dataset.state = state;
  const label = state === "sending" ? T.save.sending : state === "waiting" ? T.save.waiting : T.save.ok;
  put(refs.chip, ico(state === "ok" ? "check" : "dot", 17), el("span", { text: label }));
}

function showQueue() {
  const n = db.queueSize();
  modal({
    text: n ? T.save.queue(n) : T.save.empty,
    okText: T.save.now,
    cancelText: T.common.close,
    onOk: () => db.flush()
  });
}

// ── плашки-сообщения ───────────────────────────────

export function note(kind, text, extra) {
  const cls = { calm: "note-calm", wait: "note-wait", soft: "note-soft", ok: "note-ok" }[kind] || "note-calm";
  return el("div.note." + cls, { role: "status" }, el("div", { text }), extra || null);
}

let toastNode = null;

export function toast(text) {
  if (toastNode) toastNode.remove();
  toastNode = note("ok", text);
  toastNode.style.position = "fixed";
  toastNode.style.left = "50%";
  toastNode.style.bottom = "var(--s6)";
  toastNode.style.transform = "translateX(-50%)";
  toastNode.style.zIndex = "9";
  toastNode.style.background = "var(--surface)";
  toastNode.style.border = "1px solid var(--line)";
  document.body.appendChild(toastNode);
  setTimeout(() => { if (toastNode) { toastNode.remove(); toastNode = null; } }, 3000);
}

// ── модальное окно ─────────────────────────────────

let openModal = null;

export function modal(opts) {
  closeModal();
  const o = opts || {};
  const box = el("div.modal", { role: "dialog", "aria-modal": "true" },
    o.title ? el("p.h-block", { text: o.title }) : null,
    o.text ? el("p", { text: o.text }) : null,
    o.body || null
  );
  const cancel = el("button.btn", { type: "button", text: o.cancelText || T.common.no });
  const ok = el("button.btn", { type: "button", text: o.okText || T.common.yes, class: "btn-main" });
  ok.style.width = "auto";
  ok.style.minHeight = "var(--tap)";
  ok.style.fontSize = "1rem";
  box.appendChild(el("div.modal-btns", ok, cancel));

  const shade = el("div.shade", box);
  const done = (val) => { closeModal(); if (val && o.onOk) o.onOk(); if (!val && o.onCancel) o.onCancel(); };
  ok.addEventListener("click", () => done(true));
  cancel.addEventListener("click", () => done(false));
  shade.addEventListener("click", (e) => { if (e.target === shade) done(false); });
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); done(false); }
    else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); done(true); }
  };
  shade.addEventListener("keydown", onKey);

  document.body.appendChild(shade);
  openModal = shade;
  cancel.focus();
  return shade;
}

export function closeModal() {
  if (openModal) openModal.remove();
  openModal = null;
}

// ── кнопка озвучки ─────────────────────────────────

export function speakBtn(text, label) {
  const b = el("button.btn.btn-icon", { type: "button", aria: { label: T.common.speak } },
    ico("speaker", 20), label ? el("span", { text: label }) : null);
  b.addEventListener("click", () => say(text));
  return b;
}

export function say(text) {
  const s = store.get();
  const set = s.settings || {};
  tts.unlock();
  tts.speak(text, { voice: set.voice_name, rate: set.voice_rate });
}

export function sayIfAuto(text) {
  const s = store.get();
  if (s.settings && s.settings.autoplay) say(text);
}

// ── звуки, сгенерированные кодом ───────────────────

let actx = null;

function ctx() {
  if (!actx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    actx = new C();
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}

function tone(freq, ms, gain) {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.value = 0;
  o.connect(g).connect(c.destination);
  const t = c.currentTime;
  const peak = gain;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.start(t);
  o.stop(t + ms / 1000 + 0.03);
}

export function sound(kind) {
  const s = store.get();
  const set = s.settings || {};
  if (!set.sounds) return;
  const vol = (Number(set.volume) || 50) / 100 * 0.3;
  if (kind === "right") tone(630, 70, vol);
  else if (kind === "almost") tone(630, 70, vol * 0.37);
  else if (kind === "gold") { tone(630, 70, vol); setTimeout(() => tone(930, 70, vol), 90); }
  // неверный ответ: звука нет совсем
}

// ── мелкие помощники ───────────────────────────────

export function pbar(part, gold) {
  return el("div.pbar" + (gold ? ".gold" : ""), el("span", { style: { width: Math.round(Math.max(0, Math.min(1, part)) * 100) + "%" } }));
}

export function dot(state) {
  return el("span.dot", { data: { s: state }, aria: { hidden: "true" } });
}

export function lockIcons(prog, labels) {
  const row = el("div.locks");
  for (const [key, label] of [["see", labels.see], ["write", labels.write], ["hear", labels.hear]]) {
    const open = !!(prog && prog["lock_" + key]);
    row.appendChild(el("span.lock-item", { data: { open: String(open) } },
      ico(open ? "unlock" : "lock", 17), el("span", { text: label })));
  }
  return row;
}

export function switchBtn(label, on, fn) {
  const b = el("button.switch", { type: "button", aria: { pressed: String(!!on) } },
    el("span.knob"), el("span.grow", { text: label }));
  b.addEventListener("click", () => {
    const next = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(next));
    fn(next);
  });
  return b;
}

export function checkBtn(label, on, fn) {
  const b = el("button.check", { type: "button", aria: { pressed: String(!!on) } },
    el("span.box", ico("check", 17)), el("span", { text: label }));
  b.addEventListener("click", () => {
    const next = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(next));
    fn(next);
  });
  return b;
}

// Простейшая разметка для текстов правил: заголовки, списки, жирный, таблицы.
export function renderMd(text) {
  const box = el("div.stack-s.prose");
  const lines = String(text).replace(/\r/g, "").split("\n");
  let i = 0;

  const inline = (s) => {
    const frag = document.createDocumentFragment();
    const parts = String(s).split(/(\*\*[^*]+\*\*)/g);
    for (const p of parts) {
      if (!p) continue;
      if (p.startsWith("**") && p.endsWith("**")) frag.appendChild(el("b", { text: p.slice(2, -2) }));
      else frag.appendChild(document.createTextNode(p));
    }
    return frag;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      box.appendChild(el(h[1].length === 1 ? "h2.h-block" : "h3", { text: h[2] }));
      i++; continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const ul = el("ul.stack-s");
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        ul.appendChild(el("li", "• ", inline(lines[i].replace(/^\s*[-*]\s+/, ""))));
        i++;
      }
      box.appendChild(ul); continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const ol = el("ul.stack-s");
      let n = 0;
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        n++;
        ol.appendChild(el("li", n + ". ", inline(lines[i].replace(/^\s*\d+[.)]\s+/, ""))));
        i++;
      }
      box.appendChild(ol); continue;
    }

    if (line.includes("|") && lines[i + 1] && /^[\s|:-]+$/.test(lines[i + 1])) {
      const cells = (s) => s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const table = el("table.tbl");
      const thead = el("thead", el("tr", head.map((c) => el("th", { text: c }))));
      const tbody = el("tbody");
      while (i < lines.length && lines[i].includes("|")) {
        tbody.appendChild(el("tr", cells(lines[i]).map((c) => el("td", inline(c)))));
        i++;
      }
      table.appendChild(thead); table.appendChild(tbody);
      box.appendChild(table); continue;
    }

    const p = el("p");
    p.appendChild(inline(line));
    box.appendChild(p);
    i++;
  }
  return box;
}

export function slider(label, values, current, onDone, noteText, unit) {
  const u = unit || "";
  // текущее значение может не совпасть ровно ни с одним шагом (например, старое
  // значение осталось за пределами новой шкалы) — тогда берём ближайший шаг,
  // а не молча прыгаем на первый
  let i = values.indexOf(current);
  if (i < 0 && typeof current === "number") {
    let best = 0, bestDiff = Infinity;
    values.forEach((v, k) => { const d = Math.abs(v - current); if (d < bestDiff) { bestDiff = d; best = k; } });
    i = best;
  }
  if (i < 0) i = 0;
  const val = el("span.slider-val", { text: String(values[i]) + u });
  const input = el("input", {
    type: "range", min: 0, max: values.length - 1, step: 1,
    value: String(i), "aria-label": label
  });
  input.addEventListener("input", () => { val.textContent = String(values[Number(input.value)]) + u; });
  input.addEventListener("change", () => onDone(values[Number(input.value)]));
  return el("div.set-row",
    el("span.label", { text: label }),
    el("div.slider-row", input, val),
    noteText ? el("p.small.dim", { text: noteText }) : null
  );
}
