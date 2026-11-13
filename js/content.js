// Загрузка файлов контента и проверка их на входе.
// Невалидный блок помечается и не попадает в контент, остальное грузится.

const BASE = "data/";

// ── запрещённые слова ──────────────────────────────
// Тема родни закрыта наглухо, плюс два личных обращения.

const BANNED = [
  "мать", "матери", "матерью", "матерей", "матерям",
  "мама", "мамы", "маме", "маму", "мамой", "мам", "мамин", "мамина", "мамино", "мамины",
  "мамка", "мамаша", "мамочка",
  "отец", "отца", "отцу", "отцом", "отце", "отцы", "отцов", "отцовский", "отцовская",
  "папа", "папы", "папе", "папу", "папой", "пап", "папин", "папина", "папочка", "папаша",
  "бабушка", "бабушки", "бабушке", "бабушку", "бабушкой", "бабушек", "бабушкин", "бабка", "баба",
  "дедушка", "дедушки", "дедушке", "дедушку", "дедушкой", "дедушек", "дедушкин",
  "дед", "деда", "деду", "дедом", "деды", "дедов",
  "тетя", "тети", "тете", "тетю", "тетей", "теть", "тетка", "тетки", "теток", "тетушка",
  "дядя", "дяди", "дяде", "дядю", "дядей", "дядь", "дядька", "дядьки",
  "племянник", "племянника", "племяннику", "племянники", "племянников",
  "племянница", "племянницы", "племяннице", "племянницу", "племянниц",
  "двоюродный", "двоюродная", "двоюродное", "двоюродные", "двоюродного", "двоюродной",
  "родители", "родителей", "родителям", "родителями", "родителях",
  "родитель", "родителя", "родительский", "родительская",
  "mutter", "muetter", "mutti", "vater", "vaeter", "vati",
  "oma", "omas", "opa", "opas", "tante", "tanten", "onkel",
  "eltern", "grosseltern", "grossmutter", "grossvater",
  "muetterlich", "vaeterlich", "elterlich",
  "familie", "familien", "familiaer", "geschwister",
  "ами", "мелочь", "мелочи", "мелочью"
];

function fold(s) {
  return String(s).toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

const BANNED_SET = new Set(BANNED.map(fold));

function bannedIn(text) {
  const tokens = fold(text).split(/[^a-zа-я]+/).filter(Boolean);
  const hits = [];
  for (const t of tokens) if (BANNED_SET.has(t)) hits.push(t);
  return hits;
}

function scanText(obj, path, problems) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    const hits = bannedIn(obj);
    if (hits.length) problems.push(path + ": запрещённые слова — " + hits.join(", "));
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanText(v, path + "[" + i + "]", problems));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) scanText(v, path ? path + "." + k : k, problems);
  }
}

// ── загрузка ───────────────────────────────────────

async function grab(path, version) {
  const url = BASE + path + "?v=" + encodeURIComponent(version || "a");
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(path + ": " + r.status);
  return r.json();
}

async function grabSoft(path, version, fallback) {
  try { return await grab(path, version); }
  catch (e) {
    console.warn("файл не загрузился, работаем без него:", path, e.message);
    return fallback;
  }
}

// Текст правила грузится один раз и дальше живёт в памяти:
// переход между экранами должен быть мгновенным.
const ruleCache = new Map();

export async function ruleText(id, version) {
  if (ruleCache.has(id)) return ruleCache.get(id);
  let out = null;
  try {
    const url = BASE + "rules/" + id + ".md?v=" + encodeURIComponent(version || "a");
    const r = await fetch(url, { cache: "no-cache" });
    if (r.ok) {
      const t = await r.text();
      if (t.trim()) {
        const hits = bannedIn(t);
        if (hits.length) {
          console.warn("правило " + id + ": запрещённые слова в тексте — " + hits.join(", ") + ", текст не показан");
        } else {
          out = t;
        }
      }
    }
  } catch (e) { out = null; }
  ruleCache.set(id, out);
  return out;
}

export function ruleTextCached(id) {
  return ruleCache.has(id) ? ruleCache.get(id) : undefined;
}

