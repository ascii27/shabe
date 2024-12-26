let ws = null;
let recognition = null;
let isTranslating = false;
let userName = '';
let lastUrl = window.location.href;
let isUIVisible = false;
let uiInitialized = false;
let retryAttempt = 0;
let maxRetryAttempts = 5;
let popupWindow = null;
let currentRoom = null;
let selectedLanguage = 'en';
let isRetrying = false;
let hasHitMaxRetries = false;

// Function to extract room ID from Google Meet URL
function extractMeetRoomId(url) {
  const meetRegex = /^https:\/\/meet\.google\.com\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})(?:\?.*)?$/;
  const match = url.match(meetRegex);
  return match ? match[1] : null;
}

// Function to check if we're in a valid meeting room
function isInMeetingRoom() {
  const roomId = extractMeetRoomId(window.location.href);
  return roomId !== null;
}

// Function to add button with exponential backoff
function addMeetButtonWithBackoff() {
  // Don't start new retry attempt if one is in progress or we've hit max retries
  if (isRetrying || hasHitMaxRetries) {
    return;
  }

  if (!isInMeetingRoom()) {
    console.log('Not in a valid meeting room, waiting...');
    return;
  }

  // Find the "Meeting details" button and navigate up to find the toolbar
  const meetingDetailsButton = document.querySelector('button[aria-label="Meeting details"]');
  if (!meetingDetailsButton) {
    if (retryAttempt >= maxRetryAttempts) {
      console.log('Max retry attempts reached, stopping retries');
      hasHitMaxRetries = true;
      return;
    }

    const backoffDelay = Math.min(1000 * Math.pow(2, retryAttempt), 30000); // Max 30 second delay
    console.log(`Toolbar not found, retrying in ${backoffDelay/1000}s... (attempt ${retryAttempt + 1}/${maxRetryAttempts})`);
    retryAttempt++;
    isRetrying = true;
    setTimeout(() => {
      isRetrying = false;
      addMeetButtonWithBackoff();
    }, backoffDelay);
    return;
  }

  // Reset retry state on success
  retryAttempt = 0;
  isRetrying = false;
  hasHitMaxRetries = false;

  // Navigate up to find the toolbar container (parent of the button's great-grandparent)
  const toolbar = meetingDetailsButton.closest('.tMdQNe');
  if (!toolbar) {
    console.log('Toolbar container not found, retrying in 1s...');
    setTimeout(addMeetButtonWithBackoff, 1000);
    return;
  }

  // Check if our button already exists
  if (document.querySelector('.shabe-button-container')) {
    return;
  }

  console.log('Found Meet toolbar, adding button');

  // Create button container with Meet's standard structure
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'shabe-button-container';
  
  // Create the inner structure to match Meet's button hierarchy
  const innerDiv = document.createElement('div');
  const r6xAKcDiv = document.createElement('div');
  r6xAKcDiv.className = 'r6xAKc';
  
  // Create toggle button with Meet's classes
  const toggleButton = document.createElement('button');
  toggleButton.className = 'VYBDae-Bz112c-LgbsSe VYBDae-Bz112c-LgbsSe-OWXEXe-SfQLQb-suEOdc hk9qKe S5GDme gVYcob JsuyRc boDUxc';
  toggleButton.setAttribute('aria-label', 'Translator');
  toggleButton.setAttribute('role', 'button');
  toggleButton.setAttribute('data-tooltip-enabled', 'true');
  
  // Create the button content structure
  toggleButton.innerHTML = '<i class="google-symbols">translate</i>';
  
  toggleButton.addEventListener('click', toggleUI);

  // Add tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'ne2Ple-oshW8e-V67aGc';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.textContent = 'Translator';

  // Assemble the button hierarchy
  const tooltipWrapper = document.createElement('span');
  tooltipWrapper.setAttribute('data-is-tooltip-wrapper', 'true');
  tooltipWrapper.appendChild(toggleButton);
  tooltipWrapper.appendChild(tooltip);
  
  r6xAKcDiv.appendChild(tooltipWrapper);
  innerDiv.appendChild(r6xAKcDiv);
  buttonContainer.appendChild(innerDiv);

  // Insert before the last button (which is usually the host controls)
  const lastButtonContainer = toolbar.lastElementChild;
  if (lastButtonContainer) {
    toolbar.insertBefore(buttonContainer, lastButtonContainer);
  } else {
    toolbar.appendChild(buttonContainer);
  }
}

