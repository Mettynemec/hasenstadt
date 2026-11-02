// Клавиатура: умлауты, навигация без мыши, карты клавиш экранов.
// Мышь не нужна нигде — это требование, а не удобство.

const UMLAUTS = ["ä", "ö", "ü", "ß"];
const BY_CODE = { KeyA: "ä", KeyO: "ö", KeyU: "ü", KeyS: "ß" };

// Ряд кнопок умлаутов под полем ввода.
export function umlautRow(input) {
  const row = document.createElement("div");
  row.className = "umlauts";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "умлауты");

  const btns = UMLAUTS.map((ch, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "umlaut";
    b.textContent = ch;
    b.tabIndex = -1;
    b.addEventListener("click", (e) => { e.preventDefault(); insert(input, ch); });
    b.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); focusAt(btns, i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); focusAt(btns, i - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); insert(input, ch); backToField(input, btns); }
      else if (e.key === "Escape" || e.key === "ArrowUp") { e.preventDefault(); backToField(input, btns); }
    });
    row.appendChild(b);
    return b;
  });

  // запоминаем, где стоял курсор
  const remember = () => {
    input.dataset.sel = String(input.selectionStart ?? input.value.length);
    input.dataset.selEnd = String(input.selectionEnd ?? input.value.length);
  };
  input.addEventListener("keyup", remember);
  input.addEventListener("click", remember);
  input.addEventListener("blur", remember);

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      remember();
      focusAt(btns, 0);
      return;
    }
    if (e.altKey && BY_CODE[e.code]) {
      e.preventDefault();
      insert(input, BY_CODE[e.code]);
    }
  });

  return row;
}

function focusAt(btns, i) {
  const n = btns.length;
  const k = ((i % n) + n) % n;
  btns.forEach((b, j) => { b.tabIndex = j === k ? 0 : -1; b.dataset.on = j === k ? "true" : "false"; });
  btns[k].focus();
}

function backToField(input, btns) {
  btns.forEach((b) => { b.tabIndex = -1; b.dataset.on = "false"; });
  const at = Number(input.dataset.sel ?? input.value.length);
  input.focus();
  try { input.setSelectionRange(at, at); } catch (e) { /* не всякое поле умеет */ }
}

function insert(input, ch) {
  const start = Number(input.dataset.sel ?? input.selectionStart ?? input.value.length);
  const end = Number(input.dataset.selEnd ?? input.selectionEnd ?? start);
  const v = input.value;
  input.value = v.slice(0, start) + ch + v.slice(end);
  const at = start + ch.length;
  input.dataset.sel = String(at);
  input.dataset.selEnd = String(at);
  input.focus();
  try { input.setSelectionRange(at, at); } catch (e) { /* не всякое поле умеет */ }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// Поле немецкого ввода: без автозамены, без проверки орфографии браузером.
export function germanField(props) {
  const i = document.createElement("input");
  i.type = "text";
  i.className = "field";
  i.autocomplete = "off";
  i.autocapitalize = "off";
  i.spellcheck = false;
  i.setAttribute("autocorrect", "off");
  i.setAttribute("enterkeyhint", "done");
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) i.addEventListener(ev, fn);
    else if (k === "class") i.className += " " + v;
    else i.setAttribute(k, v);
  }
  return i;
}

// Карта клавиш экрана. Снимается при уходе с экрана.
let active = null;

export function bindScreenKeys(map) {
  unbindScreenKeys();
  const handler = (e) => {
    const tag = (e.target && e.target.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    for (const [combo, fn] of Object.entries(map)) {
      if (!matches(combo, e)) continue;
      const whenTyping = combo.startsWith("Alt+") || combo === "Escape" || combo === "Enter";
      if (typing && !whenTyping) continue;
      if (typing && combo === "Enter" && tag === "TEXTAREA" && !e.ctrlKey) continue;
      e.preventDefault();
      fn(e);
      return;
    }
  };
  window.addEventListener("keydown", handler);
  active = handler;
  return unbindScreenKeys;
}

export function unbindScreenKeys() {
  if (active) window.removeEventListener("keydown", active);
  active = null;
}

function matches(combo, e) {
  const parts = combo.split("+");
  const key = parts.pop();
  const needAlt = parts.includes("Alt");
  const needShift = parts.includes("Shift");
  const needCtrl = parts.includes("Ctrl");
  if (!!e.altKey !== needAlt) return false;
  if (!!e.shiftKey !== needShift) return false;
  if (!!e.ctrlKey !== needCtrl) return false;
  if (/^Key[A-Z]$/.test(key) || /^Digit[0-9]$/.test(key)) return e.code === key;
  return e.key === key;
}

// Стрелки по списку кнопок: меню, варианты ответа, кусочки.
export function arrowList(container, selector, opts) {
  const o = opts || {};
  const axis = o.axis || "vertical";
  container.addEventListener("keydown", (e) => {
    const items = [...container.querySelectorAll(selector)].filter((n) => !n.disabled);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = axis === "vertical"
      ? { ArrowDown: 1, ArrowUp: -1 }[e.key]
      : { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!next) return;
    e.preventDefault();
    const at = i < 0 ? 0 : (i + next + items.length) % items.length;
    items[at].focus();
  });
}

export { UMLAUTS };
