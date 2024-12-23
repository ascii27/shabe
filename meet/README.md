# Shabe Meet Translator

A Chrome extension that provides real-time translation in Google Meet.

## Features

- Automatically detects Google Meet room ID
- Connects to Shabe translation server
- Supports multiple languages:
  - English
  - Japanese
  - Korean
  - Chinese
  - Spanish
  - French
  - German
- Persists language preferences
- Toggle translator UI with extension icon

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `meet` directory

## Usage

1. Join a Google Meet room
2. Click the Shabe Meet Translator icon in your Chrome toolbar
3. Select your preferred language from the dropdown
4. The translator will automatically connect to the room

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `content.js`: Main content script that injects the translator UI
- `background.js`: Background script for extension icon handling
- `styles.css`: Styling for the translator UI