// Function to toggle UI visibility
function toggleUI() {
  if (popupWindow && !popupWindow.closed) {
    popupWindow.focus();
    return;
  }

  const container = document.querySelector('.shabe-translator');
  if (!container) return;

  isUIVisible = !isUIVisible;
  container.style.display = isUIVisible ? 'flex' : 'none';

  // Update button state
  const button = document.querySelector('.shabe-button-container button');
  if (button) {
    button.classList.toggle('active', isUIVisible);
  }

  // Connect or disconnect WebSocket based on UI visibility
  if (isUIVisible) {
    connectToRoom();
  } else {
    if (ws) {
      ws.close();
      ws = null;
    }
  }
}

function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window)) {
    console.error('Speech recognition not supported');
    const startButton = document.getElementById('start-translation');
    if (startButton) {
      startButton.disabled = true;
      startButton.title = 'Speech recognition not supported in this browser';
    }
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = getSpeechLangCode(selectedLanguage);

  recognition.onstart = () => {
    console.log('Speech recognition started');
    document.getElementById('start-translation').disabled = true;
    document.getElementById('stop-translation').disabled = false;
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Listening...';
    }
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
    document.getElementById('start-translation').disabled = false;
    document.getElementById('stop-translation').disabled = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const status = document.getElementById('status');
      if (status) {
        status.textContent = 'Connected';
      }
    }
    
    if (isTranslating) {
      recognition.start();
    }
  };

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      const text = result[0].transcript.trim();
      if (text && ws && ws.readyState === WebSocket.OPEN) {
        sendMessage(text);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isTranslating = false;
    document.getElementById('start-translation').disabled = false;
    document.getElementById('stop-translation').disabled = true;
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Error: ' + event.error;
    }
  };
}

function startTranslation() {
  if (!recognition || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  isTranslating = true;
  try {
    recognition.start();
    
    // Update main window
    const startButton = document.getElementById('start-translation');
    const stopButton = document.getElementById('stop-translation');
    const status = document.getElementById('status');
    
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
    if (status) status.textContent = 'Connected';
    
    // Update popup window if it exists
    if (popupWindow && !popupWindow.closed) {
      const popupStartButton = popupWindow.document.getElementById('start-translation');
      const popupStopButton = popupWindow.document.getElementById('stop-translation');
      const popupStatus = popupWindow.document.getElementById('status');
      
      if (popupStartButton) popupStartButton.disabled = true;
      if (popupStopButton) popupStopButton.disabled = false;
      if (popupStatus) popupStatus.textContent = 'Connected';
    }
  } catch (error) {
    console.error('Failed to start translation:', error);
  }
}

function stopTranslation() {
  if (!recognition) return;
  
  isTranslating = false;
  recognition.stop();
  
  // Update main window
  const startButton = document.getElementById('start-translation');
  const stopButton = document.getElementById('stop-translation');
  const status = document.getElementById('status');
  
  if (startButton) startButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
  if (status) status.textContent = 'Paused';
  
  // Update popup window if it exists
  if (popupWindow && !popupWindow.closed) {
    const popupStartButton = popupWindow.document.getElementById('start-translation');
    const popupStopButton = popupWindow.document.getElementById('stop-translation');
    const popupStatus = popupWindow.document.getElementById('status');
    
    if (popupStartButton) popupStartButton.disabled = false;
    if (popupStopButton) popupStopButton.disabled = true;
    if (popupStatus) popupStatus.textContent = 'Paused';
  }
}

function getSpeechLangCode(lang) {
  const langMap = {
    'en': 'en-US',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE'
  };
  return langMap[lang] || 'en-US';
}

// Function to connect to WebSocket
function connectToRoom() {
  const roomId = extractMeetRoomId(window.location.href);
  if (!roomId) {
    console.log('No valid room ID found in URL');
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Not in a valid meeting room';
    }
    return;
  }

  if (ws) {
    ws.close();
  }

  currentRoom = roomId;
  const wsUrl = 'ws://localhost:8080/ws?roomId=' + roomId;
  
  console.log('Connecting to WebSocket:', wsUrl);
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Connected';
    }
    sendPreferences();
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Disconnected';
    }
    if (isTranslating) {
      stopTranslation();
    }
    
    // Only try to reconnect if:
    // 1. We're still in the same room
    // 2. The UI is visible
    // 3. We haven't started a new connection already
    if (extractMeetRoomId(window.location.href) === currentRoom && 
        isUIVisible && 
        !ws) {
      setTimeout(connectToRoom, 5000);
    }
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'message') {
      displayMessage(message.text, false, message.name);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Connection error';
    }
  };
}

