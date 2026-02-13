// Код попапа
document.addEventListener('DOMContentLoaded', function() {
  // Инициализация попапа
  function toggleHideEvent(enable) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateStyles', enable: enable });
      }
    });
  }

  document.getElementById('toggle-on').addEventListener('change', function () {
    toggleHideEvent(false)
  });

  document.getElementById('toggle-off').addEventListener('change', function () {
      toggleHideEvent(true)
  });
});