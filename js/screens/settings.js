// Экран НАСТРОЙКИ. Пять групп плюс профиль.
// Все изменения применяются сразу и сразу пишутся в базу.

import { el, put, clear } from "../el.js";
import { T, words as wordsN } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as tts from "../tts.js";
import {
  note, switchBtn, slider, modal, toast, applyLook, setTitle, setWho
} from "../ui.js";

const FONTS = [18, 19, 20, 21, 23, 27, 30];
const RATE_PCT = [40, 50, 60, 70, 80, 90, 100];
const VOLUMES = [10, 30, 50, 70, 90];
const SIZES = [10, 20, 30, 40, 50, 60, 70, 80];
const NEWS = [5, 7, 8, 10, 11, 13, 17, 18, 20];
const DEBTS = [30, 40, 50, 60, 70, 80, 90, 100];

let offVoices = null;

export function mount(root) {
  paint(root);
  offVoices = tts.on((what) => { if (what === "voices") paint(root); });
  return () => unmount();
}

export function unmount() { if (offVoices) { offVoices(); offVoices = null; } }

function paint(root) {
  const s = store.get();
  const set = s.settings || {};
  setTitle(T.menu.settings);
  const box = el("div.stack");

  box.appendChild(group(T.settings.groups.voice, voiceGroup(s, set, root)));
  box.appendChild(group(T.settings.groups.sounds, soundsGroup(set)));
  box.appendChild(group(T.settings.groups.look, lookGroup(set, root)));
  box.appendChild(group(T.settings.groups.study, studyGroup(set)));
  box.appendChild(group(T.settings.groups.backup, backupGroup(s)));
  box.appendChild(group(T.settings.groups.profile, profileGroup(s)));

  put(root, box);
}

function group(title, nodes) {
  return el("section.card.set-group", el("h2.h-block", { text: title }), nodes);
}

function save(patch) {
  db.saveSettings(patch);
}

// ── голос ──────────────────────────────────────────

function voiceGroup(s, set, root) {
  const box = el("div.set-group");

  box.appendChild(switchBtn(T.settings.autoplay, set.autoplay !== false, (on) => save({ autoplay: on })));

  const list = tts.voices();
  if (!tts.supported()) {
    box.appendChild(note("calm", T.settings.noVoice));
  } else if (!list.length) {
    box.appendChild(el("p.small.dim", { text: T.settings.searching }));
    box.appendChild(note("calm", T.settings.noVoice));
  } else {
    const sel = el("select.field", { "aria-label": T.settings.voice });
    for (const v of list) {
      sel.appendChild(el("option", { value: v.name, text: v.name + " — " + v.lang, selected: set.voice_name === v.name }));
    }
    sel.addEventListener("change", () => save({ voice_name: sel.value }));
    box.appendChild(el("div.set-row", el("span.label", { text: T.settings.voice }), sel));
  }

  // хранится как доля (0.4–1), на экране — в процентах, как просил Мэтт
  const ratePct = Math.round((Number(set.voice_rate) || 0.7) * 100);
  box.appendChild(slider(T.settings.rate, RATE_PCT, ratePct, (v) => save({ voice_rate: v / 100 }), null, "%"));

  const testB = el("button.btn", { type: "button", text: T.settings.testVoice });
  testB.addEventListener("click", () => tts.test(set.voice_name, Number(set.voice_rate) || 0.7, T.settings.testPhrase));
  box.appendChild(testB);

  const origin = forvoOrigin(s);
  box.appendChild(el("div.set-row",
    el("a", { href: origin, target: "_blank", rel: "noopener", text: T.settings.forvoName }),
    el("p.small.dim", { text: T.settings.forvo })
  ));
  return box;
}

function forvoOrigin(s) {
  try { return new URL((s.config && s.config.FORVO_URL) || "https://forvo.com/word/").origin + "/languages/de/"; }
  catch (e) { return "https://forvo.com/languages/de/"; }
}

// ── звуки ──────────────────────────────────────────

function soundsGroup(set) {
  const box = el("div.set-group");
  box.appendChild(switchBtn(T.settings.soundsOn, !!set.sounds, (on) => save({ sounds: on })));
  box.appendChild(slider(T.settings.volume, VOLUMES, Number(set.volume) || 50, (v) => save({ volume: v })));
  box.appendChild(el("p.small.dim", { text: T.settings.soundsNote }));
  return box;
}

// ── вид ────────────────────────────────────────────

