let ws = null;
let currentRoom = null;
let selectedLanguage = 'en';
let isUIVisible = true;

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
  });
  
  const status = document.createElement('div');
  status.id = 'shabe-status';
  status.textContent = 'Disconnected';
  
  container.appendChild(languageSelect);
  container.appendChild(status);
  
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
      // TODO: Display translated messages in the Meet UI
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
