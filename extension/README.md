# Shabe Chat Chrome Extension

This Chrome extension provides a convenient way to access Shabe Chat directly from your browser.

## Features

- Quick access to Shabe Chat through a popup interface
- Persistent room and language settings
- Real-time chat with automatic translation
- Voice input support
- Modern, responsive UI

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `extension` directory

## Usage

1. Click the Shabe Chat icon in your Chrome toolbar
2. Enter a room ID and click "Join Room"
3. Select your preferred language
4. Start chatting!

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `popup.html`: Main UI
- `popup.js`: Core functionality
- `styles.css`: UI styling
- `icons/`: Extension icons

## Notes

- The extension connects to a local Shabe Chat server by default (ws://localhost:8080)
- Voice input requires microphone permissions
- Settings are synced across Chrome installations
