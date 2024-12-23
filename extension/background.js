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
  }
});

// Handle messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INJECT_SPEECH_RECOGNITION') {
    injectSpeechRecognition(request.language);
    return true;
  } else if (request.type === 'STOP_SPEECH_RECOGNITION') {
    stopSpeechRecognition();
    return true;
  }
});

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
