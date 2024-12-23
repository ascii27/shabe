let ws = null;
let currentRoom = null;
let selectedLanguage = 'en';

// Function to extract room ID from Google Meet URL
function extractMeetRoomId(url) {
  const meetRegex = /^https:\/\/meet\.google\.com\/([a-z0-9-]+)(?:\?.*)?$/;
  const match = url.match(meetRegex);
  return match ? match[1] : null;
}

// Function to create and inject the translator UI
function createTranslatorUI() {
  const container = document.createElement('div');
  container.className = 'shabe-translator';
  
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
  
  // Find Google Meet's right panel and insert our UI
  const observer = new MutationObserver((mutations, obs) => {
    const rightPanel = document.querySelector('[data-meeting-panel-id="1"]');
    if (rightPanel) {
      rightPanel.parentElement.insertBefore(container, rightPanel);
      obs.disconnect();
      
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
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Function to connect to WebSocket
function connectToRoom() {
  const roomId = extractMeetRoomId(window.location.href);
  if (!roomId) return;
  
  if (ws) {
    ws.close();
  }
  
  currentRoom = roomId;
  const wsUrl = `ws://localhost:8080/ws?roomId=${currentRoom}`;
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    document.getElementById('shabe-status').textContent = 'Connected';
    sendPreferences();
  };
  
  ws.onclose = () => {
    document.getElementById('shabe-status').textContent = 'Disconnected';
    setTimeout(() => {
      if (currentRoom) {
        connectToRoom();
      }
    }, 2000);
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'message') {
      // TODO: Display translated messages in the Meet UI
      console.log('Received message:', message.text);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    document.getElementById('shabe-status').textContent = 'Connection error';
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

// Listen for URL changes (for when user switches rooms)
let lastUrl = window.location.href;
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    connectToRoom();
  }
}).observe(document, { subtree: true, childList: true });

// Initialize
createTranslatorUI();
