# Real-time Translation Chat

A real-time chat application that enables users to communicate in different languages using speech recognition and automatic translation.

## Project Structure

```
.
├── config/
│   └── config.go     # Configuration handling
├── frontend/
│   ├── index.html    # Web interface
│   └── main.js       # Frontend JavaScript code
├── config.yaml       # Configuration file
├── go.mod           # Go module file
└── main.go          # Main server code
```

## Setup

1. Configure the application:
   - Copy `config.yaml` and set your OpenAI API key
   - Alternatively, set the `OPENAI_API_KEY` environment variable

2. Start the server:
   ```bash
   go run main.go
   ```

3. Open the application:
   - Navigate to `http://localhost:8080` in your web browser
   - Chrome is recommended for speech recognition support

## Features

- Real-time speech recognition in multiple languages
- Automatic translation using ChatGPT
- Support for multiple simultaneous connections
- Different language preferences per user
- WebSocket-based communication for real-time updates
