// Handle messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INJECT_SPEECH_RECOGNITION') {
    // Inject the content script into the active tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          function: injectSpeechRecognition,
          args: [request.language]
        });
      }
    });
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

// Handle stopping speech recognition
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'STOP_SPEECH_RECOGNITION') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          function: stopSpeechRecognition
        });
      }
    });
    return true;
  }
});

function stopSpeechRecognition() {
  if (window.shabeRecognition) {
    window.shabeRecognition.stop();
    delete window.shabeRecognition;
  }
}