// Function to send preferences to the server
function sendPreferences() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  ws.send(JSON.stringify({
    type: 'preferences',
    language: selectedLanguage,
    name: userName
  }));
}

// Function to display a message
function displayMessage(text, isSelf = false, name = 'Anonymous') {
  const message = createMessageElement(text, isSelf, name);
  
  // Add to main window
  const mainMessages = document.querySelector('#messages');
  if (mainMessages) {
    mainMessages.appendChild(message.cloneNode(true));
    mainMessages.scrollTop = mainMessages.scrollHeight;
  }
  
  // Add to popup window if it exists
  if (popupWindow && !popupWindow.closed) {
    const popupMessages = popupWindow.document.querySelector('#messages');
    if (popupMessages) {
      popupMessages.appendChild(message.cloneNode(true));
      popupMessages.scrollTop = popupMessages.scrollHeight;
    }
  }
}

// Function to create a message element
function createMessageElement(text, isSelf = false, name = 'Anonymous') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSelf ? 'own' : ''}`;
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'message-name';
  nameSpan.textContent = name;
  
  const textSpan = document.createElement('span');
  textSpan.className = 'message-text';
  textSpan.textContent = text;
  
  messageDiv.appendChild(nameSpan);
  messageDiv.appendChild(textSpan);
  
  return messageDiv;
}

// Function to send a message
function sendMessage(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !text.trim()) return;
  
  const message = {
    type: 'message',
    text: text,
    language: selectedLanguage,
    name: userName
  };
  
  ws.send(JSON.stringify(message));
  displayMessage(text, true, userName);
}

// Function to create detached window
function createDetachedWindow() {
  if (popupWindow && !popupWindow.closed) {
    popupWindow.focus();
    return;
  }

  const width = 340;
  const height = 500;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  popupWindow = window.open('', 'ShabeTranslator', 
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,location=no`
  );

  if (popupWindow) {
    // Add styles to popup
    const style = popupWindow.document.createElement('style');
    style.textContent = `
      body {
        font-family: 'Google Sans', 'Roboto', sans-serif;
        margin: 0;
        padding: 16px;
        background: white;
        height: calc(100vh - 32px);
        display: flex;
        flex-direction: column;
      }

      .shabe-translator {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 12px;
      }

      .shabe-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: -8px -8px 0 0;
        flex-shrink: 0;
      }

      .shabe-header-status {
        font-size: 14px;
        color: #5f6368;
      }

      .shabe-header-controls {
        display: flex;
        gap: 4px;
      }

      .shabe-icon-button {
        background: none;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 4px;
        color: #5f6368;
        font-size: 14px;
      }

      .shabe-icon-button:hover {
        background-color: rgba(95, 99, 104, 0.1);
      }

      .shabe-icon-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .shabe-inputs-row {
        display: flex;
        gap: 8px;
        margin: 12px 0;
        flex-shrink: 0;
      }

      .shabe-name-input {
        width: 200px;
        padding: 8px 12px;
        border: 1px solid #dadce0;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .shabe-name-input:focus {
        outline: none;
        border-color: #1a73e8;
      }

      .shabe-language-select {
        width: 120px;
        padding: 8px 12px;
        border: 1px solid #dadce0;
        border-radius: 4px;
        font-size: 14px;
        background: white;
      }

      .shabe-language-select:focus {
        outline: none;
        border-color: #1a73e8;
      }

      .shabe-messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        background: #f8f9fa;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.5;
        min-height: 100px;
      }

      .message {
        padding: 12px;
        margin-bottom: 8px;
        border-radius: 8px;
        background: white;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      }

      .message.own {
        background: #e8f0fe;
      }

      .message-name {
        display: block;
        font-weight: 500;
        margin-bottom: 4px;
        color: #202124;
      }

      .message-text {
        display: block;
        color: #3c4043;
      }

      ::-webkit-scrollbar {
        width: 8px;
      }

      ::-webkit-scrollbar-track {
        background: #f1f3f4;
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb {
        background: #dadce0;
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: #bdc1c6;
      }

      /* fallback */
      @font-face {
        font-family: 'Material Symbols Outlined';
        font-style: normal;
        font-weight: 400;
        src: url(chrome-extension://${chrome.runtime.id}/google-symbols.woff2) format('woff2');
      }

      .google-symbols {
          font-family: 'Material Symbols Outlined';
          font-weight: normal;
          font-style: normal;
          font-size: 24px;
          line-height: 1;
          letter-spacing: normal;
          text-transform: none;
          display: inline-block;
          white-space: nowrap;
          word-wrap: normal;
          direction: ltr;
          -webkit-font-feature-settings: 'liga';
          -webkit-font-smoothing: antialiased;
      }
    `;
    popupWindow.document.head.appendChild(style);

    // Create and append the UI elements
    const container = popupWindow.document.createElement('div');
    container.className = 'shabe-translator';
    popupWindow.document.body.appendChild(container);

    // Copy the UI content
    container.innerHTML = document.querySelector('.shabe-translator').innerHTML;

    // Reattach event listeners
    const startButton = container.querySelector('#start-translation');
    const stopButton = container.querySelector('#stop-translation');
    const nameInput = container.querySelector('.shabe-name-input');
    const languageSelect = container.querySelector('.shabe-language-select');

    if (startButton) startButton.addEventListener('click', startTranslation);
    if (stopButton) stopButton.addEventListener('click', stopTranslation);
    if (nameInput) {
      nameInput.value = userName;
      nameInput.addEventListener('change', (e) => {
        userName = e.target.value.trim();
        localStorage.setItem('userName', userName);
        sendPreferences();
      });
    }
    if (languageSelect) {
      languageSelect.value = selectedLanguage;
      languageSelect.addEventListener('change', (e) => {
        selectedLanguage = e.target.value;
        localStorage.setItem('language', selectedLanguage);
        if (recognition) {
          recognition.lang = getSpeechLangCode(selectedLanguage);
          if (isTranslating) {
            stopTranslation();
            startTranslation();
          }
        }
        sendPreferences();
      });
    }

    // Remove the detach button from popup
    const detachButton = container.querySelector('.shabe-icon-button[aria-label="Detach window"]');
    if (detachButton) detachButton.remove();

    // Update the popup window title
    popupWindow.document.title = 'Shabe Translator';

    // Handle window close
    popupWindow.addEventListener('beforeunload', () => {
      isDetached = false;
      const mainContainer = document.querySelector('.shabe-translator');
      if (mainContainer) mainContainer.style.display = '';
    });

    isDetached = true;
    document.querySelector('.shabe-translator').style.display = 'none';
  }
}

