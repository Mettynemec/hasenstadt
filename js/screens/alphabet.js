// Экран АЛФАВИТ. Справочник: буквы, буквосочетания, система транскрипции.

import { el, put } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as sch from "../scheduler.js";
import { note, checkBtn, speakBtn } from "../ui.js";

export function mount(root) {
  const s = store.get();
  const a = (s.content && s.content.alphabet) || { letters: [], combos: [], transcription_help: [] };
  const box = el("div.stack");

  if (!a.letters.length && !a.combos.length) {
    put(root, note("soft", T.err.noContent));
    return;
  }

  box.appendChild(acc(T.alphabet.letters, true, () => lettersTable(a)));
  box.appendChild(acc(T.alphabet.combos, false, () => combosTable(a)));
  box.appendChild(acc(T.alphabet.help, false, () => helpTable(a)));

  box.appendChild(el("p.small.dim.prose", { text: T.alphabet.stress }));

  const rule = s.content.rulesById["alphabet"];
  if (rule) {
    const done = sch.ruleDone(s.progress, "alphabet");
    box.appendChild(el("div.card",
      checkBtn(T.alphabet.done, done, (on) => db.saveRule("alphabet", on))
    ));
  }

  put(root, box);
}

export function unmount() {}

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

function lettersTable(a) {
  const special = [];
  const plain = [];
  for (const l of a.letters) {
    const s = String(l.letter || "");
    (/[äöüÄÖÜß]/.test(s) ? special : plain).push(l);
  }
  const table = el("table.tbl",
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
  return table;
}

function letterRow(l) {
  const example = l.example_de || "";
  return el("tr",
    el("td.de", { text: l.letter }),
    el("td", { text: l.name || "" }),
    el("td", example ? [el("span.de", { text: example }), l.example_tr ? el("span.small.dim", { text: " — " + l.example_tr }) : null,
      l.example_ru ? el("span.small.dim", { text: " — " + l.example_ru }) : null] : (l.note || "")),
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
    el("tbody", a.combos.map((c) => el("tr",
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
