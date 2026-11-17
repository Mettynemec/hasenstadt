import { loadAll } from "../content.js";
import { CONFIG } from "../../config.js";

let cache = null;

async function data() {
  if (!cache) cache = await loadAll(CONFIG.CONTENT_VERSION);
  return cache;
}

export function mount(root) {
  let alive = true;
  root.innerHTML = "<h2>Чтение</h2><div class='reading-list'>минутку</div>";
  const list = root.querySelector(".reading-list");

  (async () => {
    const res = await fetch("data/reading/index.json?v=" + encodeURIComponent(CONFIG.CONTENT_VERSION), { cache: "no-cache" });
    const texts = await res.json();
    if (!alive) return;
    list.innerHTML = "";
    for (const t of texts.sort((a, b) => a.order - b.order)) {
      const btn = document.createElement("button");
      btn.className = "menu-item";
      btn.textContent = t.title_ru;
      btn.onclick = () => openText(root, t);
      list.appendChild(btn);
    }
  })().catch(() => { if (alive) list.textContent = "тексты не загрузились"; });

  return () => { alive = false; };
}

async function openText(root, meta) {
  root.innerHTML = "<h2>" + meta.title_ru + "</h2><div class='reading-text'>минутку</div>";
  const box = root.querySelector(".reading-text");
  const back = document.createElement("button");
  back.className = "menu-item";
  back.textContent = "назад к текстам";
  back.onclick = () => mount(root);
  root.appendChild(back);

  const [res, all] = await Promise.all([
    fetch("data/reading/" + meta.id + ".json?v=" + encodeURIComponent(CONFIG.CONTENT_VERSION), { cache: "no-cache" }),
    data()
  ]);
  const doc = await res.json();
  box.innerHTML = "";

  for (const seg of doc.segments) {
    if (typeof seg === "string") {
      box.appendChild(document.createTextNode(seg));
      continue;
    }
    const w = all.wordsById[seg.w];
    const de = w ? (seg.f === "pl" && w.plural_de ? w.plural_de : w.de) : seg.ru;
    const span = document.createElement("span");
    span.className = "reading-word";
    span.style.cursor = "pointer";
    span.style.borderBottom = "1px dotted currentColor";
    span.textContent = seg.ru;
    span.title = w ? w.de + " — " + w.ru : seg.ru;
    span.onclick = () => { span.textContent = span.textContent === seg.ru ? de : seg.ru; };
    box.appendChild(span);
  }

  const done = document.createElement("button");
  done.className = "menu-item";
  done.textContent = "я прочитал текст";
  done.onclick = () => {
    localStorage.setItem("read_" + meta.id, "true");
    done.textContent = "прочитано";
    done.disabled = true;
  };
  if (localStorage.getItem("read_" + meta.id)) { done.textContent = "прочитано"; done.disabled = true; }
  root.appendChild(done);
}
