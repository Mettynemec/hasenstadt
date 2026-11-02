// Экран ИГРА: сверху карта Города, снизу остальные игры.

import { el, put } from "../el.js";
import { T, scenes as scenesN } from "../texts.js";
import { store } from "../store.js";
import * as sch from "../scheduler.js";
import * as db from "../db.js";
import { note, ico, setTitle } from "../ui.js";

const ICONS = {
  wohnung: "home", laden: "bag", strasse: "street", supermarkt: "cart",
  bus: "bus", transport: "bus", cafe: "cup", park: "tree",
  apotheke: "cross", arztpraxis: "heart", wald: "forest", kino: "film", notruf: "phone"
};

export function mount(root) {
  const s = store.get();
  const c = s.content;
  if (!c) { put(root, note("soft", T.err.noContent)); return; }
  setTitle(T.menu.game);

  const box = el("div.stack");
  const invite = el("div");
  box.appendChild(invite);
  box.appendChild(cityMap(s, c));
  box.appendChild(otherGames(s, c));
  put(root, box);

  paintInvites(invite);
}

// «Мэтт открыл сценку — войти». Проверяется тихо, экран при этом не ждёт.
export function paintInvites(host) {
  const s = store.get();
  if (!s.partner) return;
  db.invites().then((inv) => {
    if (!host.isConnected) return;
    const who = s.partner.name;
    if (inv.sketch) {
      const task = (s.content.sketchTasks || []).find((t) => t.id === inv.sketch.task_id);
      host.appendChild(note("wait", T.game.waitsSketch(who, task ? task.title : ""),
        el("a.btn", { href: "#/game/sketch" }, T.game.modeTwo)));
    }
    if (inv.duel) {
      host.appendChild(note("wait", T.game.waitsDuel(who),
        el("a.btn", { href: "#/game/duel" }, T.game.modeTwo)));
    }
  });
}

export function unmount() {}

// ── карта ──────────────────────────────────────────

export function placeState(c, mine) {
  // открыты все пройденные места и ровно одно следующее
  const ordered = c.places.filter((p) => !p.always_open).sort((a, b) => a.order - b.order);
  const out = {};
  let nextGiven = false;
  let prevTitle = "";
  for (const p of ordered) {
    const total = p.scenes.length;
    const done = p.scenes.filter((sc) => {
      const r = mine.scenes[sc.id];
      return r && Number(r.done_count || 0) > 0;
    }).length;
    const passed = total > 0 && done === total;
    let open;
    if (passed) open = true;
    else if (!nextGiven) { open = true; nextGiven = true; }
    else open = false;
    out[p.id] = { open, passed, done, total, prevTitle };
    prevTitle = p.title_ru;
  }
  for (const p of c.places.filter((x) => x.always_open)) {
    const total = p.scenes.length;
    const done = p.scenes.filter((sc) => {
      const r = mine.scenes[sc.id];
      return r && Number(r.done_count || 0) > 0;
    }).length;
    out[p.id] = { open: true, passed: false, done, total, prevTitle: "" };
  }
  return out;
}

function cityMap(s, c) {
  const wrap = el("div.city-map");
  if (!c.places.length) { wrap.appendChild(note("soft", T.err.noContent)); return wrap; }

  const st = placeState(c, s.progress);
  const ordered = c.places.filter((p) => !p.always_open).sort((a, b) => a.order - b.order);
  const first = ordered[0];
  const rest = ordered.slice(1);
  const always = c.places.filter((p) => p.always_open);

  if (first) wrap.appendChild(placeTile(first, st[first.id], true));
  if (rest.length) {
    const grid = el("div.places");
    for (const p of rest) grid.appendChild(placeTile(p, st[p.id], false));
    wrap.appendChild(grid);
  }
  for (const p of always) wrap.appendChild(placeTile(p, st[p.id], true, true));
  return wrap;
}

function placeTile(p, state, wide, notruf) {
  const icon = ICONS[p.icon] || ICONS[p.id] || "door";
  const cls = "tile place" + (wide ? " place-wide" : "") + (notruf ? " place-notruf" : "");
  const body = [
    el("div.place-top", ico(icon, 23),
      el("span.h-block", { text: p.title_ru }),
      p.title_de ? el("span.dim", { text: p.title_de }) : null,
      !state.open ? ico("lock", 20) : null
    ),
    el("p.small.dim", {
      text: notruf ? T.notruf.always : scenesN(state.total) + ", пройдено " + state.done
    })
  ];
  return el("a." + cls.split(" ").join("."), { href: "#/game/city/" + p.id, data: { locked: String(!state.open) } }, body);
}

// ── остальные игры ─────────────────────────────────

function otherGames(s, c) {
  const wrap = el("div.stack-s");
  const grid = el("div.other-games");
  const tiles = [
    ["Сценка", T.game.tiles.sketch, "#/game/sketch"],
    ["Франкенштейн", T.game.tiles.frankenstein, "#/game/frankenstein"],
    ["Дуэль артиклей", T.game.tiles.duel, "#/game/duel"],
    ["Пропуски", T.game.tiles.gaps, "#/game/gaps"]
  ];
  for (const [name, line, href] of tiles) {
    grid.appendChild(el("a.tile", { href },
      el("b", { text: name }),
      el("p.small.dim", { text: line })
    ));
  }
  wrap.appendChild(grid);
  return wrap;
}