function lookGroup(set, root) {
  const box = el("div.set-group");

  box.appendChild(switchBtn(
    T.settings.theme + ": " + (set.theme === "light" ? T.settings.themeLight : T.settings.themeDark),
    set.theme === "light",
    (on) => { save({ theme: on ? "light" : "dark" }); applyLook(store.get().settings); paint(root); }
  ));

  const sample = el("p.sample", { text: T.settings.sample });
  box.appendChild(slider(T.settings.font, FONTS, Number(set.font_px) || 21, (v) => {
    save({ font_px: v });
    applyLook(store.get().settings);
  }));
  box.appendChild(sample);

  box.appendChild(switchBtn(
    T.settings.accent + ": " + (set.accent_style === "upper" ? T.settings.accentUpper : T.settings.accentMark),
    set.accent_style === "upper",
    (on) => save({ accent_style: on ? "upper" : "mark" })
  ));
  box.appendChild(el("p.small.dim", { text: T.settings.accentSample(set.accent_style === "upper") }));

  box.appendChild(switchBtn(
    T.settings.counter + ": " + (set.counter_digits !== false ? T.settings.counterBoth : T.settings.counterBar),
    set.counter_digits !== false,
    (on) => { save({ counter_digits: on }); paint(root); }
  ));

  box.appendChild(switchBtn(
    T.settings.anim + ": " + (set.animations !== false ? T.settings.animOn : T.settings.animOff),
    set.animations !== false,
    (on) => { save({ animations: on }); applyLook(store.get().settings); paint(root); }
  ));

  return box;
}

// ── занятия ────────────────────────────────────────

function studyGroup(set) {
  const box = el("div.set-group");
  box.appendChild(slider(T.settings.sessionSize, SIZES, Number(set.session_size) || 30,
    (v) => save({ session_size: v }), T.settings.sessionNote));
  box.appendChild(slider(T.settings.newPerDay, NEWS, Number(set.new_per_day) || 8,
    (v) => save({ new_per_day: v }), T.settings.newNote));
  box.appendChild(slider(T.settings.debt, DEBTS, Number(set.debt_limit) || 80,
    (v) => save({ debt_limit: v }), T.settings.debtNote));
  return box;
}

// ── копии ──────────────────────────────────────────

function backupGroup(s) {
  const box = el("div.set-group");

  const down = el("button.btn", { type: "button", text: T.settings.save });
  down.addEventListener("click", async () => {
    down.disabled = true;
    try {
      const data = await db.exportAll();
      const name = "hasenstadt-progress-" + db.today() + ".json";
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast(T.settings.saved);
    } catch (e) {
      console.error(e);
      modal({ text: T.err.noDb, okText: T.common.ok, cancelText: T.common.close });
    }
    down.disabled = false;
  });

  const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  const up = el("button.btn", { type: "button", text: T.settings.load });
  up.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    let obj = null;
    try { obj = JSON.parse(await f.text()); } catch (e) { obj = null; }
    if (!obj || obj.kind !== "hasenstadt-progress") {
      modal({ text: T.settings.loadBad, okText: T.common.ok, cancelText: T.common.close });
      file.value = "";
      return;
    }
    const n = (obj.word_progress || []).length;
    const date = String(obj.made_at || "").slice(0, 10);
    modal({
      text: T.settings.loadConfirm(n, date),
      okText: T.common.yes, cancelText: T.common.no,
      onOk: async () => {
        try {
          await db.importAll(obj);
          toast(T.settings.loadDone);
          setTimeout(() => location.reload(), 1000);
        } catch (e) {
          console.error(e);
          modal({ text: T.err.noDb, okText: T.common.ok, cancelText: T.common.close });
        }
      }
    });
    file.value = "";
  });

  box.appendChild(el("div.row", down, up, file));
  box.appendChild(el("p.small.dim", { text: T.settings.copyNote }));
  box.appendChild(el("p.small.dim", { text: T.settings.sleepNote }));
  box.appendChild(el("a.btn-text", { href: "https://supabase.com/dashboard", target: "_blank", rel: "noopener" }, T.settings.panel));
  return box;
}

// ── профиль ────────────────────────────────────────

function profileGroup(s) {
  const box = el("div.set-group");
  const name = el("input.field", { type: "text", value: s.me.name, "aria-label": T.settings.name });
  name.addEventListener("change", async () => {
    const v = name.value.trim();
    if (!v) { name.value = s.me.name; return; }
    db.saveProfileName(v);
    setWho(v);
  });
  box.appendChild(el("div.set-row", el("span.label", { text: T.settings.name }), name));

  const out = el("button.btn", { type: "button", text: T.settings.out });
  out.addEventListener("click", () => {
    modal({
      text: T.settings.outConfirm, okText: T.settings.out, cancelText: T.common.no,
      onOk: async () => { await db.signOut(); location.reload(); }
    });
  });
  box.appendChild(out);
  box.appendChild(el("p.small.dim", { text: T.settings.passNote }));
  return box;
}
