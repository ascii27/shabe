// Handle extension icon click
chrome.action.onClicked.addListener(() => {
  // Toggle the translator UI
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.startsWith('https://meet.google.com/')) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: () => {
          const translator = document.querySelector('.shabe-translator');
          if (translator) {
            translator.style.display = translator.style.display === 'none' ? 'flex' : 'none';
          }
        }
      });
    }
  });
});
