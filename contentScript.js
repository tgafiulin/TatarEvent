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