// Экран ПРАВИЛА. Сверху — справочник «как читать по-немецки» без замка.
// Ниже — список правил дорожки: закрыто, открыто или пройдено.

import { el, put } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import * as content from "../content.js";
import { note, checkBtn, speakBtn, ico, renderMd, setTitle } from "../ui.js";

export function mount(root, params) {
  const s = store.get();
  if (!s.content) { put(root, note("soft", T.err.noContent)); return; }

  if (params && params.ruleId) paintOne(root, params.ruleId);
  else paintList(root);
}

export function unmount() {}

// ── список правил ──────────────────────────────────

function paintList(root) {
  const s = store.get();
  const c = s.content;
  setTitle(T.menu.rules);

  const box = el("div.stack");
  box.appendChild(acc(T.rules.refLink, false, () => refBody(c.alphabet)));

  const steps = sch.pathStatus(c, s.progress).filter((x) => x.kind === "rule");
  if (!steps.length) box.appendChild(note("soft", T.rules.empty));
  else for (const st of steps) box.appendChild(ruleRow(st));

  put(root, box);
}

function ruleRow(st) {
  const r = st.item;
  const icon = st.state === "done" ? "check" : (st.state === "open" ? "dash" : "lock");
  const label = st.state === "done" ? T.rules.done : (st.state === "open" ? T.rules.open : T.rules.locked);
  const head = el("div.topic-head",
    el("span.h-block", { text: r.title }),
    el("span.topic-state", ico(icon, 20), el("span", { text: label }))
  );
  if (st.state === "locked") {
    return el("div.tile.topic-tile", { data: { locked: "true" } },
      head,
      el("p.small.dim", { text: T.rules.lockedBecause(st.reason.kind, st.reason.title) })
    );
  }
  return el("a.tile.topic-tile", { href: "#/rules/" + r.id }, head);
}

// ── одно правило целиком ───────────────────────────

function paintOne(root, ruleId) {
  const s = store.get();
  const c = s.content;
  const r = c.rulesById[ruleId];
  const st = sch.pathStatus(c, s.progress).find((x) => x.kind === "rule" && x.item.id === ruleId);

  if (!r || !st || st.state === "locked") { location.hash = "#/rules"; return; }

  setTitle(r.title);
  const box = el("div.stack");
  box.appendChild(el("a.btn-text", { href: "#/rules" }, "← " + T.rules.back));

  const card = el("div.card.card-accent.rule-box");
  card.appendChild(el("p.h-block", { text: r.title }));

  const textBox = el("div", { hidden: false });
  const done = sch.ruleDone(s.progress, r.id);

  const addText = (md) => {
    textBox.appendChild(md ? renderMd(md) : el("p.small.dim", { text: T.rules.noText }));
  };
  const cached = content.ruleTextCached(r.id);
  if (cached === undefined) content.ruleText(r.id, s.config && s.config.CONTENT_VERSION).then(addText);
  else addText(cached);

  card.appendChild(textBox);
  card.appendChild(checkBtn(T.rules.check, done, (on) => db.saveRule(r.id, on)));
  box.appendChild(card);
  put(root, box);
}

// ── справочник букв, без замка ─────────────────────

function acc(title, open, build) {
  const body = el("div.acc-body", { hidden: !open });
  const head = el("button.acc-head", { type: "button", aria: { expanded: String(!!open) } },
    el("span", { text: title }),
    el("span.dim", { text: open ? "−" : "+" })
  );
  head.addEventListener("click", () => {
    const now = body.hidden;
    body.hidden = !now;
    head.setAttribute("aria-expanded", String(now));
    head.lastChild.textContent = now ? "−" : "+";
    if (now && !body.firstChild) body.appendChild(build());
  });
  if (open) body.appendChild(build());
  return el("section.acc", head, body);
}

function refBody(a) {
  const box = el("div.stack");
  box.appendChild(acc(T.alphabet.letters, true, () => lettersTable(a)));
  box.appendChild(acc(T.alphabet.combos, false, () => combosTable(a)));
  box.appendChild(acc(T.alphabet.help, false, () => helpTable(a)));
  box.appendChild(el("p.small.dim.prose", { text: T.alphabet.stress }));
  return box;
}

function lettersTable(a) {
  const special = [];
  const plain = [];
  for (const l of a.letters || []) {
    const s = String(l.letter || "");
    (/[äöüÄÖÜß]/.test(s) ? special : plain).push(l);
  }
  return el("table.tbl",
    el("thead", el("tr",
      el("th", { text: T.alphabet.thLetter }),
      el("th", { text: T.alphabet.thName }),
      el("th", { text: T.alphabet.thExample }),
      el("th", { text: "" })
    )),
    el("tbody",
      plain.map((l) => letterRow(l)),
      special.length ? el("tr", el("td", { colspan: 4 }, el("span.small.dim", { text: T.alphabet.noRu }))) : null,
      special.map((l) => letterRow(l))
    )
  );
}

function letterRow(l) {
  const example = l.example_de || "";
  return el("tr",
    el("td.de", { text: l.letter }),
    el("td", { text: l.name || "" }),
    el("td", example
      ? [el("span.de", { text: example }),
        l.example_tr ? el("span.small.dim", { text: " — " + l.example_tr }) : null,
        l.example_ru ? el("span.small.dim", { text: " — " + l.example_ru }) : null]
      : (l.note || "")),
    el("td", example ? speakBtn(example) : null)
  );
}

function combosTable(a) {
  return el("table.tbl",
    el("thead", el("tr",
      el("th", { text: T.alphabet.thCombo }),
      el("th", { text: T.alphabet.thReads }),
      el("th", { text: T.alphabet.thExample }),
      el("th", { text: T.alphabet.thTr }),
      el("th", { text: T.alphabet.thRu }),
      el("th", { text: "" })
    )),
    el("tbody", (a.combos || []).map((c) => el("tr",
      el("td.de", { text: c.combo }),
      el("td", { text: c.reads }),
      el("td.de", { text: c.example_de || "" }),
      el("td", { text: c.example_tr || "" }),
      el("td", { text: c.example_ru || "" }),
      el("td", c.example_de ? speakBtn(c.example_de) : null)
    )))
  );
}

function helpTable(a) {
  return el("table.tbl",
    el("thead", el("tr",
      el("th", { text: T.alphabet.thSign }),
      el("th", { text: T.alphabet.thMeans })
    )),
    el("tbody", (a.transcription_help || []).map((h) => el("tr",
      el("td.de", { text: h.sign }),
      el("td", { text: h.means })
    )))
  );
}
