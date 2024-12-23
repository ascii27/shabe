# Shabe - Real-time Translation for Google Meet

Shabe is a real-time translation system that helps break down language barriers in Google Meet conversations. It provides instant translation of speech in multiple languages, making cross-language communication seamless.

## Features

- Real-time speech recognition and translation
- Support for multiple languages including English, Japanese, Korean, Chinese, Spanish, French, and German
- Easy-to-use interface integrated directly into Google Meet
- Instant message display with clear distinction between sent and received translations
- Manual control over translation with Start/Pause functionality

## Components

### 1. Google Meet Chrome Extension

The Chrome extension integrates directly with Google Meet and provides the user interface for translation.

#### Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/shabe.git
cd shabe
```

2. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `meet` folder from this repository

3. The extension icon should now appear in your Chrome toolbar

### 2. Translation Server

The WebSocket server handles the translation requests and manages room connections.

#### Prerequisites

- Go 1.21 or later
- Docker (optional, for containerized deployment)

#### Running Locally

1. Start the server:
```bash
go run main.go
```

The server will start on port 8080 by default.

#### Using Docker

1. Build the image:
```bash
docker build -t shabe .
```

2. Run the container:
```bash
docker run -p 8080:8080 shabe
```

## Usage

1. Join a Google Meet call
2. Click the Shabe extension icon in your Chrome toolbar to show the translator
3. Select your preferred language from the dropdown
4. Click "Start Translation" to begin capturing and translating speech
5. Click "Pause Translation" when you want to stop
6. Translations will appear in the message window in real-time

## Development

### Extension Structure

- `meet/manifest.json` - Extension configuration
- `meet/content.js` - Main content script for Google Meet integration
- `meet/background.js` - Background service worker
- `meet/styles.css` - UI styling

### Server Structure

- `main.go` - Main server implementation
- `go.mod` & `go.sum` - Go module dependencies

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Add your chosen license here]
