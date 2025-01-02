# Shabe Chrome Extension

Chrome extension component of Shabe that integrates real-time translation into Google Meet.

## Features

- Seamless integration with Google Meet UI
- Real-time speech-to-text translation
- Detachable translation window
- Language selection
- OAuth2 authentication with Google
- Configurable server settings

## Directory Structure

```
/meet
├── manifest.json     # Extension configuration
├── content.js       # Google Meet integration
├── background.js    # Service worker for auth
├── options.html     # Settings page UI
├── options.js       # Settings functionality
└── styles.css       # UI styling
```

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure extension:
   - Copy `config.example.js` to `config.js`
   - Update server URL and other settings

3. Load in Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this directory

## Components

### Content Script (`content.js`)
- Injects UI elements into Google Meet
- Handles speech recognition
- Manages WebSocket connection
- Controls translation window

### Background Script (`background.js`)
- Manages authentication state
- Handles OAuth2 flow
- Stores tokens securely

### Options Page (`options.js`, `options.html`)
- Server configuration
- Authentication management
- Connection status
- Language preferences

## Building for Production

1. Prepare the build:
   ```bash
   npm run build
   ```

2. The extension will be built in the `dist` directory

3. For Chrome Web Store:
   - Zip the contents of `dist`
   - Upload to Chrome Web Store Developer Dashboard

## Testing

```bash
npm test
```

## Debugging

1. Background script:
   - Go to `chrome://extensions`
   - Find Shabe
   - Click "background page" under "Inspect views"

2. Content script:
   - Open Chrome DevTools in Google Meet
   - Look for console messages prefixed with "[Shabe]"

## Contributing

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Submit a pull request

## Security

- Tokens are stored in `chrome.storage.local`
- HTTPS is required for production
- OAuth2 is used for authentication
- Sensitive data is never exposed to the page
