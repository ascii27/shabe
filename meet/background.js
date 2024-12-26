// Listen for extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we're on a Google Meet page
  if (tab.url.startsWith('https://meet.google.com/')) {
    console.log('On Google Meet page, toggling UI');
    
    try {
      // Inject CSS if not already injected
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles.css']
      });

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          // Try injecting the content script and retrying
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }).then(() => {
            // Retry sending the message after script injection
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' });
            }, 500);
          });
        } else {
          console.log('Toggle UI response:', response);
        }
      });
    } catch (error) {
      console.error('Error injecting resources:', error);
    }
  } else {
    console.log('Not on Google Meet page');
  }
});
