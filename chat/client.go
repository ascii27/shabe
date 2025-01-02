package chat

import (
	"github.com/gorilla/websocket"
)

// Client represents a connected chat client
type Client struct {
	conn     *websocket.Conn
	name     string
	email    string
	language string
}

// NewClient creates a new chat client
func NewClient(conn *websocket.Conn, name, email string) *Client {
	return &Client{
		conn:     conn,
		name:     name,
		email:    email,
		language: "en", // Default to English
	}
}

// GetName returns the client's name
func (c *Client) GetName() string {
	return c.name
}

// SetName sets the client's name
func (c *Client) SetName(name string) {
	c.name = name
}

// GetEmail returns the client's email
func (c *Client) GetEmail() string {
	return c.email
}

// GetLanguage returns the client's preferred language
func (c *Client) GetLanguage() string {
	return c.language
}

// SetLanguage sets the client's preferred language
func (c *Client) SetLanguage(lang string) {
	c.language = lang
}

// WriteJSON writes a JSON message to the client
func (c *Client) WriteJSON(v interface{}) error {
	return c.conn.WriteJSON(v)
}

// ReadMessage reads a message from the client's connection
func (c *Client) ReadMessage() (int, []byte, error) {
	return c.conn.ReadMessage()
}

// Close closes the client's connection
func (c *Client) Close() error {
	return c.conn.Close()
}
