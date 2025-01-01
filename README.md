# Shabe - Real-time Translation for Google Meet

Shabe is a real-time translation system that helps break down language barriers in Google Meet conversations. It provides instant translation of speech in multiple languages, making cross-language communication seamless.

## Features

- Real-time speech recognition and translation
- Support for multiple languages including English, Japanese, Korean, Chinese, Spanish, French, and German
- Easy-to-use interface integrated directly into Google Meet
- Instant message display with clear distinction between sent and received translations
- Manual control over translation with Start/Pause functionality
- Secure Google authentication with token persistence
- Detachable translation window for flexible viewing

## Components

### 1. Google Meet Chrome Extension

The Chrome extension integrates directly with Google Meet and provides the user interface for translation.

#### Installation

1. Clone this repository:
```bash
git clone https://github.com/ascii27/shabe.git
cd shabe
```

2. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `meet` folder from this repository

3. The extension icon should now appear in your Chrome toolbar

### 2. Translation Server

The WebSocket server handles authentication, translation requests, and manages room connections.

#### Prerequisites

- Go 1.21 or later
- Docker (optional, for containerized deployment)
- OpenAI API Key
- Google OAuth2 Credentials

#### Environment Variables

- `OPENAI_API_KEY` (required): Your OpenAI API key for translation
- `GOOGLE_CLIENT_ID` (required): Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` (required): Your Google OAuth client secret
- `OAUTH_REDIRECT_URL` (required): OAuth redirect URL (e.g., http://localhost:8080/auth/callback)
- `PORT` (optional): Server port number (default: 8080)

#### Running Locally

1. Set your environment variables:
```bash
export OPENAI_API_KEY=your_api_key_here
export GOOGLE_CLIENT_ID=your_client_id_here
export GOOGLE_CLIENT_SECRET=your_client_secret_here
export OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback
```

2. Start the server:
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
docker run -p 8080:8080 \
  -e OPENAI_API_KEY=your_api_key_here \
  -e GOOGLE_CLIENT_ID=your_client_id_here \
  -e GOOGLE_CLIENT_SECRET=your_client_secret_here \
  -e OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback \
  shabe
```

## Usage

1. Join a Google Meet call
2. Click the Shabe extension icon in your Chrome toolbar to show the translator
3. If not signed in, click "Sign in with Google" and complete the authentication
4. Select your preferred language from the dropdown
5. Click the microphone icon to start/stop translation
6. Translations will appear in the message window in real-time
7. (Optional) Click the detach icon to open the translator in a separate window

## Development

### Extension Structure

- `meet/manifest.json` - Extension configuration
- `meet/content.js` - Main content script for Google Meet integration
- `meet/background.js` - Background service worker
- `meet/styles.css` - UI styling

### Server Structure

- `main.go` - Main server implementation
- `auth/` - Authentication handlers and middleware
- `chat/` - WebSocket and room management
- `config/` - Configuration management
- `go.mod` & `go.sum` - Go module dependencies

## Authentication

Shabe uses Google OAuth2 for secure user authentication:

1. Users sign in with their Google account
2. Authentication tokens are securely stored and automatically refreshed
3. All WebSocket connections require valid authentication
4. Tokens expire after 24 hours for security

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Add your chosen license here]
