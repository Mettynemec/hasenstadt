// Экран «Чтение». Список из data/reading/index.json, тексты — по файлу на текст.
// Слова берутся из словаря, очки и факт прочтения — в базу, как в играх.

import { CONFIG } from "../../config.js";
import { store } from "../store.js";
import * as db from "../db.js";
import { toast } from "../ui.js";

async function grabJson(name) {
  const r = await fetch("data/reading/" + name + "?v=" + encodeURIComponent(CONFIG.CONTENT_VERSION), { cache: "no-cache" });
  if (!r.ok) throw new Error(name + ": " + r.status);
  return r.json();
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

  grabJson("index.json").then((texts) => {
    if (!alive) return;
    list.innerHTML = "";
    texts.sort((a, b) => a.order - b.order);
    for (const t of texts) {
      const read = !!db.kvGet("read_" + t.id, false);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-wide";
      b.textContent = t.title_ru + (read ? " — прочитано" : "");
      b.addEventListener("click", () => openText(root, t));
      list.appendChild(b);
    }
    if (!texts.length) {
      const p = document.createElement("p");
      p.className = "small dim";
      p.textContent = "текстов пока нет";
      list.appendChild(p);
    }
  }).catch(() => { if (alive) hint.textContent = "тексты не загрузились"; });

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

  const words = (store.get().content && store.get().content.wordsById) || {};
  box.innerHTML = "";
  const p = document.createElement("p");
  box.appendChild(p);

  for (const seg of doc.segments) {
    if (typeof seg === "string") {
      p.appendChild(document.createTextNode(seg));
      continue;
    }
    const w = words[seg.w];
    const de = w ? (seg.f === "pl" && w.plural_de ? w.plural_de : w.de) : null;
    const span = document.createElement("span");
    span.textContent = seg.ru;
    if (de) {
      span.style.cursor = "pointer";
      span.style.borderBottom = "1px dotted currentColor";
      span.title = de + " — " + (w.ru || seg.ru);
      span.addEventListener("click", () => {
        span.textContent = span.textContent === seg.ru ? de : seg.ru;
      });
    }
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
