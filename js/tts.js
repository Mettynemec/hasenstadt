// Озвучка встроенным синтезом речи браузера.
// Ничего не устанавливается, ничего не стоит, ключи не нужны.
// Здесь же обойдены известные грабли браузеров.

const synth = window.speechSynthesis || null;

let all = [];
let german = [];
let readyResolve = null;
let readyPromise = new Promise((r) => { readyResolve = r; });
let settled = false;
let unlocked = false;
let silentReported = false;
const listeners = new Set();

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { for (const fn of [...listeners]) { try { fn(what); } catch (e) { /* не мешаем */ } } }

function collect() {
  if (!synth) return;
  all = synth.getVoices() || [];
  german = all.filter((v) => /^de/i.test(v.lang || ""));
  if (all.length && !settled) { settled = true; readyResolve(german); }
  emit("voices");
}

if (synth) {
  collect();
  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", collect);
  } else {
    synth.onvoiceschanged = collect;
  }
  // список иногда так и не приходит: не ждём вечно
  setTimeout(() => { if (!settled) { settled = true; readyResolve(german); } }, 3000);
}

export function ready() { return readyPromise; }
export function voices() { return german; }
export function hasGerman() { return german.length > 0; }
export function supported() { return !!synth; }

export function pickVoice(name) {
  if (!german.length) return null;
  return german.find((v) => v.name === name) || german[0];
}

// Первое нажатие после входа работает как разрешение на речь.
export function unlock() {
  if (unlocked || !synth) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.lang = "de-DE";
    synth.speak(u);
    setTimeout(() => { try { synth.cancel(); } catch (e) { /* уже тихо */ } }, 130);
  } catch (e) { /* не страшно */ }
}

export function stop() {
  if (!synth) return;
  try { synth.cancel(); } catch (e) { /* уже тихо */ }
}

let lastText = "";
let retried = false;

export function speak(text, opts) {
  if (!synth || !text) return;
  const o = opts || {};
  const voice = pickVoice(o.voice);
  if (!voice) return;

  stop();
  const u = new SpeechSynthesisUtterance(String(text));
  u.voice = voice;
  u.lang = voice.lang || "de-DE";
  u.rate = Number(o.rate) || 0.9;
  u.pitch = 1;
  u.volume = 1;

  let started = false;
  u.onstart = () => { started = true; retried = false; silentReported = false; };
  u.onend = () => { if (typeof o.onend === "function") o.onend(); };

  lastText = String(text);
  try { synth.speak(u); } catch (e) { return; }

  // голос мог пропасть после сна ноутбука: один раз молча пробуем снова
  setTimeout(() => {
    if (started) return;
    if (!retried) {
      retried = true;
      try { synth.cancel(); synth.speak(u); } catch (e) { /* ничего */ }
      setTimeout(() => { if (!started && !silentReported) { silentReported = true; emit("silent"); } }, 1300);
    } else if (!silentReported) {
      silentReported = true;
      emit("silent");
    }
  }, 1300);
}

export function test(voiceName, rate, phrase) {
  unlock();
  speak(phrase || "Guten Tag, hier ist dein Hase.", { voice: voiceName, rate });
}

export function repeat(opts) { if (lastText) speak(lastText, opts); }
