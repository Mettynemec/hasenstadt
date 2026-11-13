// Точка входа. Порядок запуска описан в разделе 8 задания.

import { CONFIG } from "../config.js";
import { configReady, nameForEmail } from "./config-check.js";
import { el, put, clear } from "./el.js";
import { T } from "./texts.js";
import { store } from "./store.js";
import * as db from "./db.js";
import * as content from "./content.js";
import * as mascot from "./mascot.js";
import * as tts from "./tts.js";
import { buildShell, setWho, note, applyLook } from "./ui.js";
import * as router from "./router.js";
import { mountLogin } from "./screens/login.js";

const bootBox = document.getElementById("boot");
const bootArt = document.getElementById("boot-art");
const bootSlow = document.getElementById("boot-slow");
const app = document.getElementById("app");

let slowTimer = null;

store.set({ appName: CONFIG.APP_NAME || "Hasenstadt" });
document.title = CONFIG.APP_NAME || "Hasenstadt";

// белого экрана не бывает никогда
window.addEventListener("error", (e) => fatal(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => fatal(e.reason));

let fatalShown = false;
function fatal(why) {
  console.error("не предусмотренная поломка:", why);
  if (fatalShown) return;
  fatalShown = true;
  showBoot(
    el("div.stack",
      note("soft", T.err.broken),
      el("button.btn", { type: "button", text: T.err.reload, on: { click: () => location.reload() } })
    )
  );
}

function showBoot(nodes) {
  clearTimeout(slowTimer);
  app.hidden = true;
  bootBox.hidden = false;
  put(bootBox, nodes);
}

function bootPlain() {
  clearTimeout(slowTimer);
  app.hidden = true;
  bootBox.hidden = false;
  const art = el("div.boot-art");
  const slow = el("p.boot-line.small.dim", { text: T.err.slow, hidden: true });
  put(bootBox, art, el("p.boot-line", { text: T.err.loading }), slow);
  if (mascot) {
    const m = mascot.make("matt", 90, "calm");
    art.appendChild(m);
  }
  slowTimer = setTimeout(() => { slow.hidden = false; }, 3000);
}

// ── запуск ─────────────────────────────────────────

(async function run() {
  await mascot.init();
  bootPlain();

  if (!configReady(CONFIG)) {
    showBoot(el("div.stack.prose",
      note("soft", T.err.noConfig),
      el("p.small.dim", { text: "Файл config.js лежит рядом с index.html. В нём две строки: адрес проекта и открытый ключ." })
    ));
    return;
  }

  try {
    await db.init(CONFIG);
  } catch (e) {
    showDbTrouble(e);
    return;
  }

  // первое нажатие работает как разрешение на речь
  const unlockOnce = () => { tts.unlock(); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("keydown", unlockOnce); };
  window.addEventListener("pointerdown", unlockOnce);
  window.addEventListener("keydown", unlockOnce);

  db.on("auth", (kind) => { if (kind === "out" || kind === "stale") toLogin(kind === "stale"); });

  let session = null;
  try { session = await db.currentSession(); }
  catch (e) { session = null; }

  if (!session) { toLogin(false); return; }
  await enter(session.user);
})();

function toLogin(stale) {
  clearTimeout(slowTimer);
  bootBox.hidden = true;
  app.hidden = false;
  mountLogin(app, {
    stale,
    onDone: (user) => enter(user)
  });
}

async function showDbTrouble(e) {
  console.error("база не отозвалась:", e);
  let asleep = false;
  try { asleep = await db.looksAsleep(); } catch (x) { asleep = false; }

  const box = el("div.stack.prose");
  if (asleep) {
    box.appendChild(note("soft", T.err.asleep));
    const list = el("ol.stack-s");
    T.err.asleepHow.forEach((line, i) => list.appendChild(el("li", { text: (i + 1) + ". " + line })));
    box.appendChild(list);
  } else {
    box.appendChild(note("soft", T.err.noDb));
  }
  box.appendChild(el("div.row",
    el("button.btn", { type: "button", text: T.err.retry, on: { click: () => location.reload() } }),
    el("a.btn", { href: "https://supabase.com/dashboard", target: "_blank", rel: "noopener" }, T.err.openPanel)
  ));
  box.appendChild(el("p.small.dim", { text: "Прогресс при этом цел: он лежит в базе, а не в браузере." }));
  showBoot(box);
}

async function enter(user) {
  bootPlain();
  try {
    const [data, cnt] = await Promise.all([
      db.loadEverything(user, (mail) => nameForEmail(CONFIG, mail)),
      content.loadAll(CONFIG.CONTENT_VERSION)
    ]);

    store.set({
      me: data.me,
      partner: data.partner,
      settings: data.settings,
      progress: data.progress,
      partnerProgress: data.partnerProgress,
      dayLogAll: data.dayLogAll,
      content: cnt,
      config: CONFIG
    });

    applyLook(data.settings);
    await tts.ready();
    store.set({ voiceOk: tts.hasGerman() });

    clearTimeout(slowTimer);
    bootBox.hidden = true;
    app.hidden = false;
    buildShell(app, CONFIG.APP_NAME || "Hasenstadt");
    setWho(data.me.name);
    mascot.startIdleWatch();

    if (!location.hash || location.hash === "#") location.replace("#/home");
    router.start();
    db.flush();
  } catch (e) {
    await showDbTrouble(e);
  }
}
