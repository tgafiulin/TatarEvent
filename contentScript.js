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

// --- Шаг 1: Сохранение черновика ревью ---
const DRAFT_KEY_PREFIX = 'tatar-event-draft-';
const DRAFT_DEBOUNCE_MS = 400;
const REVIEW_FORM_SELECTOR = '.editSpeechVoteCommentForm';

function getDraftKey(speechId) {
  return DRAFT_KEY_PREFIX + speechId;
}

function getDraftFieldsFromForm(form) {
  const commentEl = form.querySelector('textarea[name="comment"]');
  const ratingEl = form.querySelector('input[name="rating"]');
  const voteTypeEl = form.querySelector('select[name="speechVoteType"]');
  return {
    comment: commentEl ? commentEl.value : '',
    rating: ratingEl ? ratingEl.value : '',
    speechVoteType: voteTypeEl ? voteTypeEl.value : ''
  };
}

function hasAnyDraftContent(fields) {
  return (
    (fields.comment && fields.comment.trim() !== '') ||
    (fields.rating && fields.rating.trim() !== '') ||
    (fields.speechVoteType && fields.speechVoteType.trim() !== '')
  );
}

function normalizeField(value) {
  if (value == null) return '';
  return String(value).trim();
}

function draftEqualsForm(draft, formFields) {
  return (
    normalizeField(draft.comment) === normalizeField(formFields.comment) &&
    normalizeField(draft.rating) === normalizeField(formFields.rating) &&
    normalizeField(draft.speechVoteType) === normalizeField(formFields.speechVoteType)
  );
}

function saveDraftForForm(form) {
  const speechIdEl = form.querySelector('input[name="speechId"]');
  if (!speechIdEl || !speechIdEl.value) return;

  const speechId = speechIdEl.value.trim();
  const fields = getDraftFieldsFromForm(form);

  if (!hasAnyDraftContent(fields)) return;

  const payload = {
    savedAt: Date.now(),
    comment: fields.comment,
    rating: fields.rating,
    speechVoteType: fields.speechVoteType
  };

  chrome.storage.local.set({ [getDraftKey(speechId)]: payload });
}

// --- Шаг 2: Предложение восстановления черновика ---
const RESTORE_BLOCK_CLASS = 'tatar-event-restore-draft';

function formatDraftDate(savedAt) {
  if (typeof savedAt !== 'number') return '';
  return new Date(savedAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fillFormFromDraft(form, draft) {
  const commentEl = form.querySelector('textarea[name="comment"]');
  const ratingEl = form.querySelector('input[name="rating"]');
  const voteTypeEl = form.querySelector('select[name="speechVoteType"]');
  if (commentEl && draft.comment != null) commentEl.value = draft.comment;
  if (ratingEl && draft.rating != null) ratingEl.value = draft.rating;
  if (voteTypeEl && draft.speechVoteType != null) voteTypeEl.value = draft.speechVoteType;
}

function showRestoreDraftUI(form, draft) {
  const existing = form.parentElement.querySelector('.' + RESTORE_BLOCK_CLASS);
  if (existing) return;

  const block = document.createElement('div');
  block.className = RESTORE_BLOCK_CLASS;
  const dateStr = formatDraftDate(draft.savedAt);
  block.innerHTML = `
    <p style="margin: 0 0 8px 0;">Восстановить черновик от ${dateStr}?</p>
    <button type="button" data-action="restore" style="margin-right: 8px;">Восстановить</button>
    <button type="button" data-action="cancel">Отменить</button>
  `;

  block.querySelector('[data-action="restore"]').addEventListener('click', () => {
    fillFormFromDraft(form, draft);
    form.dataset.tatarDraftDirty = '1';
    block.remove();
  });
  block.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    block.remove();
  });

  form.parentNode.insertBefore(block, form);
}

function showRestoreOrDeleteDraftUI(form, draft, key) {
  const existing = form.parentElement.querySelector('.' + RESTORE_BLOCK_CLASS);
  if (existing) return;

  const block = document.createElement('div');
  block.className = RESTORE_BLOCK_CLASS;
  block.innerHTML = `
    <p style="margin: 0 0 8px 0;">Есть черновик, отличающийся от сохранённого. Восстановить черновик или удалить его?</p>
    <button type="button" data-action="restore" style="margin-right: 8px;">Восстановить</button>
    <button type="button" data-action="delete">Удалить</button>
  `;

  block.querySelector('[data-action="restore"]').addEventListener('click', () => {
    fillFormFromDraft(form, draft);
    form.dataset.tatarDraftDirty = '1';
    block.remove();
  });
  block.querySelector('[data-action="delete"]').addEventListener('click', () => {
    chrome.storage.local.remove(key);
    block.remove();
  });

  form.parentNode.insertBefore(block, form);
}

function checkAndShowRestoreDraft(form) {
  const speechIdEl = form.querySelector('input[name="speechId"]');
  if (!speechIdEl || !speechIdEl.value.trim()) return;

  const speechId = speechIdEl.value.trim();
  const key = getDraftKey(speechId);
  const formFields = getDraftFieldsFromForm(form);

  chrome.storage.local.get([key], (result) => {
    const draft = result[key];
    if (!draft || !hasAnyDraftContent(draft)) return;

    // Форма пустая — предлагаем восстановление
    if (!hasAnyDraftContent(formFields)) {
      showRestoreDraftUI(form, draft);
      return;
    }

    // Форма не пустая — сравниваем с черновиком
    if (draftEqualsForm(draft, formFields)) {
      chrome.storage.local.remove(key);
      return;
    }
    showRestoreOrDeleteDraftUI(form, draft, key);
  });
}

function setupDraftSaveForForm(form) {
  if (form.dataset.tatarDraftSetup === '1') return;
  form.dataset.tatarDraftSetup = '1';

  let debounceTimer = null;

  function scheduleSave() {
    form.dataset.tatarDraftDirty = '1';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      saveDraftForForm(form);
    }, DRAFT_DEBOUNCE_MS);
  }

  const commentEl = form.querySelector('textarea[name="comment"]');
  const ratingEl = form.querySelector('input[name="rating"]');
  const voteTypeEl = form.querySelector('select[name="speechVoteType"]');

  if (commentEl) commentEl.addEventListener('input', scheduleSave);
  if (commentEl) commentEl.addEventListener('change', scheduleSave);
  if (ratingEl) ratingEl.addEventListener('input', scheduleSave);
  if (ratingEl) ratingEl.addEventListener('change', scheduleSave);
  if (voteTypeEl) voteTypeEl.addEventListener('change', scheduleSave);

  checkAndShowRestoreDraft(form);
}

function saveAllVisibleDrafts() {
  const forms = document.querySelectorAll(REVIEW_FORM_SELECTOR);
  forms.forEach((form) => {
    if (form.dataset.tatarDraftDirty === '1') saveDraftForForm(form);
  });
}

function initDraftObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const forms = [];
        if (node.matches && node.matches(REVIEW_FORM_SELECTOR)) forms.push(node);
        if (node.querySelectorAll) forms.push(...node.querySelectorAll(REVIEW_FORM_SELECTOR));
        for (const form of forms) {
          setupDraftSaveForForm(form);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (POLLING_PATH_REGEX.test(location.pathname)) {
  initDraftObserver();
  // Формы могут уже быть в DOM (например, раскрытая строка)
  document.querySelectorAll(REVIEW_FORM_SELECTOR).forEach(setupDraftSaveForForm);
  window.addEventListener('beforeunload', saveAllVisibleDrafts);
  window.addEventListener('pagehide', saveAllVisibleDrafts);
}