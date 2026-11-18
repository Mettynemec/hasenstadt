// Экран «Чтение». Список из data/reading/index.json, тексты — по файлу на текст.
// Слова берутся из словаря, очки и факт прочтения — в базу, как в играх.
// Тексты, чьих файлов ещё нет в папке, в списке не показываются.
// Знакомые слова (оценка grade >= 3 в тренажёре) сразу показываются немецким,
// незнакомые — русским; клик переключает язык у слова.

import { CONFIG } from "../../config.js";
import { store } from "../store.js";
import * as db from "../db.js";
import { toast } from "../ui.js";

// Порог «знакомо»: оценка слова в тренажёре (поле grade, шкала 1–5).
// В trainer.js золото = 5, серебро = 4; граница «уже знаю» = 3.
const KNOWN_GRADE = 3;

const V = () => encodeURIComponent(CONFIG.CONTENT_VERSION);

async function grabJson(name) {
  const r = await fetch("data/reading/" + name + "?v=" + V(), { cache: "no-cache" });
  if (!r.ok) throw new Error(name + ": " + r.status);
  return r.json();
}

async function exists(name) {
  try {
    const r = await fetch("data/reading/" + name + "?v=" + V(), { cache: "no-cache" });
    return r.ok;
  } catch (e) { return false; }
}

function deForm(w, f) {
  return f === "pl" && w.plural_de ? w.plural_de : w.de;
}

export function mount(root) {
  let alive = true;
  const list = document.createElement("div");
  list.className = "stack-s";
  const hint = document.createElement("p");
  hint.className = "small dim";
  hint.textContent = "минутку";
  list.appendChild(hint);
  root.appendChild(list);

  (async () => {
    let texts;
    try { texts = await grabJson("index.json"); }
    catch (e) { if (alive) hint.textContent = "список текстов не загрузился"; return; }
    texts.sort((a, b) => a.order - b.order);
    const flags = await Promise.all(texts.map((t) => exists(t.id + ".json")));
    if (!alive) return;
    const shown = texts.filter((t, i) => flags[i]);
    list.innerHTML = "";
    const count = document.createElement("p");
    count.className = "small dim";
    count.textContent = shown.length ? "текстов: " + shown.length : "текстов пока нет";
    list.appendChild(count);
    for (const t of shown) {
      const read = !!db.kvGet("read_" + t.id, false);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-wide";
      b.textContent = t.title_ru + (read ? " — прочитано" : "");
      b.addEventListener("click", () => openText(root, t));
      list.appendChild(b);
    }
  })();

  return () => { alive = false; };
}

async function openText(root, meta) {
  root.innerHTML = "";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "btn";
  back.textContent = "назад к текстам";
  back.addEventListener("click", () => { root.innerHTML = ""; mount(root); });
  root.appendChild(back);

  const box = document.createElement("div");
  box.className = "prose";
  box.textContent = "минутку";
  root.appendChild(box);

  let doc;
  try { doc = await grabJson(meta.id + ".json"); }
  catch (e) { box.textContent = "текст не загрузился"; return; }

  const state = store.get();
  const words = (state.content && state.content.wordsById) || {};
  const progress = (state.progress && state.progress.byWordId) || {};
  box.innerHTML = "";
  const p = document.createElement("p");
  box.appendChild(p);

  for (const seg of doc.segments) {
    if (typeof seg === "string") {
      p.appendChild(document.createTextNode(seg));
      continue;
    }
    const w = words[seg.w];
    const de = w ? deForm(w, seg.f) : null;
    const ru = seg.ru;
    const span = document.createElement("span");
    if (!de) {
      span.textContent = ru;
      p.appendChild(span);
      continue;
    }
    const prog = progress[seg.w] || null;
    const known = !!prog && Number(prog.grade) >= KNOWN_GRADE;
    let showingDe = known;
    span.textContent = showingDe ? de : ru;
    span.style.cursor = "pointer";
    span.style.borderBottom = "1px dotted currentColor";
    span.title = showingDe ? ru : de;
    span.addEventListener("click", () => {
      showingDe = !showingDe;
      span.textContent = showingDe ? de : ru;
      span.title = showingDe ? ru : de;
    });
    p.appendChild(span);
  }

  const done = document.createElement("button");
  done.type = "button";
  done.className = "btn btn-main";
  const already = !!db.kvGet("read_" + meta.id, false);
  done.textContent = already ? "прочитано" : "я прочитал текст";
  done.disabled = already;
  done.addEventListener("click", () => {
    if (db.kvGet("read_" + meta.id, false)) return;
    db.kvSet("read_" + meta.id, true);
    db.bumpDay({ points: 10 });
    done.textContent = "прочитано";
    done.disabled = true;
    toast("плюс десять очков");
  });
  root.appendChild(done);
}
