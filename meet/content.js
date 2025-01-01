let ws = null;
let recognition = null;
let isTranslating = false;
let userName = '';
let lastUrl = window.location.href;
let isUIVisible = false;
let popupWindow = null;
let currentRoom = null;
let selectedLanguage = 'en';
let isRetrying = false;
let hasHitMaxRetries = false;
let retryAttempt = 0;
let maxRetryAttempts = 5;
let authToken = null;

// Token management functions
async function setAuthToken(token) {
  const expirationTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
  await chrome.storage.local.set({
    authToken: token,
    authTokenExpiration: expirationTime
  });
  authToken = token;
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authTokenExpiration'], (items) => {
      const { authToken, authTokenExpiration } = items;
      
      if (!authToken || !authTokenExpiration) {
        resolve(null);
        return;
      }

      if (Date.now() > parseInt(authTokenExpiration)) {
        clearAuthToken();
        resolve(null);
        return;
      }

      resolve(authToken);
    });
  });
}

function clearAuthToken() {
  chrome.storage.local.remove(['authToken', 'authTokenExpiration', 'userName']);
  authToken = null;
}

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
  if (document.querySelector('.shabe-launch-button-container')) {
    return;
  }

  console.log('Found Meet toolbar, adding button');

  // Create button container with Meet's standard structure
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'shabe-launch-button-container';
  
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
  if (!isInMeetingRoom()) {
    console.log('Not in a valid meeting room');
    return;
  }

  const container = document.querySelector('.shabe-container');
  if (container) {
    const isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'flex';
    
    // Update button state
    const button = document.querySelector('.shabe-launch-button-container button');
    if (button) {
      button.classList.toggle('active', !isVisible);
    }
  }
}

function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window)) {
    console.error('Speech recognition not supported');
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = getSpeechLangCode(selectedLanguage);

  recognition.onstart = () => {
    console.log('Speech recognition started');
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
    // Restart if still translating
    if (isTranslating) {
      console.log('Restarting speech recognition');
      recognition.start();
    }
  };

  recognition.onresult = (event) => {
    if (!isTranslating || !ws || ws.readyState !== WebSocket.OPEN) return;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        console.log('Final transcript:', transcript);
        sendMessage(transcript);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error === 'not-allowed') {
      isTranslating = false;
      const startButton = document.getElementById('start-button');
      if (startButton) {
        startButton.innerHTML = '<i class="google-symbols" style="font-size: 18px; vertical-align: middle;">mic_off</i>';
        startButton.style.background = '#4CAF50';
      }
      const status = document.getElementById('shabe-status');
      if (status) {
        status.textContent = 'Microphone access denied';
        status.style.color = '#f44336';
      }
    }
  };
}

function startTranslation() {
  console.log('Starting translation');
  if (!recognition) {
    setupSpeechRecognition();
  }
  
  if (recognition) {
    isTranslating = true;
    recognition.start();
    console.log('Speech recognition started');
    
    // Update status
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Listening...';
      status.style.color = '#f44336';
    }
  } else {
    console.error('Speech recognition not available');
  }
}

function stopTranslation() {
  console.log('Stopping translation');
  if (recognition) {
    isTranslating = false;
    recognition.stop();
    console.log('Speech recognition stopped');
    
    // Update status
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Connected';
      status.style.color = '#4CAF50';
    }
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

// Function to get server URL from storage
async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['serverAddress', 'serverPort'], (items) => {
      const address = items.serverAddress || 'localhost';
      const port = items.serverPort || 8080;
      resolve(`http://${address}:${port}`);
    });
  });
}