export async function loadAll(version) {
  const bad = [];
  // Уникальность проверяется внутри каждого вида: прогресс по словам хранится
  // по id слова, прогресс по сценам — по id сцены, и это разные таблицы.
  // Требовать уникальности на весь проект нельзя: тогда блок словаря «Дом и
  // квартира» и место Города «Квартира» не могли бы называться одинаково.
  const ids = {
    topic: new Set(), rule: new Set(), word: new Set(), place: new Set(),
    scene: new Set(), task: new Set(), compound: new Set(), phrase: new Set()
  };

  const [topicsRaw, rulesRaw, alphabet, placesIndex, sketchRaw, compRaw, phrRaw, pathRaw] =
    await Promise.all([
      grabSoft("topics.json", version, []),
      grabSoft("rules.json", version, []),
      grabSoft("alphabet.json", version, { letters: [], combos: [], transcription_help: [] }),
      grabSoft("places.json", version, []),
      grabSoft("sketch-tasks.json", version, []),
      grabSoft("compounds.json", version, []),
      grabSoft("phrases.json", version, []),
      grabSoft("path.json", version, [])
    ]);

  // блоки словаря
  const topics = [];
  for (const t of asArray(topicsRaw)) {
    const p = [];
    need(t, ["id", "title_ru", "order"], p, "блок");
    checkId(t.id, p, ids.topic);
    scanText(t, "блок " + t.id, p);
    if (p.length) { bad.push({ file: "topics.json / " + t.id, problems: p }); continue; }
    topics.push(t);
  }
  topics.sort((a, b) => a.order - b.order);

  // правила
  const rules = [];
  for (const r of asArray(rulesRaw)) {
    const p = [];
    need(r, ["id", "title", "order"], p, "правило");
    checkId(r.id, p, ids.rule);
    scanText(r, "правило " + r.id, p);
    if (p.length) { bad.push({ file: "rules.json / " + r.id, problems: p }); continue; }
    rules.push(r);
  }
  rules.sort((a, b) => a.order - b.order);
  const rulesById = byId(rules);

  // слова блоков
  const words = [];
  const byTopic = {};
  for (const t of topics) {
    let list;
    try { list = await grab("words/" + t.id + ".json", version); }
    catch (e) { bad.push({ file: "words/" + t.id + ".json", problems: [e.message] }); continue; }

    const p = [];
    const ok = [];
    for (const w of asArray(list)) {
      const wp = [];
      need(w, ["id", "order", "pos", "de", "ru", "tr", "syllables"], wp, "слово");
      checkId(w.id, wp, ids.word);
      if (w.pos === "noun") {
        if (!w.article) wp.push(w.id + ": у существительного нет article");
        if (!w.plural) wp.push(w.id + ": у существительного нет plural");
      }
      if (!String(w.tr || "").trim()) wp.push(w.id + ": пустой tr");
      if (Array.isArray(w.syllables) && w.syllables.join("") !== w.de) {
        wp.push(w.id + ": syllables склеиваются в «" + w.syllables.join("") + "», а должно быть «" + w.de + "»");
      }
      scanText(w, "слово " + w.id, wp);
      if (wp.length) p.push(...wp); else ok.push({ ...w, topic: t.id });
    }
    if (p.length) {
      bad.push({ file: "words/" + t.id + ".json", problems: p });
      continue;
    }
    ok.sort((a, b) => a.order - b.order);
    byTopic[t.id] = ok;
    words.push(...ok);
  }
  const wordsById = byId(words);

  // места и сцены Города
  const places = [];
  const scenesById = {};
  for (const pid of asArray(placesIndex)) {
    const id = typeof pid === "string" ? pid : pid.id;
    let place;
    try { place = await grab("scenes/" + id + ".json", version); }
    catch (e) { bad.push({ file: "scenes/" + id + ".json", problems: [e.message] }); continue; }

    const p = [];
    need(place, ["id", "title_ru", "order"], p, "место");
    checkId(place.id, p, ids.place);
    const scenes = [];
    for (const sc of asArray(place.scenes)) {
      const sp = [];
      need(sc, ["id", "title_ru", "lines"], sp, "сцена");
      checkId(sc.id, sp, ids.scene);
      for (const [i, line] of asArray(sc.lines).entries()) {
        if (line.who === "bot") {
          if (!line.de) sp.push(sc.id + ": реплика " + (i + 1) + " без de");
          if (!Array.isArray(line.options_ru) || line.options_ru.length < 2) {
            sp.push(sc.id + ": реплика " + (i + 1) + " без вариантов");
          } else if (!(line.answer >= 0 && line.answer < line.options_ru.length)) {
            sp.push(sc.id + ": реплика " + (i + 1) + ": answer указывает в пустоту");
          }
        } else if (line.who === "human") {
          if (!line.de) sp.push(sc.id + ": реплика " + (i + 1) + " без de");
          if (!Array.isArray(line.chunks) || !line.chunks.length) {
            sp.push(sc.id + ": реплика " + (i + 1) + " без chunks");
          } else if (line.chunks.join(" ") !== line.de) {
            sp.push(sc.id + ": реплика " + (i + 1) + ": chunks склеиваются в «" +
              line.chunks.join(" ") + "», а должно быть «" + line.de + "»");
          }
        } else {
          sp.push(sc.id + ": реплика " + (i + 1) + ": who не bot и не human");
        }
      }
      refs(sc.needs_words, wordsById, sc.id + ": needs_words", sp);
      refs(sc.needs_rules, rulesById, sc.id + ": needs_rules", sp);
      scanText(sc, "сцена " + sc.id, sp);
      if (sp.length) p.push(...sp); else scenes.push({ ...sc, place: place.id });
    }
    scanText({ title_ru: place.title_ru, title_de: place.title_de }, "место " + place.id, p);
    if (p.length) { bad.push({ file: "scenes/" + id + ".json", problems: p }); continue; }
    for (const sc of scenes) scenesById[sc.id] = sc;
    places.push({ ...place, scenes });
  }
  places.sort((a, b) => a.order - b.order);

  // задания для сценок
  const sketchTasks = [];
  for (const s of asArray(sketchRaw)) {
    const p = [];
    need(s, ["id", "title", "situation", "roles", "must"], p, "задание");
    checkId(s.id, p, ids.task);
    refs(s.needs_words, wordsById, s.id + ": needs_words", p);
    refs(s.needs_rules, rulesById, s.id + ": needs_rules", p);
    scanText(s, "задание " + s.id, p);
    if (p.length) { bad.push({ file: "sketch-tasks.json / " + s.id, problems: p }); continue; }
    sketchTasks.push(s);
  }

  // составные слова
  const compounds = [];
  for (const c of asArray(compRaw)) {
    const p = [];
    need(c, ["id", "de", "parts", "ru"], p, "составное");
    checkId(c.id, p, ids.compound);
    scanText(c, "составное " + c.id, p);
    if (p.length) { bad.push({ file: "compounds.json / " + c.id, problems: p }); continue; }
    compounds.push(c);
  }

  // фразы для пропусков
  const phrases = [];
  for (const f of asArray(phrRaw)) {
    const p = [];
    need(f, ["id", "de", "ru", "gap_words"], p, "фраза");
    checkId(f.id, p, ids.phrase);
    refs(f.needs_words, wordsById, f.id + ": needs_words", p);
    for (const g of asArray(f.gap_words)) {
      if (!String(f.de).includes(g)) p.push(f.id + ": в фразе нет слова «" + g + "»");
    }
    scanText(f, "фраза " + f.id, p);
    if (p.length) { bad.push({ file: "phrases.json / " + f.id, problems: p }); continue; }
    phrases.push(f);
  }

  // справочник
  const alphaProblems = [];
  scanText(alphabet, "алфавит", alphaProblems);
  if (alphaProblems.length) bad.push({ file: "alphabet.json", problems: alphaProblems });

  // ссылки блоков на правила
  for (const t of topics) {
    if (t.rule_before && !rulesById[t.rule_before]) {
      bad.push({ file: "topics.json / " + t.id, problems: ["rule_before указывает в пустоту: " + t.rule_before] });
    }
  }
  for (const r of rules) {
    if (r.topic_next && !topics.some((t) => t.id === r.topic_next)) {
      bad.push({ file: "rules.json / " + r.id, problems: ["topic_next указывает в пустоту: " + r.topic_next] });
    }
  }

  // путь: шаги-правила и шаги-блоки по порядку
  const path = [];
  for (const [i, step] of asArray(pathRaw).entries()) {
    if (step && step.type === "rule" && rulesById[step.id]) { path.push(step); continue; }
    if (step && step.type === "words" && byTopic[step.topic]) { path.push(step); continue; }
    bad.push({ file: "path.json[" + i + "]", problems: ["шаг указывает в пустоту: " + JSON.stringify(step)] });
  }

  if (bad.length) {
    console.warn("── контент: что не загрузилось ──");
    for (const b of bad) {
      console.warn(b.file);
      for (const p of b.problems) console.warn("   " + p);
    }
  }

  return {
    topics, words, wordsById, byTopic,
    rules, rulesById, path,
    places, placesById: byId(places), scenesById,
    sketchTasks, compounds, phrases,
    alphabet: alphabet || { letters: [], combos: [], transcription_help: [] },
    bad
  };
}

// ── мелочи проверки ────────────────────────────────

function asArray(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

function byId(list) {
  const out = {};
  for (const i of list) out[i.id] = i;
  return out;
}

function need(obj, fields, problems, what) {
  for (const f of fields) {
    const v = obj ? obj[f] : undefined;
    const empty = v === undefined || v === null || v === "" ||
      (Array.isArray(v) && v.length === 0);
    if (empty) problems.push(what + " " + (obj && obj.id ? obj.id : "?") + ": нет поля " + f);
  }
}

function checkId(id, problems, seen) {
  const s = String(id || "");
  if (!s) { problems.push("пустой id"); return; }
  if (!/^[a-z_-]+$/.test(s)) {
    problems.push("id «" + s + "»: только строчные латинские буквы, дефис и подчёркивание, без цифр");
  }
  if (seen) {
    if (seen.has(s)) problems.push("id «" + s + "» уже занят в другом файле");
    else seen.add(s);
  }
}

function refs(list, table, where, problems) {
  for (const r of asArray(list)) {
    if (!table[r]) problems.push(where + ": «" + r + "» нет в словаре");
  }
}

export const bannedWords = BANNED_SET;
export { bannedIn };
