import { loadAll } from '../content.js';

let appData = null;

async function ensureData() {
  if (!appData) {
    const version = localStorage.getItem('CONTENT_VERSION') || 'm';
    appData = await loadAll(version);
  }
  return appData;
}

export async function render() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = '<h2>Чтение</h2><div id="reading-list">Загрузка...</div>';

  const version = localStorage.getItem('CONTENT_VERSION') || 'm';
  const res = await fetch(`data/reading/index.json?v=${version}`);
  const texts = await res.json();

  const list = document.getElementById('reading-list');
  list.innerHTML = '';

  for (const txt of texts) {
    const btn = document.createElement('button');
    btn.className = 'menu-item reading-item';
    btn.textContent = txt.title_ru;
    btn.onclick = () => openText(txt.id, txt.title_ru, version);
    list.appendChild(btn);
  }
}

async function openText(id, title, version) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <button class="back-btn" onclick="window.history.back()">← Назад</button>
    <h2>${title}</h2>
    <div id="reading-content" class="reading-text"></div>
    <button id="finish-reading" class="primary-btn" style="margin-top: 20px; display: none;">
      Я всё прочитал (+10 очков)
    </button>
  `;

  const res = await fetch(`data/reading/${id}.json?v=${version}`);
  const data = await res.json();
  const contentDiv = document.getElementById('reading-content');

  const currentData = await ensureData();

  for (const segment of data.segments) {
    if (typeof segment === 'string') {
      const span = document.createElement('span');
      span.textContent = segment + ' ';
      contentDiv.appendChild(span);
    } else {
      const word = currentData.wordsById[segment.w];
      const deForm = word ? (segment.f === 'pl' && word.plural_de ? word.plural_de : word.de) : '???';

      // Показываем немецкое слово, если оно есть в словаре; иначе русское
      const showDe = !!word;

      const span = document.createElement('span');
      span.className = 'reading-word ' + (showDe ? 'known-word' : 'unknown-word');
      span.textContent = showDe ? deForm : segment.ru;
      span.title = word ? `${word.de} / ${word.ru}` : segment.w;
      span.style.cursor = 'pointer';
      span.onclick = () => {
        span.textContent = span.textContent === segment.ru ? deForm : segment.ru;
      };
      contentDiv.appendChild(span);
      contentDiv.appendChild(document.createTextNode(' '));
    }
  }

  document.getElementById('finish-reading').style.display = 'block';
  document.getElementById('finish-reading').onclick = async () => {
    // Начисляем очки через localStorage напрямую
    const pointsKey = 'reading_points_' + (localStorage.getItem('user') || 'default');
    const current = parseInt(localStorage.getItem(pointsKey) || '0', 10);
    localStorage.setItem(pointsKey, String(current + 10));

    // Фиксируем факт прочтения
    localStorage.setItem('read_' + id, 'true');

    alert('Текст прочитан! Начислено 10 очков.');
    window.history.back();
  };
}
