# Shabe - Real-time Translation for Google Meet

Shabe is a Chrome extension that provides real-time translation in Google Meet, enabling seamless communication across language barriers.

## Features

- Real-time speech-to-text translation during Google Meet calls
- Support for multiple languages
- Detachable translation window
- Google OAuth2 authentication
- Configurable server settings

## Project Structure

```
/shabe
├── /server          # Go backend server (WebSocket, OAuth2, translation)
├── /meet            # Chrome extension (Google Meet integration)
└── /docker          # Docker configurations
```

## Quick Start

### Server Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URL=http://localhost:8080/auth/callback
   OPENAI_API_KEY=your_openai_key
   ```
3. Run the server:
   ```bash
   cd server
   go run main.go
   ```
   Or using Docker:
   ```bash
   docker build -t shabe-server .
   docker run -p 8080:8080 shabe-server
   ```

### Extension Setup

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `meet` directory
4. Click the extension icon and configure your server URL

## Usage

1. Join a Google Meet call
2. Click the Shabe icon in the Meet interface
3. Select your preferred language
4. Start speaking - your speech will be translated in real-time
5. Click and drag the translation window to reposition it

## Development

See individual READMEs in `/server` and `/meet` directories for detailed development instructions.

## License

MIT License - see LICENSE file for details
