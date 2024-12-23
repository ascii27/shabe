// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked');
  
  // Check if we're on a Google Meet page
  if (tab.url.startsWith('https://meet.google.com/')) {
    console.log('On Google Meet page, toggling UI');
    
    // Send message to content script to toggle UI
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' })
      .catch(error => {
        console.error('Error sending message:', error);
        
        // If content script isn't ready, inject it
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).then(() => {
          // Try sending the message again after injection
          chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' });
        }).catch(error => {
          console.error('Error injecting content script:', error);
        });
      });
  } else {
    console.log('Not on Google Meet page');
  }
});
