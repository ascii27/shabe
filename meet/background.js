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

// Function to get server URL from storage
async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['serverAddress', 'serverPort'], (items) => {
      const address = items.serverAddress || 'localhost';
      const port = items.serverPort || 8080;
      resolve(`http://${address}:${port}`);
    });
  });
}

// Listen for auth success message from options page
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'authSuccess' && message.token) {
    console.log('Received auth success message in background');
    
    // Broadcast the token to all extension pages
    chrome.runtime.sendMessage({
      type: 'authSuccess',
      token: message.token
    });
  }
});