// Function to connect to WebSocket
async function connectToRoom() {
  console.log('Connecting to room:', currentRoom, 'with token:', authToken);
  if (!currentRoom) {
    console.error('Cannot connect: no room ID');
    return;
  }

  // Close existing connection if any
  if (ws) {
    ws.close();
  }

  // Get server URL from storage
  const serverUrl = await getServerUrl();
  const wsUrl = serverUrl.replace('http', 'ws');
  
  console.log('Connecting to websocket:', `${wsUrl}/ws?roomId=${currentRoom}`);
  ws = new WebSocket(`${wsUrl}/ws?roomId=${encodeURIComponent(currentRoom)}&token=${encodeURIComponent(authToken)}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Connected';
      status.style.color = '#4CAF50';
    }
    sendPreferences();
  };

  ws.onclose = (event) => {
    console.log('WebSocket disconnected:', event.code, event.reason);
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Disconnected';
      status.style.color = '#f44336';
    }

    // Only attempt to reconnect if it was an abnormal closure and we're still in the same room
    if (event.code !== 1000 && event.code !== 1001 && currentRoom && extractMeetRoomId(window.location.href) === currentRoom) {
      console.log('Attempting to reconnect in 5 seconds...');
      setTimeout(connectToRoom, 5000);
    } else {
      ws = null;
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Connection Error';
      status.style.color = '#f44336';
    }
  };

  ws.onmessage = (event) => {
    console.log('Received websocket message:', event.data);
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        console.log('Displaying message:', data);
        const isSelf = data.name === userName;
        if (!isSelf) {
          displayMessage(data.text, isSelf, data.name || 'Anonymous');
        }
      }
    } catch (error) {
      console.error('Error handling websocket message:', error);
    }
  };
}

// Function to send preferences to the server
function sendPreferences() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  chrome.storage.local.get(['language', 'userName'], (items) => {
    let language = items.language
    let name = items.userName
    if (!language) language = 'en'
    if (!name) name = 'Anonymous'
  
    console.log('Sending preferences:', { language, name });

    ws.send(JSON.stringify({
      type: 'preferences',
      language: language,
      name: name
    }));
  });
}

// Function to display a message
function displayMessage(text, isSelf = false, name = 'Anonymous') {
  console.log('Displaying message:', { text, isSelf, name });
  
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) {
    console.error('Messages div not found');
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `shabe-message ${isSelf ? 'self' : 'other'}`;
  messageDiv.style.cssText = `
    margin: 5px 0px 0px 5px;
    padding: 5px 8px;
    border-radius: 8px;
    max-width: 90%;
    ${isSelf ? 'margin-left: auto; background: #E3F2FD;' : 'margin-right: auto; background: #F5F5F5;'}
  `;

  const nameSpan = document.createElement('div');
  nameSpan.className = 'shabe-message-name';
  nameSpan.textContent = name;
  nameSpan.style.cssText = `
    font-size: 12px;
    color: #666;
    margin-bottom: 4px;
  `;

  const textSpan = document.createElement('div');
  textSpan.className = 'shabe-message-text';
  textSpan.textContent = text;
  textSpan.style.cssText = `
    word-break: break-word;
  `;

  messageDiv.appendChild(nameSpan);
  messageDiv.appendChild(textSpan);
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Function to send a message
function sendMessage(text) {
  console.log('Sending message:', text);
  if (!ws || ws.readyState !== WebSocket.OPEN || !text.trim()) {
    console.error('Cannot send message:', { 
      wsExists: !!ws, 
      wsState: ws ? ws.readyState : 'no ws',
      text: text.trim()
    });
    return;
  }
  
  chrome.storage.local.get(['language', 'userName'], (items) => {
    let language = items.language
    let name = items.userName
    if (!language) language = 'en'
    if (!name) name = 'Anonymous'
  
    const message = {
      type: 'message',
      text: text,
      language: language,
      name: name
    };
  
    console.log('Sending websocket message:', message);
    ws.send(JSON.stringify(message));
    displayMessage(text, true, name);
  });
}

// Function to create detached window
function createDetachedWindow() {
  if (popupWindow && !popupWindow.closed) {
    popupWindow.focus();
    return;
  }

  // Create a new window
  popupWindow = window.open('', 'ShabeTranslator', 'width=400,height=600,resizable=yes');
  if (!popupWindow) {
    console.error('Popup blocked - please allow popups for this site');
    return;
  }

  // Hide the embedded UI
  const container = document.querySelector('.shabe-container');
  if (container) {
    container.style.display = 'none';
  }

  // Write the HTML content
  popupWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Shabe Translator</title>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: white;
        }
        .shabe-translator {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: white;
          padding: 5px;
        }
        .shabe-header-buttons {
          padding: 0px 10px 0px 10px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .shabe-messages {
          flex-grow: 1;
          overflow-y: auto;
          padding: 5px 8px;
          margin: 5px 0px 0px 5px; 
        }
        .message {
          margin-bottom: 10px;
          padding: 8px;
          border-radius: 4px;
          max-width: 80%;
        }
        .message.sent {
          background-color: #e3f2fd;
          margin-left: auto;
        }
        .message.received {
          background-color: #f5f5f5;
          margin-right: auto;
        }
        button {
          cursor: pointer;
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
      </style>
    </head>
    <body>
      <div class="shabe-translator">
        <div class="shabe-header-buttons">
          <div style="display: flex; gap: 10px; align-items: center;">
            <span id="shabe-status">Disconnected</span>
            <select class="shabe-language-select" style="padding: 5px; border-radius: 4px; border: 1px solid #ddd;">
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="pt">Português</option>
              <option value="ko">한국어</option>
              <option value="zh">中文</option>
            </select>
            <button class="shabe-mic-button" style="padding: 8px; border: none; background: none;">
              <span class="google-symbols">mic</span>
            </button>
          </div>
        </div>
        <div id="messages" class="shabe-messages"></div>
      </div>
    </body>
    </html>
  `);

  // Set up event listeners in the popup
  const popup = popupWindow.document;
  
  // Set up language select
  const languageSelect = popup.querySelector('.shabe-language-select');
  if (languageSelect) {
    chrome.storage.local.get('language', (items) => {
      const language = items.language || 'en';
      languageSelect.value = language;
      languageSelect.addEventListener('change', (e) => {
        chrome.storage.local.set({ language: e.target.value });
        if (ws) {
          sendPreferences();
        }
      });
    });
  }

  // Set up mic button
  const micButton = popup.querySelector('.shabe-mic-button');
  const micIcon = micButton?.querySelector('.google-symbols');
  if (micButton && micIcon) {
    micButton.addEventListener('click', () => {
      if (isTranslating) {
        stopTranslation();
        micIcon.textContent = 'mic';
        micButton.style.color = '#000';
      } else {
        startTranslation();
        micIcon.textContent = 'mic_off';
        micButton.style.color = '#1a73e8';
      }
    });
  }

  // Add detach button event listener
  const detachButton = popup.querySelector('.shabe-detach-button');
  if (detachButton) {
    detachButton.addEventListener('click', () => {
      createDetachedWindow();
    });
  }

  // Sync existing messages
  const sourceMessages = document.getElementById('messages');
  const targetMessages = popup.getElementById('messages');
  if (sourceMessages && targetMessages) {
    targetMessages.innerHTML = sourceMessages.innerHTML;
  }

  // Sync initial status
  const sourceStatus = document.getElementById('shabe-status');
  const targetStatus = popup.getElementById('shabe-status');
  if (sourceStatus && targetStatus) {
    targetStatus.textContent = sourceStatus.textContent;
    targetStatus.style.color = sourceStatus.style.color;
  }

  // Set up message syncing
  const messageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && !popupWindow.closed) {
        targetMessages.innerHTML = sourceMessages.innerHTML;
      }
    });
  });

  // Set up status syncing
  const statusObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (!popupWindow.closed && targetStatus) {
        if (mutation.type === 'characterData') {
          targetStatus.textContent = sourceStatus.textContent;
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          targetStatus.style.color = sourceStatus.style.color;
        }
      }
    });
  });

  messageObserver.observe(sourceMessages, { childList: true });
  statusObserver.observe(sourceStatus, { 
    characterData: true, 
    attributes: true, 
    childList: true,
    subtree: true 
  });

  // Handle window close
  popupWindow.addEventListener('beforeunload', () => {
    messageObserver.disconnect();
    statusObserver.disconnect();
    popupWindow = null;
    // Show the embedded UI again
    if (container) {
      container.style.display = 'flex';
    }
  });
}

