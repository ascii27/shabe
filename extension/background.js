// Store the window ID
let windowId = null;

// Function to extract room ID from Google Meet URL
function extractMeetRoomId(url) {
  const meetRegex = /^https:\/\/meet\.google\.com\/([a-z0-9-]+)(?:\?.*)?$/;
  const match = url.match(meetRegex);
  return match ? match[1] : null;
}

// Function to check current tab and get room ID
async function checkForMeetRoom() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    const roomId = extractMeetRoomId(tabs[0].url);
    return roomId;
  }
  return null;
}

// Handle extension icon click
chrome.action.onClicked.addListener(async () => {
  const roomId = await checkForMeetRoom();
  
  if (windowId === null) {
    // Create a new window
    chrome.windows.create({
      url: 'window.html',
      type: 'popup',
      width: 400,
      height: 650,
      focused: true
    }, (window) => {
      windowId = window.id;
      
      // If we found a room ID, send it to the popup
      if (roomId) {
        // Wait a bit for the popup to initialize
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'MEET_ROOM_ID',
            roomId: roomId
          });
        }, 500);
      }
    });
  } else {
    // Focus the existing window
    chrome.windows.update(windowId, {
      focused: true
    });
  }
});

// Handle window close
chrome.windows.onRemoved.addListener((removedWindowId) => {
  if (removedWindowId === windowId) {
    windowId = null;
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const roomId = extractMeetRoomId(changeInfo.url);
    if (roomId && windowId !== null) {
      chrome.runtime.sendMessage({
        type: 'MEET_ROOM_ID',
        roomId: roomId
      });
    }
  }
});
