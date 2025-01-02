# Shabe Server

Backend server component of Shabe, providing WebSocket-based real-time translation services.

## Features

- WebSocket-based real-time communication
- OAuth2 authentication with Google
- Real-time message translation using OpenAI
- Multi-room support
- Configurable language settings
- Secure token management

## Directory Structure

```
/server
├── main.go                # Server entry point
├── auth/                  # Authentication handlers
│   ├── auth.go           # OAuth2 implementation
│   └── auth_test.go      # Auth tests
├── chat/                  # WebSocket and room management
│   ├── client.go         # Client implementation
│   ├── conn.go           # Connection handling
│   ├── manager.go        # Room management
│   ├── room.go           # Room implementation
│   └── room_test.go      # Room tests
├── config/               # Configuration management
│   └── config.go         # Environment config
├── translate/            # Translation service
│   └── translate.go      # OpenAI integration
├── websocket/           # WebSocket handlers
│   ├── websocket.go     # WebSocket implementation
│   └── websocket_test.go # WebSocket tests
└── static/              # Static files
    ├── index.html       # Main page
    ├── login.html       # Auth pages
    └── styles.css       # UI styling
```

## Prerequisites

- Go 1.21 or later
- OpenAI API key
- Google OAuth2 credentials

## Development Setup

1. Install dependencies:
   ```bash
   go mod download
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Set the following variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URL`
   - `OPENAI_API_KEY`

3. Run the server:
   ```bash
   go run main.go
   ```

## API Documentation

### WebSocket Endpoint

- **URL**: `/ws`
- **Query Parameters**:
  - `roomId`: Room identifier
  - `token`: Authentication token
- **Events**:
  - `message`: New message event
  - `join`: User joined room
  - `leave`: User left room

### HTTP Endpoints

- **Authentication**:
  - `GET /auth/login`: Start OAuth2 flow
  - `GET /auth/callback`: OAuth2 callback
  - `GET /auth/verify`: Verify authentication token

## Testing

Run all tests:
```bash
go test ./...
```

Run specific package tests:
```bash
go test ./auth
go test ./chat
go test ./websocket
```

## Deployment

### Docker

1. Build image:
   ```bash
   docker build -t shabe-server .
   ```

2. Run container:
   ```bash
   docker run -p 8080:8080 \
     --env-file .env \
     shabe-server
   ```

### Manual

1. Build binary:
   ```bash
   go build -o shabe-server
   ```

2. Run server:
   ```bash
   ./shabe-server
   ```

## Monitoring

- Server logs to stdout/stderr
- WebSocket connection status in logs
- Room management events logged
- Translation service status

## Security

- All endpoints require authentication
- Tokens are validated on every request
- HTTPS required in production
- Environment variables for sensitive data
- Rate limiting on auth endpoints

## Contributing

1. Fork the repository
2. Create your feature branch
3. Write tests for new features
4. Submit a pull request

## License

MIT License - see LICENSE file for details
