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

// Function to connect to WebSocket
function connectToRoom() {
  console.log('Connecting to room:', currentRoom, 'with token:', authToken);
  if (!currentRoom) {
    console.error('Cannot connect: no room ID');
    const status = document.getElementById('shabe-status');
    if (status) {
      status.textContent = 'Error: No room ID';
      status.style.color = '#f44336';
    }
    return;
  }

  if (!authToken) {
    console.error('Cannot connect: no auth token');
    const status = document.getElementById('shabe-status');
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
  if (popupWindow) {
    console.log('Popup window already exists');
    return;
  }

  // Create floating container
  popupWindow = document.createElement('div');
  popupWindow.style.position = 'fixed';
  popupWindow.style.top = '20px';
  popupWindow.style.right = '20px';
  popupWindow.style.zIndex = '9999';

  // Clone the translator UI structure
  const originalTranslator = document.querySelector('.shabe-translator');
  if (!originalTranslator) {
    console.error('Original translator UI not found');
    return;
  }

  const translator = originalTranslator.cloneNode(true);
  translator.style.backgroundColor = 'white';
  translator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  translator.style.borderRadius = '8px';
  translator.style.width = '300px';
  translator.style.maxHeight = '80vh';
  translator.style.display = 'flex';

  // Add close button to translator
  const header = document.createElement('div');
  header.style.cssText = 'padding: 10px; background-color: #f5f5f5; border-bottom: 1px solid #eee; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; cursor: move;';
  
  const title = document.createElement('span');
  title.textContent = 'Shabe Translator';
  
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.style.cssText = 'background: none; border: none; font-size: 20px; cursor: pointer;';
  
  header.appendChild(title);
  header.appendChild(closeButton);

  // Add header before the existing content
  translator.insertBefore(header, translator.firstChild);

  // Add the translator to the popup window
  popupWindow.appendChild(translator);
  document.body.appendChild(popupWindow);

  // Add close button event listener
  closeButton.addEventListener('click', () => {
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

  // Make the window draggable
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener('mousedown', (e) => {
    if (e.target === closeButton) {
      return;
    }
    isDragging = true;
    initialX = e.clientX - popupWindow.offsetLeft;
    initialY = e.clientY - popupWindow.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      popupWindow.style.left = `${currentX}px`;
      popupWindow.style.top = `${currentY}px`;
      popupWindow.style.right = 'auto';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Show appropriate view based on auth status
  const loginView = translator.querySelector('.shabe-login');
  const translationView = translator.querySelector('.shabe-translation-ui');
  
  if (authToken) {
    if (loginView) loginView.style.display = 'none';
    if (translationView) {
      translationView.style.display = 'flex';
      // Set up translation view event listeners for the translation view
      setupTranslationViewListeners(translationView);
    }
  } else {
    if (loginView) loginView.style.display = 'block';
    if (translationView) translationView.style.display = 'none';

    // Add login button event listener
    const loginButton = translator.querySelector('#google-login');
    if (loginButton) {
      loginButton.addEventListener('click', () => {
        console.log('Login button clicked');
        window.open('http://localhost:8080/auth/login', 'ShabeLogin', 'width=600,height=600,left=200,top=200');
      });
    }
  }
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
    languageSelect.value = selectedLanguage;
    languageSelect.addEventListener('change', (e) => {
      selectedLanguage = e.target.value;
      localStorage.setItem('language', selectedLanguage);
      if (ws) {
        sendPreferences();
      }
    });
  }

  // Add mic button event listener
  const micButton = container.querySelector('.shabe-mic-button');
  const micIcon = micButton?.querySelector('.google-symbols');
  if (micButton && micIcon) {
    micButton.addEventListener('click', () => {
      if (isTranslating) {
        stopTranslation();
        micIcon.textContent = 'play_circle';
        micButton.style.color = '#000';
      } else {
        startTranslation();
        micIcon.textContent = 'stop_circle';
        micButton.style.color = '#1a73e8';
      }
    });
  }
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

  // Update UI to show translation view
  const translator = document.querySelector('.shabe-translator');
  if (translator) {
    const loginView = translator.querySelector('.shabe-login');
    const translationView = translator.querySelector('.shabe-translation-ui');
    
    if (loginView) loginView.style.display = 'none';
    if (translationView) {
      translationView.style.display = 'flex';
      // Set up translation view event listeners for the translation view
      setupTranslationViewListeners(translationView);
    }

    // Make sure the translator is visible
    translator.style.display = 'flex';
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
      startButton.innerHTML = '<i class="google-symbols">stop_circle</i>';
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
    'en': 'English - ABC',
    'es': 'Español - ABC',
    'fr': 'Français - ABC',
    'de': 'Deutsch - ABC',
    'it': 'Italiano - ABC',
    'pt': 'Português - ABC',
    'ru': 'Русский - АБВ',
    'ja': '日本語 - あア',
    'ko': '한국어 - 가나다',
    'zh': '中文 - 汉字'
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
    if (ws) {
      sendPreferences();
    }
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
          }
          
          // Call handleAuthSuccess after verification
          handleAuthSuccess(event.data.token);
        }
      })
      .catch(error => {
        console.error('Error checking auth:', error);
      });
    }
  });

  // Check initial auth status
  fetch('http://localhost:8080/auth/user', {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json'
    }
  })
  .then(response => response.json())
  .then(data => {
    console.log('Initial auth check response:', data);
    if (data.authenticated) {
      if (data.user.name) {
        userName = data.user.name;
        localStorage.setItem('userName', userName);
      }
      handleAuthSuccess();
    }
  })
  .catch(error => {
    console.error('Error checking initial auth status:', error);
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
    <div class="shabe-header-buttons" style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
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
          <span class="google-symbols" style="font-size: 24px;">play_circle</span>
        </button>
        <button class="shabe-detach-button" style="padding: 8px; border: none; background: none; cursor: pointer;">
          <span class="google-symbols" style="font-size: 24px;">open_in_new</span>
        </button>
      </div>
    </div>
    <div id="messages" class="shabe-messages" style="flex-grow: 1; overflow-y: auto; padding: 15px;"></div>
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
  loginButton.addEventListener('click', () => {
    console.log('Login button clicked');
    window.open('http://localhost:8080/auth/login', 'ShabeLogin', 'width=600,height=600,left=200,top=200');
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
          }
          
          // Call handleAuthSuccess after verification
          handleAuthSuccess(event.data.token);
        }
      })
      .catch(error => {
        console.error('Error checking auth:', error);
      });
    }
  });

  // Check initial auth status
  fetch('http://localhost:8080/auth/user', {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json'
    }
  })
  .then(response => response.json())
  .then(data => {
    console.log('Initial auth check response:', data);
    if (data.authenticated) {
      if (data.user.name) {
        userName = data.user.name;
        localStorage.setItem('userName', userName);
      }
      handleAuthSuccess();
    } else {
      // Show login view by default if not authenticated
      loginView.style.display = 'block';
      translationView.style.display = 'none';
    }
  })
  .catch(error => {
    console.error('Error checking initial auth status:', error);
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