// Function to create and inject the translator UI
function createTranslatorUI() {
  if (uiInitialized) return;
  
  const container = document.createElement('div');
  container.className = 'shabe-translator';
  container.style.display = 'none';
  
  // Create header with status and buttons
  const header = document.createElement('div');
  header.className = 'shabe-header';

  const headerStatus = document.createElement('div');
  headerStatus.className = 'shabe-header-status';
  headerStatus.id = 'status';
  headerStatus.textContent = 'Not connected';
  
  const headerControls = document.createElement('div');
  headerControls.className = 'shabe-header-controls';

  const startButton = document.createElement('button');
  startButton.id = 'start-translation';
  startButton.className = 'shabe-icon-button';
  startButton.innerHTML = '<i class="google-symbols">play_circle</i>';
  startButton.setAttribute('aria-label', 'Start Translation');
  startButton.addEventListener('click', startTranslation);
  
  const stopButton = document.createElement('button');
  stopButton.id = 'stop-translation';
  stopButton.className = 'shabe-icon-button';
  stopButton.innerHTML = '<i class="google-symbols">pause_circle</i>';
  stopButton.setAttribute('aria-label', 'Pause Translation');
  stopButton.disabled = true;
  stopButton.addEventListener('click', stopTranslation);
  
  const detachButton = document.createElement('button');
  detachButton.className = 'shabe-icon-button';
  detachButton.innerHTML = '<i class="google-symbols">open_in_new</i>';
  detachButton.setAttribute('aria-label', 'Detach window');
  detachButton.addEventListener('click', createDetachedWindow);

  headerControls.appendChild(startButton);
  headerControls.appendChild(stopButton);
  headerControls.appendChild(detachButton);
  
  header.appendChild(headerStatus);
  header.appendChild(headerControls);
  container.appendChild(header);
  
  // Create inputs row with name and language
  const inputsRow = document.createElement('div');
  inputsRow.className = 'shabe-inputs-row';
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'shabe-name-input';
  nameInput.placeholder = 'Enter your name';
  nameInput.addEventListener('change', (e) => {
    userName = e.target.value.trim();
    localStorage.setItem('userName', userName);
    sendPreferences();
  });
  
  const languageSelect = document.createElement('select');
  languageSelect.className = 'shabe-language-select';
  const languages = {
    'en': 'English',
    'ja': '日本語',
    'ko': '한국어',
    'zh': '中文',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch'
  };
  
  Object.entries(languages).forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    languageSelect.appendChild(option);
  });
  
  languageSelect.addEventListener('change', (e) => {
    selectedLanguage = e.target.value;
    localStorage.setItem('language', selectedLanguage);
    if (recognition) {
      recognition.lang = getSpeechLangCode(selectedLanguage);
      if (isTranslating) {
        stopTranslation();
        startTranslation();
      }
    }
    sendPreferences();
  });
  
  // Add inputs to row
  inputsRow.appendChild(nameInput);
  inputsRow.appendChild(languageSelect);
  container.appendChild(inputsRow);
  
  // Create messages container
  const messages = document.createElement('div');
  messages.id = 'messages';
  messages.className = 'shabe-messages';
  container.appendChild(messages);
  
  document.body.appendChild(container);
  
  // Load saved preferences
  const savedName = localStorage.getItem('userName');
  const savedLanguage = localStorage.getItem('language');
  
  if (savedName) {
    userName = savedName;
    nameInput.value = savedName;
  }
  
  if (savedLanguage) {
    selectedLanguage = savedLanguage;
    languageSelect.value = savedLanguage;
  }
  
  uiInitialized = true;
  
  connectToRoom();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.type === 'TOGGLE_UI') {
    console.log('Toggling UI visibility');
    toggleUI();
    sendResponse({ success: true });
    return true; // Keep the message channel open for the async response
  }
  
  return false;
});

