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
  if (!isInMeetingRoom()) {
    console.log('Not in a valid meeting room');
    return;
  }

  if (!popupWindow) {
    createDetachedWindow();
  } else {
    popupWindow.remove();
    popupWindow = null;
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  // Update button state
  const button = document.querySelector('.shabe-button-container button');
  if (button) {
    button.classList.toggle('active', popupWindow !== null);
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
      const status = document.getElementById('status');
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
    const status = document.getElementById('status');
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
    const status = document.getElementById('status');
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

// Function to connect to WebSocket
function connectToRoom() {
  console.log('Connecting to room:', currentRoom, 'with token:', authToken);
  if (!currentRoom) {
    console.error('Cannot connect: no room ID');
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Error: No room ID';
      status.style.color = '#f44336';
    }
    return;
  }

  if (!authToken) {
    console.error('Cannot connect: no auth token');
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Error: Not authenticated';
      status.style.color = '#f44336';
    }
    return;
  }

  // Don't create multiple connections
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    console.log('WebSocket already connected or connecting');
    return;
  }

  const wsUrl = `ws://localhost:8080/ws?token=${encodeURIComponent(authToken)}&roomId=${encodeURIComponent(currentRoom)}`;
  console.log('Connecting to websocket:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Connected';
      status.style.color = '#4CAF50';
    }
    sendPreferences();
  };

  ws.onclose = (event) => {
    console.log('WebSocket disconnected:', event.code, event.reason);
    const status = document.getElementById('status');
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
    const status = document.getElementById('status');
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
  
  ws.send(JSON.stringify({
    type: 'preferences',
    language: selectedLanguage,
    name: userName
  }));
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
    margin: 5px 0;
    padding: 8px;
    border-radius: 8px;
    max-width: 80%;
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
  
  const message = {
    type: 'message',
    text: text,
    language: selectedLanguage,
    name: userName
  };
  
  console.log('Sending websocket message:', message);
  ws.send(JSON.stringify(message));
  displayMessage(text, true, userName);
}

