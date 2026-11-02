-- Hasenstadt. Скрипт для базы.
-- Вставить целиком в SQL Editor в панели Supabase и нажать Run.
-- Запускать можно сколько угодно раз: ничего не ломается и не затирается.

-- ЧАСТЬ ПЕРВАЯ: таблицы

create table if not exists public.app_user (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'без имени',
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  session_size         integer not null default 30,
  new_per_day          integer not null default 8,
  debt_limit           integer not null default 80,
  theme                text    not null default 'dark',
  font_px              integer not null default 21,
  voice_name           text,
  voice_rate           real    not null default 0.9,
  autoplay             boolean not null default true,
  sounds               boolean not null default false,
  volume               integer not null default 50,
  counter_digits       boolean not null default true,
  insult_button        boolean not null default true,
  animations           boolean not null default true,
  bonus_topics         jsonb   not null default '[]'::jsonb,
  gaps_count           integer,
  updated_at           timestamptz not null default now()
);

create table if not exists public.word_progress (
  user_id          uuid    not null references auth.users(id) on delete cascade,
  word_id          text    not null,
  topic_id         text    not null,
  grade            smallint,
  lock_see         boolean not null default false,
  lock_write       boolean not null default false,
  lock_hear        boolean not null default false,
  lock_see_day     date,
  lock_write_day   date,
  lock_hear_day    date,
  last_lock        text,
  err_see          boolean not null default false,
  err_write        boolean not null default false,
  err_hear         boolean not null default false,
  shows            integer not null default 0,
  errors           integer not null default 0,
  next_due         date,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz,
  gold_at          timestamptz,
  game_stumbles    integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (user_id, word_id)
);

create table if not exists public.rule_progress (
  user_id   uuid    not null references auth.users(id) on delete cascade,
  rule_id   text    not null,
  done      boolean not null default false,
  done_at   timestamptz,
  primary key (user_id, rule_id)
);

create table if not exists public.scene_progress (
  user_id      uuid    not null references auth.users(id) on delete cascade,
  scene_id     text    not null,
  done_count   integer not null default 0,
  pair_count   integer not null default 0,
  last_done_at timestamptz,
  primary key (user_id, scene_id)
);

create table if not exists public.day_log (
  user_id   uuid    not null references auth.users(id) on delete cascade,
  day       date    not null,
  cards     integer not null default 0,
  right_n   integer not null default 0,
  wrong_n   integer not null default 0,
  new_n     integer not null default 0,
  primary key (user_id, day)
);

create table if not exists public.game_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  game        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.sketch_room (
  id          text primary key,
  task_id     text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create table if not exists public.sketch_message (
  id          bigserial primary key,
  room_id     text not null references public.sketch_room(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null,
  marks       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.duel_room (
  id          text primary key,
  created_by  uuid not null references auth.users(id) on delete cascade,
  words       jsonb not null default '[]'::jsonb,
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.kv (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- Догоняющие столбцы: нужны, если таблицы уже были созданы прошлой версией скрипта.

alter table public.settings add column if not exists volume       integer not null default 50;
alter table public.settings add column if not exists animations   boolean not null default true;
alter table public.settings add column if not exists bonus_topics jsonb   not null default '[]'::jsonb;
alter table public.settings add column if not exists gaps_count   integer;

-- ЧАСТЬ ВТОРАЯ: ускорители

create index if not exists wp_due_idx   on public.word_progress (user_id, next_due);
create index if not exists wp_grade_idx on public.word_progress (user_id, grade);
create index if not exists wp_topic_idx on public.word_progress (user_id, topic_id);
create index if not exists sm_room_idx  on public.sketch_message (room_id, created_at);

-- ЧАСТЬ ТРЕТЬЯ: права и защита строк

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant delete on public.sketch_message to authenticated;

alter table public.app_user       enable row level security;
alter table public.settings       enable row level security;
alter table public.word_progress  enable row level security;
alter table public.rule_progress  enable row level security;
alter table public.scene_progress enable row level security;
alter table public.day_log        enable row level security;
alter table public.game_log       enable row level security;
alter table public.sketch_room    enable row level security;
alter table public.sketch_message enable row level security;
alter table public.duel_room      enable row level security;
alter table public.kv             enable row level security;

-- Читать можно всё: в приложении ровно два человека, и они видят прогресс друг друга.
-- Писать можно только свои строки.
-- Всё сделано циклами, поэтому скрипт можно запускать повторно без ошибок.

do $$
declare t text;
begin
  foreach t in array array['app_user','settings','word_progress','rule_progress',
                           'scene_progress','day_log','game_log','kv',
                           'sketch_room','sketch_message','duel_room']
  loop
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
  end loop;

  -- таблицы, где владелец определяется полем user_id
  foreach t in array array['settings','word_progress','rule_progress',
                           'scene_progress','day_log','game_log','kv','sketch_message']
  loop
    execute format('drop policy if exists own_ins on public.%I', t);
    execute format('drop policy if exists own_upd on public.%I', t);
    execute format('create policy own_ins on public.%I for insert to authenticated
                      with check (auth.uid() = user_id)', t);
    execute format('create policy own_upd on public.%I for update to authenticated
                      using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;

  -- комнаты парных игр: пишут оба, потому что игра общая
  foreach t in array array['sketch_room','duel_room']
  loop
    execute format('drop policy if exists both_ins on public.%I', t);
    execute format('drop policy if exists both_upd on public.%I', t);
    execute format('create policy both_ins on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy both_upd on public.%I for update to authenticated using (true)', t);
  end loop;
end $$;

-- app_user: владелец определяется полем id, поэтому отдельно

drop policy if exists own_ins on public.app_user;
drop policy if exists own_upd on public.app_user;
create policy own_ins on public.app_user for insert to authenticated
  with check (auth.uid() = id);
create policy own_upd on public.app_user for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- своё сообщение в сценке можно удалить, чужое нельзя

drop policy if exists own_del on public.sketch_message;
create policy own_del on public.sketch_message for delete to authenticated
  using (auth.uid() = user_id);

-- ЧАСТЬ ЧЕТВЁРТАЯ: живые обновления для парных игр

do $$
begin
  begin
    alter publication supabase_realtime add table public.sketch_message;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.duel_room;
  exception when duplicate_object then null;
  end;
end $$;