// Function to initialize the UI
function initializeUI() {
  if (uiInitialized) return;
  
  createTranslatorUI();
  
  userName = localStorage.getItem('userName') || 'Anonymous';
  selectedLanguage = localStorage.getItem('language') || 'en';
  
  const nameInput = document.querySelector('.shabe-name-input');
  if (nameInput) {
    nameInput.value = userName;
  }
  
  const languageSelect = document.querySelector('.shabe-language-select');
  if (languageSelect) {
    languageSelect.value = selectedLanguage;
  }
  
  uiInitialized = true;
  
  setupSpeechRecognition();
  
  addMeetButtonWithBackoff();
}

// Watch for URL changes and reinitialize when entering a meeting room
const urlObserver = new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    console.log('URL changed:', url);
    lastUrl = url;
    
    retryAttempt = 0;
    isRetrying = false;
    hasHitMaxRetries = false;
    
    const existingTranslator = document.querySelector('.shabe-translator');
    if (existingTranslator) {
      existingTranslator.remove();
    }
    const existingButton = document.querySelector('.shabe-button-container');
    if (existingButton) {
      existingButton.remove();
    }
    uiInitialized = false;
    
    if (isInMeetingRoom()) {
      console.log('Entered valid meeting room, initializing...');
      setTimeout(initializeUI, 1000);
    } else {
      console.log('Not in a valid meeting room');
    }
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isInMeetingRoom()) {
      setTimeout(initializeUI, 1000);
    }
  });
} else {
  if (isInMeetingRoom()) {
    setTimeout(initializeUI, 1000);
  }
}
