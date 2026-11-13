// Единственный файл, который надо заполнить руками.
// Что куда вставить — в инструкции, блок Ж.
// Больше ничего в программе менять не нужно.

export const CONFIG = {

  // Название приложения. Подставляется во все заголовки.
  APP_NAME: "Hasenstadt",

  // Адрес проекта базы. Похож на https://abcdefgh.supabase.co
  SUPABASE_URL: "https://ttrmbjkyqumcvejqspye.supabase.co/rest/v1/",

  // Открытый ключ. Очень длинная строка, помеченная anon public.
  SUPABASE_ANON_KEY: "sb_publishable_ZHydIw0O1sBzg_HoSQUV_w_BgL7UVsd",

  // Меняется при заливке нового контента: a, b, c и дальше.
  CONTENT_VERSION: "b",

  // Имена в интерфейсе. Слева почта, справа имя.
  NAMES: {
    "почта Мэтта": "Мэтт",
    "почта Амико": "Амико"
  },

  // Живое произношение. Открывается только по нажатию ссылки.
  FORVO_URL: "https://forvo.com/word/"
};
