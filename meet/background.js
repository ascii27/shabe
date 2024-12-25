// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
  
  // Check if we're on a Google Meet page
  if (tab.url.startsWith('https://meet.google.com/')) {
    console.log('On Google Meet page, toggling UI');
    
    // Send message to content script to toggle UI and wait for response
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' }, (response) => {
      if (chrome.runtime.lastError) {
        // Handle error when content script is not ready
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Toggle UI response:', response);
      }
    });
  } else {
    console.log('Not on Google Meet page');
  }
});
