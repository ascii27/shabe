// Store the window ID
let windowId = null;

// Handle extension icon click
chrome.action.onClicked.addListener(() => {
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