// Helper function to set up translation view event listeners
function setupTranslationViewListeners(container) {
  if (!container) {
    console.error('Container not found for translation view listeners');
    return;
  }

  // Add language select event listener
  const languageSelect = container.querySelector('.shabe-language-select');
  if (languageSelect) {
    chrome.storage.local.get('language', (items) => {
      const language = items.language || 'en';
      languageSelect.value = language;
      languageSelect.addEventListener('change', (e) => {
        chrome.storage.local.set({ language: e.target.value });
        if (ws) {
          sendPreferences();
        }
      });
    });
  }

  // Add mic button event listener
  const micButton = container.querySelector('.shabe-mic-button');
  const micIcon = micButton?.querySelector('.google-symbols');
  if (micButton && micIcon) {
    micButton.addEventListener('click', () => {
      if (isTranslating) {
        stopTranslation();
        micIcon.textContent = 'mic';
        micButton.style.color = '#000';
      } else {
        startTranslation();
        micIcon.textContent = 'mic_off';
        micButton.style.color = '#1a73e8';
      }
    });
  }

  // Add detach button event listener
  const detachButton = container.querySelector('.shabe-detach-button');
  if (detachButton) {
    detachButton.addEventListener('click', () => {
      createDetachedWindow();
    });
  }
}

// Function to handle successful authentication
async function handleAuthSuccess(token) {
  console.log('Authentication successful');
  
  // Store the token
  await setAuthToken(token);
  
  // Get current room ID
  currentRoom = extractMeetRoomId(window.location.href);
  if (!currentRoom) {
    console.error('No valid room ID found in URL');
    return;
  }
  console.log('Current room:', currentRoom);

  // Update UI to show translation view
  const translator = document.querySelector('.shabe-translator');
  if (translator) {
    const loginView = translator.querySelector('.shabe-login');
    const translationView = translator.querySelector('.shabe-translation-ui');
    
    if (loginView) loginView.style.display = 'none';
    if (translationView) {
      translationView.style.display = 'flex';
      setupTranslationViewListeners(translationView);
    }
  }

  // Connect to the room
  connectToRoom();
}

