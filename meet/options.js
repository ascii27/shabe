// Default settings
const DEFAULT_SETTINGS = {
  serverAddress: 'localhost',
  serverPort: 8080
};

// Function to get server URL based on settings
async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['serverAddress', 'serverPort'], (items) => {
      const address = items.serverAddress || DEFAULT_SETTINGS.serverAddress;
      const port = items.serverPort || DEFAULT_SETTINGS.serverPort;
      resolve(`http://${address}:${port}`);
    });
  });
}

// Function to get auth token
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

// Function to set auth token
function setAuthToken(token) {
  const expirationTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
  chrome.storage.local.set({
    authToken: token,
    authTokenExpiration: expirationTime
  });
}

// Function to clear auth token
function clearAuthToken() {
  chrome.storage.local.remove(['authToken', 'authTokenExpiration', 'userName']);
}

// Function to update connection status
async function updateConnectionStatus() {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.status-text');
  const userInfo = document.querySelector('.user-info');
  const userText = document.querySelector('.user-text');
  const signOutButton = document.querySelector('.sign-out-button');
  const authButton = document.querySelector('.auth-button');

  // Set to checking state
  statusIndicator.className = 'status-indicator checking';
  statusText.textContent = 'Checking connection...';
  userInfo.style.display = 'none';
  authButton.style.display = 'none';
  signOutButton.style.display = 'none';

  try {
    const existingToken = await getAuthToken();
    if (!existingToken) {
      throw new Error('No auth token found');
    }

    const serverUrl = await getServerUrl();
    const response = await fetch(`${serverUrl}/auth/user`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${existingToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to authenticate');
    }

    const data = await response.json();
    
    // Update UI for connected state
    statusIndicator.className = 'status-indicator connected';
    statusText.textContent = 'Connected to server';
    
    if (data.user.name) {
      userText.textContent = `Signed in as ${data.user.name}`;
      userInfo.style.display = 'block';
      signOutButton.style.display = 'inline-block';
      authButton.style.display = 'none';
      chrome.storage.local.set({ userName: data.user.name });
    }

  } catch (error) {
    console.log('Connection check failed:', error);
    
    // Update UI for disconnected state
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = 'Not connected';
    authButton.style.display = 'block';
    
    // Clear any existing auth data
    clearAuthToken();
  }
}

// Function to sign out
async function handleSignOut() {
  await chrome.storage.local.remove(['authToken', 'authTokenExpiration', 'userName']);
  clearAuthToken();
  updateConnectionStatus();
}

// Function to save settings
function saveSettings() {
  const serverAddress = document.getElementById('serverAddress').value;
  const serverPort = document.getElementById('serverPort').value;
  const status = document.getElementById('status');

  // Validate input
  if (!serverAddress || !serverPort) {
    status.textContent = 'Please fill in all fields';
    status.className = 'status error';
    status.style.display = 'block';
    return;
  }

  // Save to Chrome storage
  chrome.storage.local.set({
    serverAddress: serverAddress,
    serverPort: parseInt(serverPort)
  }, () => {
    status.textContent = 'Settings saved successfully';
    status.className = 'status success';
    status.style.display = 'block';
    
    // Hide status after 3 seconds
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);

    // Check connection with new settings
    updateConnectionStatus();

    // Notify content script that settings were updated
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'settingsUpdated' });
      });
    });
  });
}

// Function to load settings
function loadSettings() {
  chrome.storage.local.get(['serverAddress', 'serverPort'], (items) => {
    document.getElementById('serverAddress').value = items.serverAddress || DEFAULT_SETTINGS.serverAddress;
    document.getElementById('serverPort').value = items.serverPort || DEFAULT_SETTINGS.serverPort;
  });
}

// Function to reset settings
function resetSettings() {
  document.getElementById('serverAddress').value = DEFAULT_SETTINGS.serverAddress;
  document.getElementById('serverPort').value = DEFAULT_SETTINGS.serverPort;
  saveSettings();
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  loadSettings();
  
  // Check connection status
  updateConnectionStatus();
  
  // Add event listeners
  document.getElementById('save').addEventListener('click', saveSettings);
  document.getElementById('reset').addEventListener('click', resetSettings);
  document.querySelector('.sign-out-button').addEventListener('click', handleSignOut);
  
  // Handle auth button click
  document.querySelector('.auth-button').addEventListener('click', () => {
    // Open auth window
    const authWindow = window.open(
      'http://localhost:8080/auth/login',
      'auth',
      'width=600,height=700'
    );

    // Listen for the postMessage from the auth window
    window.addEventListener('message', function authHandler(event) {
      if (event.origin === 'http://localhost:8080' && event.data.type === 'auth_success') {
        console.log('Received auth success message');
        
        // Remove the message listener
        window.removeEventListener('message', authHandler);
        
        // Close the auth window
        authWindow.close();
        
        // Forward the token to the background script
        chrome.runtime.sendMessage({
          type: 'authSuccess',
          token: event.data.token
        });
      }
    });
  });
});

// Listen for auth success message
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'authSuccess') {
    setAuthToken(message.token);
    updateConnectionStatus();
  }
});
