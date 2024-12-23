// Store the window ID and active tab ID
let windowId = null;
let activeTabId = null;

// Handle extension icon click
chrome.action.onClicked.addListener(() => {
  if (windowId === null) {
    // Create a new window
    chrome.windows.create({
      url: 'window.html',
      type: 'popup',
      width: 400,
      height: 600,
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
    activeTabId = null;
  }
});

// Keep track of the active tab
chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
});

// Handle messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INJECT_SPEECH_RECOGNITION') {
    // Get the active tab if we don't have one
    if (!activeTabId) {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          activeTabId = tabs[0].id;
          injectSpeechRecognitionScript(activeTabId, request.language);
        }
      });
    } else {
      injectSpeechRecognitionScript(activeTabId, request.language);
    }
    return true;
  } else if (request.type === 'STOP_SPEECH_RECOGNITION') {
    if (activeTabId) {
      chrome.scripting.executeScript({
        target: {tabId: activeTabId},
        function: stopSpeechRecognition
      });
    }
    return true;
  }
});

function injectSpeechRecognitionScript(tabId, language) {
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    function: injectSpeechRecognition,
    args: [language]
  }).catch((err) => {
    console.error('Failed to inject script:', err);
    chrome.runtime.sendMessage({
      type: 'SPEECH_ERROR',
      error: 'Failed to start speech recognition. Please make sure you have an active tab open.'
    });
  });
}

// This function will be injected into the page
function injectSpeechRecognition(language) {
  if (!('webkitSpeechRecognition' in window)) {
    chrome.runtime.sendMessage({type: 'SPEECH_ERROR', error: 'Speech recognition not supported'});
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;

  recognition.onstart = () => {
    chrome.runtime.sendMessage({type: 'SPEECH_START'});
  };

  recognition.onend = () => {
    chrome.runtime.sendMessage({type: 'SPEECH_END'});
  };

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      const text = result[0].transcript.trim();
      if (text) {
        chrome.runtime.sendMessage({type: 'SPEECH_RESULT', text: text});
      }
    }
  };

  recognition.onerror = (event) => {
    chrome.runtime.sendMessage({type: 'SPEECH_ERROR', error: event.error});
  };

  try {
    recognition.start();
    window.shabeRecognition = recognition;
  } catch (error) {
    chrome.runtime.sendMessage({type: 'SPEECH_ERROR', error: error.message});
  }
}

function stopSpeechRecognition() {
  if (window.shabeRecognition) {
    window.shabeRecognition.stop();
    delete window.shabeRecognition;
  }
}