// Function to attempt authentication
async function attemptAuth() {
  // Check for existing auth token
  const existingToken = await getAuthToken();
  if (existingToken) {
    try {
      console.log('Existing auth token found');
      // Verify the token by fetching user info
      const serverUrl = await getServerUrl();
      const response = await fetch(`${serverUrl}/auth/user`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${existingToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        userName = data.user.name;
        await chrome.storage.local.set({ userName: userName });
        authToken = existingToken;
        await handleAuthSuccess(existingToken);
        return;
      } else {
        // Token is invalid
        await clearAuthToken();
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      await clearAuthToken();
    }
  }
}

// Function to validate message origin
async function isValidOrigin(origin) {
  const serverUrl = await getServerUrl();
  return origin === serverUrl;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.type === 'AUTH_SUCCESS') {
    console.log('Received auth success message:', message);
    
    // Fetch user info with the token
    getServerUrl().then(serverUrl => {
      fetch(`${serverUrl}/auth/user`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${message.token}`
        }
      })
      .then(response => response.json())
      .then(async data => {
        console.log('User info response:', data);
        if (data.user.name) {
          await chrome.storage.local.set({ userName: data.user.name });
        }
        await handleAuthSuccess(message.token);
      })
      .catch(error => {
        console.error('Error fetching user info:', error);
      });
    });
  }
});

// Listen for auth callback
window.addEventListener('message', async (event) => {
  if (event.origin !== await getServerUrl()) {
    return;
  }

  console.log('Received postMessage:', event.data);

  if (event.data && event.data.type === 'auth_success' && event.data.token) {
    console.log('Auth success, verifying token');
    
    // Set auth token globally
    authToken = event.data.token;
    
    // Send token to server to verify
    getServerUrl().then(serverUrl => {
      fetch(`${serverUrl}/auth/user`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${event.data.token}`
        }
      })
      .then(response => response.json())
      .then(data => {
        console.log('Auth check response:', data);
        if (data.authenticated) {
          if (data.user.name) {
            chrome.storage.local.set({ userName: data.user.name });
          }
          
          // Call handleAuthSuccess after verification
          handleAuthSuccess(event.data.token);
        }
      })
      .catch(error => {
        console.error('Error checking auth:', error);
      });
    });
  }
});