// Function to create detached window
function createDetachedWindow() {
  console.log('Creating detached window...');
  if (popupWindow) {
    console.log('Popup window already exists, returning');
    return;
  }

  // Create the popup container
  popupWindow = document.createElement('div');
  popupWindow.className = 'shabe-popup';
  popupWindow.style.position = 'fixed';
  popupWindow.style.top = '20px';
  popupWindow.style.right = '20px';
  popupWindow.style.zIndex = '9999';
  popupWindow.style.backgroundColor = 'white';
  popupWindow.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  popupWindow.style.borderRadius = '8px';
  popupWindow.style.width = '300px';
  popupWindow.style.maxHeight = '80vh';
  popupWindow.style.overflow = 'auto';

  popupWindow.innerHTML = `
    <div class="shabe-popup-header" style="padding: 10px; background-color: #f5f5f5; border-bottom: 1px solid #eee; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
      <span>Shabe Translator</span>
      <button class="shabe-close-button" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
    </div>
    <div class="shabe-popup-content" style="padding: 15px;">
      <div class="shabe-login">
        <h2>Please sign in to continue</h2>
        <button id="google-login" class="shabe-google-button" style="display: flex; align-items: center; padding: 10px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer;">
          <img src="https://www.google.com/favicon.ico" alt="Google" style="width: 18px; height: 18px; margin-right: 10px;">
          Sign in with Google
        </button>
      </div>
    </div>
  `;

  // Add the popup to the page
  document.body.appendChild(popupWindow);
  console.log('Added popup to page');

  // Add event listeners
  const closeButton = popupWindow.querySelector('.shabe-close-button');
  closeButton.addEventListener('click', () => {
    console.log('Close button clicked');
    if (isTranslating) {
      stopTranslation();
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    popupWindow.remove();
    popupWindow = null;

    // Update button state
    const button = document.querySelector('.shabe-button-container button');
    if (button) {
      button.classList.remove('active');
    }
  });

  // Add login button event listener
  const loginButton = document.getElementById('google-login');
  loginButton.addEventListener('click', () => {
    console.log('Login button clicked');
    window.open('http://localhost:8080/auth/login', 'ShabeLogin', 'width=600,height=600,left=200,top=200');
  });

  // Listen for auth success message
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'auth_success') {
      console.log('Received auth token:', event.data.token);

      // Set auth token globally
      authToken = event.data.token;
      
      // Send token to server to verify
      fetch(`http://localhost:8080/auth/user?token=${encodeURIComponent(event.data.token)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        console.log('Auth check response:', data);
        if (data.authenticated) {
          if (data.user.name) {
            userName = data.user.name;
            localStorage.setItem('userName', userName);
            
            // Update name input if it exists
            const nameInput = document.querySelector('.shabe-name-input');
            if (nameInput) {
              nameInput.value = userName;
            }
          }

          // Only call handleAuthSuccess after we've set everything up
          handleAuthSuccess(event.data.token);
        }
      })
      .catch(error => {
        console.log('Error checking auth:', error);
      });
    }
  });

  let checkingAuth = false;
  let authCheckCount = 0;

  function checkAuthStatus() {
    console.log('Checking auth status... (attempt:', ++authCheckCount, ')');
    if (checkingAuth) {
      console.log('Already checking auth, skipping... (attempt:', authCheckCount, ')');
      return;
    }
    checkingAuth = true;

    fetch('http://localhost:8080/auth/user', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
    .then(response => {
      console.log('Auth check response:', response.status, '(attempt:', authCheckCount, ')');
      return response.json();
    })
    .then(data => {
      console.log('Auth check response data:', data, '(attempt:', authCheckCount, ')');
      checkingAuth = false;
      
      if (data.authenticated) {
        console.log('User is authenticated:', data.user);
        handleAuthSuccess();
      }
    })
    .catch(error => {
      console.log('Error checking auth status:', error, '(attempt:', authCheckCount, ')');
      checkingAuth = false;
    });
  }

  // Start checking auth status
  checkAuthStatus();
}

// Function to handle successful authentication
function handleAuthSuccess(token) {
  console.log('Authentication successful');
  
  // Get current room ID
  currentRoom = extractMeetRoomId(window.location.href);
  if (!currentRoom) {
    console.error('No valid room ID found in URL');
    return;
  }
  console.log('Current room:', currentRoom);

  // Show the translator UI
  const translator = document.querySelector('.shabe-translator');
  if (translator) {
    translator.style.display = 'flex';
  }

  // Remove the popup if it exists
  if (popupWindow) {
    popupWindow.remove();
    popupWindow = null;
  }

  // Connect to the room
  connectToRoom();
}

// Function to create and inject the translator UI
function createTranslatorUI() {
  console.log('Creating translator UI');
  
  // Load saved preferences
  userName = localStorage.getItem('userName') || 'Anonymous';
  selectedLanguage = localStorage.getItem('language') || 'en';
  
  // Create the main container if it doesn't exist
  let container = document.querySelector('.shabe-translator');
  if (container) {
    console.log('Translator UI already exists');
    return;
  }
  
  container = document.createElement('div');
  container.className = 'shabe-translator';
  container.style.display = 'none';
  
  // Create header
  const header = document.createElement('div');
  header.className = 'shabe-header';
  header.style.cssText = `
    display: flex;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid #eee;
    gap: 10px;
  `;

  // Create status section
  const headerStatus = document.createElement('div');
  headerStatus.className = 'shabe-status';
  headerStatus.style.cssText = `
    display: flex;
    align-items: center;
    gap: 5px;
  `;

  const status = document.createElement('span');
  status.id = 'status';
  status.textContent = 'Disconnected';
  status.style.color = '#f44336';
  headerStatus.appendChild(status);

  // Create language select
  const languageSelect = document.createElement('select');
  languageSelect.className = 'shabe-language-select';
  languageSelect.style.cssText = `
    padding: 5px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  `;

  // Create header controls
  const headerControls = document.createElement('div');
  headerControls.className = 'shabe-controls';
  headerControls.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  `;

  // Create buttons
  const startButton = document.createElement('button');
  startButton.id = 'start-translation';
  startButton.className = 'shabe-icon-button';
  startButton.innerHTML = '<i class="google-symbols">play_circle</i>';
  startButton.setAttribute('aria-label', 'Start Translation');
  startButton.addEventListener('click', () => {
    if (!isTranslating) {
      startTranslation();
      startButton.innerHTML = '<i class="google-symbols">pause_circle</i>';
    } else {
      stopTranslation();
      startButton.innerHTML = '<i class="google-symbols">play_circle</i>';
    }
  });
  
  const detachButton = document.createElement('button');
  detachButton.className = 'shabe-icon-button';
  detachButton.innerHTML = '<i class="google-symbols">open_in_new</i>';
  detachButton.setAttribute('aria-label', 'Open in New Window');
  detachButton.addEventListener('click', createDetachedWindow);

  // Add buttons to controls
  headerControls.appendChild(startButton);
  headerControls.appendChild(detachButton);

  // Add all sections to header
  header.appendChild(headerStatus);
  header.appendChild(languageSelect);
  header.appendChild(headerControls);
  container.appendChild(header);

  // Create messages container
  const messages = document.createElement('div');
  messages.id = 'messages';
  messages.className = 'shabe-messages';
  messages.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    background: white;
  `;
  container.appendChild(messages);
  
  document.body.appendChild(container);

  // Add language options
  const languages = {
    'en': 'English',
    'ja': '日本語',
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
  
  languageSelect.addEventListener('change', () => {
    selectedLanguage = languageSelect.value;
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
  console.log('Initializing UI');
  
  // Check if we're in a meeting room
  if (!isInMeetingRoom()) {
    console.log('Not in a valid meeting room, skipping initialization');
    return;
  }

  // Create and inject the translator UI
  createTranslatorUI();
  
  // Add the Meet button
  addMeetButtonWithBackoff();

  // Connect to room if we're already authenticated
  if (authToken) {
    currentRoom = extractMeetRoomId(window.location.href);
    if (currentRoom) {
      connectToRoom();
    }
  }
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
