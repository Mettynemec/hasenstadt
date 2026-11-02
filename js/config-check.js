// Проверка, что config.js заполнен. Делается до всего остального,
// чтобы Мэтт увидел понятную строку, а не пустой экран.

const STUBS = [
  "сюда вставить адрес проекта",
  "сюда вставить публичный ключ",
  "почта Мэтта",
  "почта Амико"
];

export function configReady(cfg) {
  if (!cfg) return false;
  const url = String(cfg.SUPABASE_URL || "").trim();
  const key = String(cfg.SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) return false;
  if (STUBS.includes(url) || STUBS.includes(key)) return false;
  if (!/^https:\/\/.+/.test(url)) return false;
  return true;
}

// Имя по почте. Если в config.js имена не вписаны — берём до собачки.
export function nameForEmail(cfg, email) {
  const mail = String(email || "").trim().toLowerCase();
  const map = (cfg && cfg.NAMES) || {};
  for (const [k, v] of Object.entries(map)) {
    if (STUBS.includes(k)) continue;
    if (String(k).trim().toLowerCase() === mail) return v;
  }
  const first = mail.split("@")[0] || "без имени";
  return first.charAt(0).toUpperCase() + first.slice(1);
}
