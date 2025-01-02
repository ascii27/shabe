import { getServerUrl, getAuthToken, setAuthToken, clearAuthToken } from './utils.js';

// Default settings
const DEFAULT_SETTINGS = {
  serverAddress: 'localhost',
  serverPort: 8080
};

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
  document.querySelector('.auth-button').addEventListener('click', async () => {
    console.log('Auth button clicked');
    const serverUrl = await getServerUrl();
    window.open(
      `${serverUrl}/auth/login`,
      'ShabeLogin',
      'width=600,height=600'
    );
  });

  // Listen for auth success message
  window.addEventListener('message', async (event) => {
    const serverUrl = await getServerUrl();
    if (event.origin === serverUrl && event.data.type === 'auth_success') {
      console.log('Received auth success message:', event.data);
      setAuthToken(event.data.token);
      updateConnectionStatus();
    }
  });
});

// Listen for auth success message
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'authSuccess') {
    setAuthToken(message.token);
    updateConnectionStatus();
  }
});
