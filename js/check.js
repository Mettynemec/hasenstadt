// Проверка ввода. Общее правило: сомнение в пользу человека.
// Регистр, ударение, лишние пробелы и точки не штрафуются никогда.

const ARTICLES = ["der", "die", "das"];

export function normalizeCommon(s) {
  return String(s == null ? "" : s)
    .replace(/ /g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeTr(s) {
  return normalizeCommon(s)
    .replace(/ё/g, "е")
    .replace(/[-'’`]/g, "")
    .replace(/[ъь]/g, "");
}

export function normalizeDe(s) {
  return normalizeCommon(s)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[-'’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Расстояние редактирования с перестановкой соседних, с потолком.
// Больше двух шагов считать незачем: это уже другое слово.
export function distance(a, b, cap) {
  const max = cap === undefined ? 2 : cap;
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const prev2 = [];
  let prev = [];
  let cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2.length = 0;
    prev2.push(...prev);
    prev = cur;
  }
  return prev[b.length];
}

// Одно сравнение со списком эталонов.
function matchList(input, list, norm, minLen) {
  const got = norm(input);
  if (!got) return { ok: false, almost: false };
  for (const e of list) {
    if (got === norm(e)) return { ok: true, almost: false };
  }
  if (got.length >= (minLen || 4)) {
    for (const e of list) {
      const want = norm(e);
      if (want.length >= (minLen || 4) && distance(got, want, 1) === 1) {
        return { ok: true, almost: true };
      }
    }
  }
  return { ok: false, almost: false };
}

// ── транскрипция русскими буквами ──────────────────

export function checkTranscription(input, word) {
  const list = [word.tr, ...(word.tr_ok || [])].filter(Boolean);
  const r = matchList(input, list, normalizeTr, 4);
  return { ok: r.ok, almost: r.almost, canonical: word.tr };
}

// ── немецкое слово ─────────────────────────────────

export function checkGerman(input, word) {
  const isNoun = word.pos === "noun" && !!word.article;
  const raw = String(input == null ? "" : input).replace(/ /g, " ").trim();

  // отделяем артикль, если он есть
  let rest = raw;
  let givenArticle = "";
  const m = raw.match(/^([A-Za-zÄÖÜäöüß]+)\s+(.+)$/);
  if (m && ARTICLES.includes(normalizeDe(m[1]))) {
    givenArticle = normalizeDe(m[1]);
    rest = m[2].trim();
  }

  const stem = [word.de, ...(word.de_ok || [])].filter(Boolean);
  const r = matchList(rest, stem, normalizeDe, 4);

  let articleError = false;
  if (isNoun) {
    articleError = givenArticle !== normalizeDe(word.article);
  }

  // большая буква у существительных прощается, но подсвечивается
  let caseWarning = false;
  if (isNoun && r.ok) {
    const first = rest.replace(/^[^A-Za-zÄÖÜäöüß]+/, "").charAt(0);
    if (first && first === first.toLowerCase() && first !== first.toUpperCase()) caseWarning = true;
  }

  return {
    ok: r.ok,
    almost: r.almost,
    articleError: r.ok ? articleError : false,
    caseWarning,
    givenArticle,
    canonical: canonical(word)
  };
}

export function canonical(word) {
  const art = word.pos === "noun" && word.article ? word.article + " " : "";
  return art + word.de;
}

// Полная строка словаря: der Tisch, -e — ТИш — стол
export function dictLine(word) {
  const art = word.pos === "noun" && word.article ? word.article + " " : "";
  const pl = word.pos === "noun" && word.plural ? ", " + word.plural : "";
  return art + word.de + pl + " — " + word.tr + " — " + word.ru;
}

// ── перевод по-русски ──────────────────────────────

export function checkRussian(input, variants) {
  const list = (Array.isArray(variants) ? variants : [variants]).filter(Boolean);
  const r = matchList(input, list, normalizeTr, 4);
  return { ok: r.ok, almost: r.almost, canonical: list[0] };
}

// ── одно слово в пропуске ──────────────────────────

export function checkGap(input, expected) {
  const r = matchList(input, [expected], normalizeDe, 4);
  return { ok: r.ok, almost: r.almost, canonical: expected };
}

export { ARTICLES };
