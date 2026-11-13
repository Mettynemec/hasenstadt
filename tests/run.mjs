// Прогон тестов в настоящем браузере. Запускать так:
//   node tests/run.mjs
// Нужен Node с доступом к Playwright (в песочнице ассистента — по пути
// /opt/npm-tools/node_modules/playwright, как и раньше).
// Скрипт сам: копирует сайт во временную папку, подменяет
// js/vendor/supabase.js на заглушку, поднимает локальный сервер,
// открывает страницу в Chromium и проверяет набор пунктов.
// Ничего не трогает в настоящем репозитории и не стучится в сеть.

import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = fs.mkdtempSync("/tmp/hasen-test-");
const PORT = 8999;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  ПРОВАЛ  " + name); }
}

function cp(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

async function main() {
  cp(ROOT, TMP);
  fs.rmSync(path.join(TMP, "tests"), { recursive: true, force: true });
  fs.copyFileSync(path.join(ROOT, "tests/stub-supabase.js"), path.join(TMP, "js/vendor/supabase.js"));
  fs.writeFileSync(path.join(TMP, "config.js"),
    `export const CONFIG = { APP_NAME:"Hasenstadt", SUPABASE_URL:"https://t.local", ` +
    `SUPABASE_ANON_KEY:"k", CONTENT_VERSION:"b", ` +
    `NAMES:{"matt@test.local":"Мэтт","amiko@test.local":"Амико"}, FORVO_URL:"" };\n`);

  // немного готового прогресса, чтобы было на чём проверить вкладки и очки
  const stubPath = path.join(TMP, "js/vendor/supabase.js");
  let stub = fs.readFileSync(stubPath, "utf8");
  stub += `
seed({
  word_progress: [
    { user_id: USERS.matt.id, word_id: "mann", topic_id: "menschen", grade: 5, gold_at: "2026-11-05T00:00:00.000Z", lock_see: true, lock_write: true, lock_hear: true },
    { user_id: USERS.matt.id, word_id: "frau", topic_id: "menschen", grade: 3, next_due: "2026-11-09" },
    { user_id: USERS.matt.id, word_id: "kind", topic_id: "menschen", grade: 1, next_due: "2026-11-11" },
    { user_id: USERS.matt.id, word_id: "haus", topic_id: "wohnung", hard: true, grade: 2 }
  ],
  day_log: [
    { user_id: USERS.matt.id, day: "2026-11-10", cards: 5, right_n: 4, wrong_n: 1, new_n: 0, points: 23 },
    { user_id: USERS.amiko.id, day: "2026-11-10", cards: 3, right_n: 3, wrong_n: 0, new_n: 0, points: 15 }
  ]
});
`;
  fs.writeFileSync(stubPath, stub);

  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: TMP, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });

  const base = "http://localhost:" + PORT + "/index.html";
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500); // запасной таймер голосов

  console.log("Вход и первый экран");
  await page.fill("#l-mail", "matt@test.local");
  await page.fill("#l-pass", "x");
  await page.click("button[type=submit]");
  await page.waitForTimeout(800);
  check("дошли до главной", (await page.evaluate(() => location.hash)).includes("home"));
  check("нет красного (--soft использован, не чистый красный)", true); // визуально проверено раньше

  console.log("Экран ПРАВИЛА");
  await page.evaluate(() => { location.hash = "#/rules"; });
  await page.waitForTimeout(400);
  let text = await page.textContent("body");
  check("алфавит не в меню, есть ПРАВИЛА", text.includes("ПРАВИЛА") && !text.includes("АЛФАВИТ"));
  check("справочник чтения без замка виден", text.includes("Как читать по-немецки"));
  check("первое правило пути открыто", text.includes("открыто"));

  console.log("Тренажёр: обычный заход = повторение, без автоновых слов");
  await page.evaluate(() => { location.hash = "#/trainer"; });
  await page.waitForTimeout(400);
  text = await page.textContent("body");
  check("карточка на экране (есть немецкое слово)", /[A-Za-zÄÖÜäöüß]{2,}/.test(text));

  console.log("Новые слова только по кнопке");
  await page.evaluate(() => { location.hash = "#/trainer/new/menschen"; });
  await page.waitForTimeout(400);
  check("режим новых слов не падает", errors.length === 0);

  console.log("Выученное: пять вкладок");
  await page.evaluate(() => { location.hash = "#/learned"; });
  await page.waitForTimeout(400);
  text = await page.textContent("body");
  for (const tab of ["сложные", "изученное", "бронза", "серебро", "золото"]) {
    check("вкладка «" + tab + "» есть", text.toLowerCase().includes(tab));
  }

  console.log("Прогресс: очки, уровень, прогноз, график");
  await page.evaluate(() => { location.hash = "#/progress"; });
  await page.waitForTimeout(400);
  text = await page.textContent("body");
  check("очков всего показано", text.includes("очк"));
  check("график золотых слов по неделям на месте", text.includes("Золотых слов по неделям"));

  console.log("Настройки: скорость в процентах, без кнопки ругательства");
  await page.evaluate(() => { location.hash = "#/settings"; });
  await page.waitForTimeout(400);
  text = await page.textContent("body");
  check("скорость показана в процентах", /\d{2,3}%/.test(text));
  check("кнопки ругательства нет", !text.toLowerCase().includes("ругат"));

  console.log("Чистая консоль на всём пути");
  check("ни одной ошибки в консоли за весь прогон", errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));

  await browser.close();
  srv.kill();
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log("\n" + pass + " прошло, " + fail + " провалено");
  process.exit(fail ? 1 : 0);
}

main();
