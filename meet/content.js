let ws = null;
let currentRoom = null;
let selectedLanguage = 'en';
let recognition = null;
let isTranslating = false;
let userName = 'Anonymous';
let lastUrl = window.location.href;
let isUIVisible = false;
let uiInitialized = false;
let retryAttempt = 0;
let maxRetryAttempts = 5;
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
  toggleButton.innerHTML = `
    <span class="OiePBf-zPjgPe VYBDae-Bz112c-UHGRz"></span>
    <span class="RBHQF-ksKsZd"></span>
    <span aria-hidden="true" class="VYBDae-Bz112c-kBDsod-Rtc0Jf">
      <i aria-hidden="true" class="google-symbols ebW6mc NtU4hc">translate</i>
      <i aria-hidden="true" class="google-symbols hi38gd Mwv9k">translate</i>
    </span>
    <div class="VYBDae-Bz112c-RLmnJb"></div>
  `;

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
  console.log('Toggling UI visibility');
  const translator = document.querySelector('.shabe-translator');
  if (translator) {
    isUIVisible = !isUIVisible;
    translator.style.display = isUIVisible ? 'flex' : 'none';
    
    // Update button state
    const button = document.querySelector('.shabe-toggle-button');
    if (button) {
      button.classList.toggle('active', isUIVisible);
    }
  } else {
    console.log('No translator UI found, creating one...');
    isUIVisible = true;
    createTranslatorUI();
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
  } catch (error) {
    console.error('Failed to start translation:', error);
  }
}

function stopTranslation() {
  if (!recognition) return;
  
  isTranslating = false;
  try {
    recognition.stop();
  } catch (error) {
    console.error('Failed to stop translation:', error);
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
    // Try to reconnect after a delay if we're still in a valid room
    if (extractMeetRoomId(window.location.href) === currentRoom) {
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
function displayMessage(text, isOwn = false, senderName = '') {
  const messages = document.getElementById('messages');
  if (!messages) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isOwn ? 'own' : ''}`;
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'message-name';
  nameSpan.textContent = senderName || (isOwn ? userName : 'Anonymous');
  
  const textSpan = document.createElement('span');
  textSpan.className = 'message-text';
  textSpan.textContent = text;
  
  messageDiv.appendChild(nameSpan);
  messageDiv.appendChild(textSpan);
  
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  // Remove old messages if there are too many
  while (messages.children.length > 50) {
    messages.removeChild(messages.firstChild);
  }
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

// Function to create and inject the translator UI
function createTranslatorUI() {
  if (uiInitialized) return;
  
  // Create translator panel
  const container = document.createElement('div');
  container.className = 'shabe-translator';
  container.style.display = 'none';
  
  // Create name input
  const nameContainer = document.createElement('div');
  nameContainer.className = 'shabe-name-container';
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Enter your name';
  nameInput.value = userName;
  nameInput.className = 'shabe-name-input';
  nameInput.addEventListener('change', (e) => {
    userName = e.target.value.trim() || 'Anonymous';
    localStorage.setItem('userName', userName);
    sendPreferences();
  });
  
  nameContainer.appendChild(nameInput);
  
  // Create language selector
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
  
  for (const [code, name] of Object.entries(languages)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    if (code === selectedLanguage) {
      option.selected = true;
    }
    languageSelect.appendChild(option);
  }
  
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
  
  // Create translation controls
  const controls = document.createElement('div');
  controls.className = 'shabe-controls';
  
  const startButton = document.createElement('button');
  startButton.textContent = 'Start';
  startButton.id = 'start-translation';
  startButton.addEventListener('click', startTranslation);
  
  const stopButton = document.createElement('button');
  stopButton.textContent = 'Pause';
  stopButton.id = 'stop-translation';
  stopButton.disabled = true;
  stopButton.addEventListener('click', stopTranslation);
  
  // Create status display
  const status = document.createElement('div');
  status.id = 'status';
  status.className = 'shabe-status';
  status.textContent = 'Not connected';
  
  // Create messages container
  const messages = document.createElement('div');
  messages.id = 'messages';
  messages.className = 'shabe-messages';
  
  // Assemble the UI
  controls.appendChild(startButton);
  controls.appendChild(stopButton);
  container.appendChild(nameContainer);
  container.appendChild(languageSelect);
  container.appendChild(controls);
  container.appendChild(status);
  container.appendChild(messages);
  
  // Add to page
  document.body.appendChild(container);
  
  // Load saved preferences
  const savedName = localStorage.getItem('userName');
  const savedLanguage = localStorage.getItem('language');
  
  if (savedName) {
    userName = savedName;
    nameInput.value = userName;
  }
  
  if (savedLanguage) {
    selectedLanguage = savedLanguage;
    languageSelect.value = selectedLanguage;
  }
  
  uiInitialized = true;
  
  // Connect to room if valid room ID exists
  connectToRoom();
}

// Function to initialize the UI
function initializeUI() {
  // Only initialize if we're in a valid meeting room
  if (!isInMeetingRoom()) {
    console.log('Not in a valid meeting room, skipping initialization');
    return;
  }

  // Check if we're already initialized
  if (document.querySelector('.shabe-translator')) {
    console.log('UI already initialized');
    return;
  }

  console.log('Initializing UI...');

  // Create and inject the UI
  createTranslatorUI();
  
  // Set up speech recognition
  setupSpeechRecognition();
  
  // Start looking for the toolbar
  addMeetButtonWithBackoff();
}

// Watch for URL changes and reinitialize when entering a meeting room
const urlObserver = new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    console.log('URL changed:', url);
    lastUrl = url;
    
    // Reset all retry-related state
    retryAttempt = 0;
    isRetrying = false;
    hasHitMaxRetries = false;
    
    // Remove existing UI elements before reinitializing
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
