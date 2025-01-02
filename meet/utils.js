// Default settings
const DEFAULT_SETTINGS = {
  serverAddress: 'localhost',
  serverPort: 8080
};

// Token management
export async function setAuthToken(token) {
  const expirationTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
  await chrome.storage.local.set({
    authToken: token,
    authTokenExpiration: expirationTime
  });
  return token;
}

export async function getAuthToken() {
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

export function clearAuthToken() {
  return chrome.storage.local.remove(['authToken', 'authTokenExpiration', 'userName']);
}

// Server URL management
export async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['serverAddress', 'serverPort'], (items) => {
      const address = items.serverAddress || DEFAULT_SETTINGS.serverAddress;
      const port = items.serverPort || DEFAULT_SETTINGS.serverPort;
      resolve(`http://${address}:${port}`);
    });
  });
}

// Google Meet specific utilities
export function extractMeetRoomId(url) {
  const meetRegex = /^https:\/\/meet\.google\.com\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})(?:\?.*)?$/;
  const match = url.match(meetRegex);
  return match ? match[1] : null;
}

export function isInMeetingRoom(url) {
  return extractMeetRoomId(url) !== null;
}

// Origin validation
export function isValidOrigin(origin) {
  return origin === chrome.runtime.getURL('').slice(0, -1) || 
         origin.startsWith('https://meet.google.com');
}
