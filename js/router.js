// Переходы между экранами. Адреса на хеше: GitHub Pages не умеет переписывать пути.

import { clear } from "./el.js";
import { setTitle, markMenu, screenEl, sessionBar, closeModal, closeMore } from "./ui.js";
import { T } from "./texts.js";
import { unbindScreenKeys } from "./keys.js";
import * as tts from "./tts.js";

import * as home from "./screens/home.js";
import * as rules from "./screens/rules.js";
import * as words from "./screens/words.js";
import * as trainer from "./screens/trainer.js";
import * as learned from "./screens/learned.js";
import * as progress from "./screens/progress.js";
import * as settings from "./screens/settings.js";
import * as games from "./screens/games.js";

import * as city from "./games/city.js";
import * as sketch from "./games/sketch.js";
import * as frankenstein from "./games/frankenstein.js";
import * as duel from "./games/duel.js";
import * as gaps from "./games/gaps.js";

const ROUTES = [
  { re: /^\/home$/, mod: home, menu: "home", title: () => T.menu.home },
  { re: /^\/rules$/, mod: rules, menu: "rules", title: () => T.menu.rules },
  { re: /^\/rules\/([a-z_-]+)$/, mod: rules, menu: "rules", title: () => T.menu.rules, keys: ["ruleId"] },
  { re: /^\/words$/, mod: words, menu: "words", title: () => T.menu.words },
  { re: /^\/words\/([a-z_-]+)$/, mod: words, menu: "words", title: () => T.menu.words, keys: ["topicId"] },
  { re: /^\/trainer(?:\/(repeat))?$/, mod: trainer, menu: "trainer", title: () => T.menu.trainer, keys: ["mode"] },
  { re: /^\/trainer\/new\/([a-z_-]+)$/, mod: trainer, menu: "trainer", title: () => T.menu.trainer, keys: ["topic"] },
  { re: /^\/learned$/, mod: learned, menu: "learned", title: () => T.menu.learned },
  { re: /^\/game$/, mod: games, menu: "game", title: () => T.menu.game },
  { re: /^\/game\/city\/([a-z_-]+)$/, mod: city, menu: "game", title: () => T.game.cityTitle, keys: ["placeId"] },
  { re: /^\/game\/city\/([a-z_-]+)\/([a-z_-]+)$/, mod: city, menu: "game", title: () => T.game.cityTitle, keys: ["placeId", "sceneId"] },
  { re: /^\/game\/sketch$/, mod: sketch, menu: "game", title: () => "Сценка" },
  { re: /^\/game\/frankenstein$/, mod: frankenstein, menu: "game", title: () => "Франкенштейн" },
  { re: /^\/game\/duel$/, mod: duel, menu: "game", title: () => "Дуэль артиклей" },
  { re: /^\/game\/gaps$/, mod: gaps, menu: "game", title: () => "Пропуски" },
  { re: /^\/progress$/, mod: progress, menu: "progress", title: () => T.menu.progress },
  { re: /^\/settings$/, mod: settings, menu: "settings", title: () => T.menu.settings }
];

let current = null;
let cleanup = null;

export function go(hash) {
  location.hash = hash;
}

export function start() {
  window.addEventListener("hashchange", render);
  render();
}

export function render() {
  const path = (location.hash || "#/home").replace(/^#/, "") || "/home";
  let hit = null;
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { hit = { r, m }; break; }
  }
  if (!hit) { location.replace("#/home"); return; }

  // уход с экрана прибирает за собой
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  if (current && typeof current.unmount === "function") {
    try { current.unmount(); } catch (e) { console.error(e); }
  }
  unbindScreenKeys();
  tts.stop();
  closeModal();
  closeMore();
  sessionBar(null);

  const params = {};
  (hit.r.keys || []).forEach((k, i) => { params[k] = hit.m[i + 1]; });

  current = hit.r.mod;
  setTitle(hit.r.title());
  markMenu(hit.r.menu);

  const root = screenEl();
  clear(root);
  root.classList.remove("enter-soft");
  void root.offsetWidth;
  root.classList.add("enter-soft");

  try {
    const res = hit.r.mod.mount(root, params);
    if (typeof res === "function") cleanup = res;
  } catch (e) {
    console.error("экран не открылся:", e);
    root.textContent = T.err.broken;
  }
  window.scrollTo(0, 0);
}

export function here() { return (location.hash || "#/home").replace(/^#/, ""); }
