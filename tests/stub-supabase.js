// Заглушка js/vendor/supabase.js для тестов в настоящем браузере.
// Подменяется вместо настоящего файла (см. README тестов).
// Хранит всё в памяти процесса страницы, никуда в сеть не стучится.

const TABLES = {
  app_user: [], settings: [], word_progress: [], rule_progress: [],
  scene_progress: [], day_log: [], game_log: [], sketch_room: [],
  sketch_message: [], duel_room: [], kv: []
};

export const USERS = {
  matt: { id: "u-matt", email: "matt@test.local" },
  amiko: { id: "u-amiko", email: "amiko@test.local" }
};

export function seed(data) {
  for (const [table, rows] of Object.entries(data)) TABLES[table] = rows;
}

// минимум, без которого вход вообще невозможен
TABLES.app_user = [
  { id: USERS.matt.id, name: "Мэтт" },
  { id: USERS.amiko.id, name: "Амико" }
];
TABLES.settings = [
  { user_id: USERS.matt.id, new_per_day: 8, debt_limit: 80, voice_rate: 0.7, theme: "dark", font_px: 21, accent_style: "mark" },
  { user_id: USERS.amiko.id, new_per_day: 8, debt_limit: 80, voice_rate: 0.7, theme: "dark", font_px: 21, accent_style: "mark" }
];

function match(row, filters) {
  return filters.every(([col, op, val]) => {
    if (op === "eq") return row[col] === val;
    if (op === "is") return (row[col] ?? null) === val;
    return true;
  });
}

const KEY_COLS = {
  word_progress: ["user_id", "word_id"],
  rule_progress: ["user_id", "rule_id"],
  scene_progress: ["user_id", "scene_id"],
  day_log: ["user_id", "day"],
  settings: ["user_id"],
  app_user: ["id"]
};

function builder(table) {
  const filters = [];
  let selectSingle = false, maybe = false, rangeArgs = null;
  const state = {
    _op: null, _payload: null,
    eq(col, val) { filters.push([col, "eq", val]); return this; },
    is(col, val) { filters.push([col, "is", val]); return this; },
    order() { return this; },
    limit() { return this; },
    range(from, to) { rangeArgs = [from, to]; return this; },
    select() { if (!this._op) this._op = "select"; return this; },
    maybeSingle() { maybe = true; return resolve(); },
    single() { selectSingle = true; return resolve(); },
    then(res, rej) { return resolve().then(res, rej); },
    insert(payload) { this._op = "insert"; this._payload = payload; return this; },
    upsert(payload) { this._op = "upsert"; this._payload = payload; return this; },
    update(payload) { this._op = "update"; this._payload = payload; return this; },
    delete() { this._op = "delete"; return this; }
  };

  async function resolve() {
    const rows = TABLES[table] || (TABLES[table] = []);
    if (state._op === "insert" || state._op === "upsert") {
      const items = Array.isArray(state._payload) ? state._payload : [state._payload];
      const keyCols = KEY_COLS[table] || ["id"];
      for (const item of items) {
        const idx = rows.findIndex((r) => keyCols.every((k) => r[k] === item[k]));
        if (idx >= 0) rows[idx] = { ...rows[idx], ...item }; else rows.push({ ...item });
      }
      return { data: selectSingle || maybe ? items[0] : items, error: null };
    }
    if (state._op === "update") {
      for (const r of rows) if (match(r, filters)) Object.assign(r, state._payload);
      return { data: null, error: null };
    }
    if (state._op === "delete") {
      TABLES[table] = rows.filter((r) => !match(r, filters));
      return { data: null, error: null };
    }
    let out = rows.filter((r) => match(r, filters));
    if (rangeArgs) out = out.slice(rangeArgs[0], rangeArgs[1] + 1);
    if (maybe || selectSingle) return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }

  return state;
}

export function createClient() {
  let session = null;
  return {
    auth: {
      async getSession() { return { data: { session } }; },
      async signInWithPassword({ email }) {
        const u = Object.values(USERS).find((x) => x.email === email);
        if (!u) return { data: { session: null, user: null }, error: { message: "нет такой почты" } };
        session = { user: u };
        return { data: { session, user: u }, error: null };
      },
      async signOut() { session = null; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
    },
    from: builder
  };
}
