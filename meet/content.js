let ws = null;
let currentRoom = null;
let selectedLanguage = 'en';
let isUIVisible = true;
let recognition = null;
let isTranslating = false;

// Function to extract room ID from Google Meet URL
function extractMeetRoomId(url) {
  const meetRegex = /^https:\/\/meet\.google\.com\/([a-z0-9-]+)(?:\?.*)?$/;
  const match = url.match(meetRegex);
  return match ? match[1] : null;
}

// Function to create and inject the translator UI
function createTranslatorUI() {
  console.log('Creating translator UI...');
  
  // Remove existing UI if present
  const existingUI = document.querySelector('.shabe-translator');
  if (existingUI) {
    existingUI.remove();
  }
  
  const container = document.createElement('div');
  container.className = 'shabe-translator';
  container.style.display = isUIVisible ? 'flex' : 'none';
  
  const languageSelect = document.createElement('select');
  languageSelect.id = 'shabe-language';
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
    languageSelect.appendChild(option);
  }
  
  languageSelect.addEventListener('change', (e) => {
    selectedLanguage = e.target.value;
    if (ws) {
      sendPreferences();
    }
    // Save language preference
    chrome.storage.sync.set({ language: selectedLanguage });
    
    // Update speech recognition language if active
    if (recognition) {
      recognition.lang = getSpeechLangCode(selectedLanguage);
      if (isTranslating) {
        stopTranslation();
        startTranslation();
      }
    }
  });
  
  const controls = document.createElement('div');
  controls.className = 'shabe-controls';
  
  const startButton = document.createElement('button');
  startButton.id = 'start-translation';
  startButton.textContent = 'Start Translation';
  startButton.addEventListener('click', startTranslation);
  
  const stopButton = document.createElement('button');
  stopButton.id = 'stop-translation';
  stopButton.textContent = 'Pause Translation';
  stopButton.disabled = true;
  stopButton.addEventListener('click', stopTranslation);
  
  controls.appendChild(startButton);
  controls.appendChild(stopButton);
  
  const status = document.createElement('div');
  status.id = 'shabe-status';
  status.textContent = 'Disconnected';
  
  const messages = document.createElement('div');
  messages.id = 'shabe-messages';
  messages.className = 'shabe-messages';
  
  container.appendChild(languageSelect);
  container.appendChild(controls);
  container.appendChild(status);
  container.appendChild(messages);
  
  // Insert the UI into the document
  document.body.appendChild(container);
  console.log('Translator UI created and inserted');
  
  // Load saved language preference
  chrome.storage.sync.get(['language'], (result) => {
    if (result.language) {
      languageSelect.value = result.language;
      selectedLanguage = result.language;
    }
  });
  
  // Connect to WebSocket
  connectToRoom();
  
  // Initialize speech recognition
  setupSpeechRecognition();
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
    const startButton = document.getElementById('start-translation');
    const stopButton = document.getElementById('stop-translation');
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
    const startButton = document.getElementById('start-translation');
    const stopButton = document.getElementById('stop-translation');
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    
    // Restart if we're still translating
    if (isTranslating) {
      recognition.start();
    }
  };

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      const text = result[0].transcript.trim();
      if (text) {
        sendMessage(text);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isTranslating = false;
    const startButton = document.getElementById('start-translation');
    const stopButton = document.getElementById('stop-translation');
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
  };
}

function startTranslation() {
  if (!recognition) return;
  
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
  console.log('Connecting to room...');
  const roomId = extractMeetRoomId(window.location.href);
  if (!roomId) {
    console.log('No room ID found');
    return;
  }
  
  if (ws) {
    ws.close();
  }
  
  currentRoom = roomId;
  const wsUrl = `ws://localhost:8080/ws?roomId=${currentRoom}`;
  console.log('Connecting to WebSocket:', wsUrl);
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Connected';
    }
    sendPreferences();
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Disconnected';
    }
    setTimeout(() => {
      if (currentRoom) {
        connectToRoom();
      }
    }, 2000);
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'message') {
      console.log('Received message:', message.text);
      displayMessage(message.text, false);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Connection error';
    }
  };
}

// Function to send preferences to the server
function sendPreferences() {
  if (!ws) return;
  
  const message = {
    type: 'preferences',
    language: selectedLanguage
  };
  
  ws.send(JSON.stringify(message));
}

// Function to display a message
function displayMessage(text, isOwn = false) {
  const messages = document.getElementById('shabe-messages');
  if (!messages) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `shabe-message ${isOwn ? 'own' : 'other'}`;
  messageDiv.textContent = text;
  
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  // Remove old messages if there are too many
  while (messages.children.length > 50) {
    messages.removeChild(messages.firstChild);
  }
}

// Function to send a message
function sendMessage(text) {
  if (!ws || !text.trim()) return;
  
  const message = {
    type: 'message',
    text: text,
    roomId: currentRoom,
    language: selectedLanguage
  };
  
  ws.send(JSON.stringify(message));
  displayMessage(text, true);
}

// Function to toggle UI visibility
function toggleUI() {
  console.log('Toggling UI visibility');
  const translator = document.querySelector('.shabe-translator');
  if (translator) {
    isUIVisible = !isUIVisible;
    translator.style.display = isUIVisible ? 'flex' : 'none';
  } else {
    console.log('No translator UI found, creating one...');
    isUIVisible = true;
    createTranslatorUI();
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  if (message.type === 'TOGGLE_UI') {
    toggleUI();
  }
  return true;
});

// Listen for URL changes (for when user switches rooms)
let lastUrl = window.location.href;
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    console.log('URL changed:', url);
    lastUrl = url;
    connectToRoom();
  }
}).observe(document, { subtree: true, childList: true });

// Initialize when the page is ready
console.log('Content script loaded, creating UI...');
createTranslatorUI();
