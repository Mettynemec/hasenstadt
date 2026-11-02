// Крошечный помощник для создания DOM. Никаких библиотек.
//
//   el("div.card", { text: "привет" })
//   el("button.btn", { on: { click: fn }, aria: { pressed: true } }, "Поехали")

export function el(spec, props, ...kids) {
  const parts = String(spec).split(".");
  const tag = parts.shift() || "div";
  const node = document.createElement(tag);
  if (parts.length) node.className = parts.join(" ");

  if (props && typeof props === "object" && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = [node.className, v].filter(Boolean).join(" ");
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else if (k === "data") for (const [d, dv] of Object.entries(v)) node.dataset[d] = dv;
      else if (k === "aria") for (const [a, av] of Object.entries(v)) node.setAttribute("aria-" + a, av);
      else if (k === "style") Object.assign(node.style, v);
      else if (k === "value") node.value = v;
      else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") node[k] = !!v;
      else node.setAttribute(k, v === true ? "" : v);
    }
  } else if (props !== undefined && props !== null) {
    kids.unshift(props);
  }

  add(node, kids);
  return node;
}

function add(node, kids) {
  for (const k of kids) {
    if (k === undefined || k === null || k === false) continue;
    if (Array.isArray(k)) add(node, k);
    else if (k instanceof Node) node.appendChild(k);
    else node.appendChild(document.createTextNode(String(k)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function put(node, ...kids) {
  clear(node);
  add(node, kids);
  return node;
}

// svg из строки пути. Все значки рисуются кодом, растровых файлов нет.
export function icon(d, size) {
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
  p.setAttribute("d", d);
  svg.appendChild(p);
  return svg;
}