// Add event listeners
const detachButton = document.querySelector('.shabe-detach-button');
if (detachButton) {
  detachButton.addEventListener('click', async () => {
    console.log('Detach button clicked');
    
    // Open login window if not authenticated
    if (!authToken) {
      const serverUrl = await getServerUrl();
      window.open(`${serverUrl}/auth/login`, 'ShabeLogin', 'width=600,height=600,left=200,top=200');
      return;
    }
  });
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
    
    if (isInMeetingRoom()) {
      console.log('Entered valid meeting room, initializing...');
      setTimeout(() => {
        initializeUI();
        addMeetButtonWithBackoff();
      }, 1000);
    } else {
      console.log('Not in a valid meeting room');
    }
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Initialize the UI
function initializeUI() {
  // Create the main container
  const container = document.createElement('div');
  container.className = 'shabe-container';
  container.style.position = 'fixed';
  container.style.bottom = '80px';
  container.style.right = '20px';
  container.style.zIndex = '9999';
  container.style.display = 'none'; // Hide by default

  // Create translator div
  const translator = document.createElement('div');
  translator.className = 'shabe-translator';
  translator.style.backgroundColor = 'white';
  translator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  translator.style.borderRadius = '8px';
  translator.style.width = '300px';
  translator.style.display = 'flex';
  translator.style.flexDirection = 'column';
  translator.style.maxHeight = '400px';

  // Create login view
  const loginView = document.createElement('div');
  loginView.className = 'shabe-login';
  loginView.style.padding = '15px';
  loginView.innerHTML = `
    <h2>Please sign in to continue</h2>
    <button id="google-login" class="shabe-google-button" style="display: flex; align-items: center; padding: 10px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer;">
      <img src="https://www.google.com/favicon.ico" alt="Google" style="width: 18px; height: 18px; margin-right: 10px;">
      Sign in with Google
    </button>
  `;

  // Create translation view
  const translationView = document.createElement('div');
  translationView.className = 'shabe-translation-ui';
  translationView.style.display = 'none';
  translationView.style.flexGrow = '1';
  translationView.style.flexDirection = 'column';
  translationView.innerHTML = `
    <div class="shabe-header-buttons" style="padding: 0px 10px 0px 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; gap: 10px; align-items: center;">
        <span id="shabe-status">Disconnected</span>
        <select class="shabe-language-select" style="padding: 5px; border-radius: 4px; border: 1px solid #ddd;">
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="pt">Português</option>
          <option value="ko">한국어</option>
          <option value="zh">中文</option>
        </select>
        <button class="shabe-mic-button" style="padding: 8px; border: none; background: none; cursor: pointer;">
          <span class="google-symbols">mic</span>
        </button>
        <button class="shabe-detach-button" style="padding: 8px 8px 8px 0px; border: none; background: none; cursor: pointer;">
          <span class="google-symbols">open_in_new</span>
        </button>
      </div>
    </div>
    <div id="messages" class="shabe-messages" style="flex-grow: 1; overflow-y: auto; padding: 5px; margin: 3px;"></div>
  `;

  // Add views to translator
  translator.appendChild(loginView);
  translator.appendChild(translationView);

  // Add components to main container
  container.appendChild(translator);

  // Add the container to the page
  document.body.appendChild(container);

  // Add login button event listener
  const loginButton = document.getElementById('google-login');
  loginButton.addEventListener('click', async () => {
    console.log('Login button clicked');
    const serverUrl = await getServerUrl();
    window.open(`${serverUrl}/auth/login`, 'ShabeLogin', 'width=600,height=600,left=200,top=200');
  });

  // Add detach button event listener
  const detachButton = translator.querySelector('.shabe-detach-button');
  if (detachButton) {
    detachButton.addEventListener('click', () => {
      createDetachedWindow();
      container.style.display = 'none'; // Hide main UI when detached
    });
  }

  // Listen for auth success message
  window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'auth_success') {
      console.log('Received auth token:', event.data.token);
      
      // Set auth token globally
      authToken = event.data.token;
      
      // Send token to server to verify
      getServerUrl().then(serverUrl => {
        fetch(`${serverUrl}/auth/user`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${event.data.token}`
          }
        })
        .then(response => response.json())
        .then(data => {
          console.log('Auth check response:', data);
          if (data.authenticated) {
            if (data.user.name) {
              chrome.storage.local.set({ userName: data.user.name });
            }
            
            // Call handleAuthSuccess after verification
            handleAuthSuccess(event.data.token);
          }
        })
        .catch(error => {
          console.error('Error checking auth:', error);
        });
      });
    }
  });

  attemptAuth();

}

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isInMeetingRoom()) {
      setTimeout(() => {
        initializeUI();
        addMeetButtonWithBackoff();
      }, 1000);
    }
  });
} else {
  if (isInMeetingRoom()) {
    setTimeout(() => {
      initializeUI();
      addMeetButtonWithBackoff();
    }, 1000);
  }
}
