package chat

import (
	"github.com/gorilla/websocket"
)

// Conn represents a WebSocket connection interface
type Conn interface {
	WriteMessage(messageType int, data []byte) error
	Close() error
}

// WebSocketConn is a wrapper around websocket.Conn that implements the Conn interface
type WebSocketConn struct {
	*websocket.Conn
}

// NewWebSocketConn creates a new WebSocketConn
func NewWebSocketConn(conn *websocket.Conn) *WebSocketConn {
	return &WebSocketConn{Conn: conn}
}

// WriteMessage writes a message to the WebSocket connection
func (w *WebSocketConn) WriteMessage(messageType int, data []byte) error {
	return w.Conn.WriteMessage(messageType, data)
}

// Close closes the WebSocket connection
func (w *WebSocketConn) Close() error {
	return w.Conn.Close()
}
