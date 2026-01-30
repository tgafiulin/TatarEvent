console.log('Контент-скрипт загружен');


const initialStyle = document.createElement('style');
initialStyle.textContent = `
  .col-vote-comment,
  .polling-details-table td:nth-child(4) {
      white-space: pre-wrap;
  }
`;
document.head.appendChild(initialStyle);


function hideReview () {
    const style = document.createElement('style');
    style.id = 'custom-style';
    style.textContent = `
      .col-rating-sum b,
      .polling-details-table {
        opacity: 0 !important;
      }
    `;
    document.head.appendChild(style);
}

hideReview();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateStyles') {
    // Логика изменения стилей
    if (request.enable) {
      // Добавляем стили
      hideReview()
    } else {
      // Удаляем стили
      const existingStyle = document.getElementById('custom-style');
      if (existingStyle) existingStyle.remove();
    }
  }
});

// --- Фича "X из Y ревьюеров" на странице списка заявок ---
const POLLING_PATH_REGEX = /^\/polling\/(\d+)\/?$/;

function getConferenceId() {
  const match = location.pathname.match(POLLING_PATH_REGEX);
  return match ? match[1] : null;
}

function fetchPollingData(conferenceId) {
  const url = `https://jevent.jugru.org/ajax/vote/${conferenceId}/polling/`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ excludedStatuses: [], excludedInternalStatuses: [] })
  }).then(r => {
    if (!r.ok) throw new Error(`Polling API ${r.status}`);
    return r.json();
  });
}

function buildVotesMap(speeches) {
  const map = {};
  if (!speeches || !Array.isArray(speeches)) return map;
  for (const speech of speeches) {
    const key = speech.jiraKey;
    if (key == null) continue;
    const votes = speech.speechVotes;
    const total = Array.isArray(votes) ? votes.length : 0;
    const voted = Array.isArray(votes)
      ? votes.filter(v => v != null && v.voteType != null).length
      : 0;
    map[key] = { total, voted };
  }
  return map;
}

const VOTES_BADGE_CLASS = 'tatar-event-votes-badge';

function applyVotesBadges(votesByJiraKey) {
  const rows = document.querySelectorAll('tr');
  for (const row of rows) {
    const jiraCell = row.querySelector('.col-jiraKey div a');
    const ratingCell = row.querySelector('.col-rating-sum div b');
    if (!jiraCell || !ratingCell) continue;

    const jiraKey = jiraCell.textContent.trim();
    if (!jiraKey) continue;

    const counts = votesByJiraKey[jiraKey];
    if (!counts || counts.total === 0) continue;

    let badge = ratingCell.parentElement.querySelector(`.${VOTES_BADGE_CLASS}`);
    if (!badge) {
      badge = document.createElement('div');
      badge.className = VOTES_BADGE_CLASS;
      ratingCell.parentElement.appendChild(badge);
    }
    badge.textContent = `(${counts.voted} из ${counts.total})`;
  }
}

function runVotesBadges() {
  const conferenceId = getConferenceId();
  if (!conferenceId) return;

  fetchPollingData(conferenceId)
    .then(data => {
      const votesByJiraKey = buildVotesMap(data.speeches);
      applyVotesBadges(votesByJiraKey);
    })
    .catch(err => {
      console.warn('TatarEvent: не удалось загрузить данные голосования', err);
    });
}

// Таблица может подгружаться асинхронно (DataTables/Vue) — запускаем с задержкой и повторно
if (POLLING_PATH_REGEX.test(location.pathname)) {
  setTimeout(runVotesBadges, 1500);
  setTimeout(runVotesBadges, 4000);
}