// Кролики. Фигуры уже нарисованы, здесь только подстановка и состояния.
// При ошибке кролик показывает calm и больше ничего: молчит и ждёт.

const STATES = ["calm", "glad", "proud", "brush", "leaf", "praise", "really", "sleep", "angry", "wonder"];

let loaded = false;
const living = new Set();
let idleTimer = null;
let sleeping = false;

export async function init() {
  if (loaded) return;
  try {
    const r = await fetch("img/mascots.svg", { cache: "force-cache" });
    if (!r.ok) throw new Error(String(r.status));
    document.body.insertAdjacentHTML("beforeend", await r.text());
    loaded = true;
  } catch (e) {
    console.warn("кролики не загрузились, место под них останется пустым", e);
  }
}

// who: 'matt' | 'amiko'
export function make(who, size, state) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "mascot mascot-blink");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (size) { svg.setAttribute("width", size); svg.setAttribute("height", size); }
  const use = document.createElementNS(ns, "use");
  svg.appendChild(use);
  svg.dataset.who = who;
  set(svg, state || "calm");
  living.add(svg);
  return svg;
}

export function set(svg, state) {
  if (!svg) return;
  const st = STATES.includes(state) ? state : "calm";
  const who = svg.dataset.who || "matt";
  const use = svg.querySelector("use");
  if (!use) return;
  use.setAttribute("href", "#" + who + "-" + st);
  svg.dataset.state = st;

  svg.classList.remove("mascot-nod", "mascot-rise");
  if (st === "glad") {
    void svg.offsetWidth;
    svg.classList.add("mascot-nod");
  } else if (st === "proud" || st === "praise") {
    void svg.offsetWidth;
    svg.classList.add("mascot-rise");
  }
}

// Короткая реакция, потом обратно в покой.
export function flash(svg, state, ms) {
  if (!svg) return;
  set(svg, state);
  clearTimeout(svg._back);
  svg._back = setTimeout(() => set(svg, "calm"), ms || 1300);
}

export function forget(svg) { living.delete(svg); }

// ── сон ────────────────────────────────────────────
// Пара минут без единого действия — кролик засыпает.

export function startIdleWatch() {
  const wake = () => {
    if (sleeping) {
      sleeping = false;
      for (const svg of living) if (svg.dataset.state === "sleep") set(svg, svg.dataset.prev || "calm");
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      sleeping = true;
      for (const svg of living) {
        if (!svg.isConnected) { living.delete(svg); continue; }
        svg.dataset.prev = svg.dataset.state || "calm";
        set(svg, "sleep");
      }
    }, 130000);
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(ev, wake, { passive: true });
  }
  wake();
}

export { STATES };
