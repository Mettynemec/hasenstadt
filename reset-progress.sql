-- Hasenstadt. Разовый сброс прогресса.
-- Это НЕ часть db.sql и не нужен для обычных обновлений.
-- Запускать только один раз, осознанно, когда правда хочется начать с нуля.
-- Стирает слова, правила, сцены, очки и дневные записи у ОБОИХ.
-- Настройки (голос, тема и т.д.) и сами учётки не трогает.

truncate table public.word_progress;
truncate table public.rule_progress;
truncate table public.scene_progress;
truncate table public.day_log;
truncate table public.game_log;
truncate table public.kv;
