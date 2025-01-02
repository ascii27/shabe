# Shabe Server

This is the server component of Shabe, providing real-time translation services for Google Meet.

## Features

- WebSocket-based real-time communication
- OAuth2 authentication with Google
- Real-time message translation
- Support for multiple chat rooms

## Development

### Prerequisites

- Go 1.21 or later
- Environment variables (see `.env.example`)

### Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the required values
3. Run `go mod download` to install dependencies
4. Run `go run main.go` to start the server

### Testing

Run `go test ./...` to run all tests

### Building

Run `go build -o main .` to build the server

## API Documentation

### WebSocket Endpoints

- `/ws` - WebSocket endpoint for real-time chat
  - Query parameters:
    - `roomId` - Room identifier
    - `token` - Authentication token

### HTTP Endpoints

- `/auth/login` - Start OAuth2 flow
- `/auth/callback` - OAuth2 callback
- `/auth/verify` - Verify authentication token
