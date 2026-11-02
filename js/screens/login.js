// Экран входа. Название, два кролика, два поля и одна кнопка.

import { el, put } from "../el.js";
import { T } from "../texts.js";
import { store } from "../store.js";
import * as db from "../db.js";
import * as mascot from "../mascot.js";
import * as tts from "../tts.js";

export function mountLogin(root, opts) {
  const o = opts || {};
  const appName = store.get().appName || "Hasenstadt";

  const mail = el("input.field", {
    type: "email", id: "l-mail", autocomplete: "username",
    inputmode: "email", autocapitalize: "off", spellcheck: false
  });
  const pass = el("input.field", { type: "password", id: "l-pass", autocomplete: "current-password" });

  const eye = el("button.btn.btn-icon", { type: "button", aria: { label: T.login.show } },
    el("span", { text: "•••" }));
  eye.addEventListener("click", () => {
    const hidden = pass.type === "password";
    pass.type = hidden ? "text" : "password";
    eye.setAttribute("aria-label", hidden ? T.login.hide : T.login.show);
    put(eye, el("span", { text: hidden ? "***" : "•••" }));
    pass.focus();
  });

  const problem = el("p.small", { style: { color: "var(--soft)", minHeight: "1.3rem" } });
  const btn = el("button.btn.btn-main", { type: "submit", text: T.login.go });

  const form = el("form.login", { novalidate: true },
    el("div.login-hares"),
    el("h1.h-screen.center", { text: appName }),
    o.stale ? el("p.small.dim.center", { text: T.err.reauth }) : null,
    el("div",
      el("label.label", { for: "l-mail", text: T.login.mail }),
      mail
    ),
    el("div",
      el("label.label", { for: "l-pass", text: T.login.pass }),
      el("div.pass-row", pass, eye)
    ),
    problem,
    btn,
    el("p.small.dim.center", { text: T.login.remember }),
    el("p.small.dim.center", { text: T.login.passNote })
  );

  const hares = form.querySelector(".login-hares");
  const matt = mascot.make("matt", 130, "calm");
  const amiko = mascot.make("amiko", 110, "calm");
  amiko.classList.add("small");
  hares.appendChild(amiko);
  hares.appendChild(matt);

  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    tts.unlock();
    problem.textContent = "";
    busy = true;
    btn.disabled = true;
    btn.textContent = T.login.checking;
    try {
      const user = await db.signIn(mail.value.trim(), pass.value);
      o.onDone(user);
      return;
    } catch (err) {
      console.warn("вход не прошёл:", err && err.message);
      problem.textContent = T.login.failed;
      busy = false;
      btn.disabled = false;
      btn.textContent = T.login.go;
      pass.focus();
    }
  });

  put(root, el("div.login-wrap", form));
  mail.focus();
}
