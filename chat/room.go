package chat

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Room represents a chat room with its participants
type Room struct {
	ID         string
	clients    map[*websocket.Conn]*Client
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.RWMutex
	manager    *RoomManager
}

// Client represents a connected client with their language preference
type Client struct {
	Conn     *websocket.Conn
	Language string
}

// Message represents a chat message
type Message struct {
	Type     string `json:"type"`
	Text     string `json:"text"`
	Language string `json:"language,omitempty"`
}

// NewRoom creates a new chat room with the given ID
func NewRoom(id string, manager *RoomManager) *Room {
	return &Room{
		ID:         id,
		clients:    make(map[*websocket.Conn]*Client),
		broadcast:  make(chan []byte),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
		manager:    manager,
	}
}

// Run starts the room's message handling
func (r *Room) Run() {
	for {
		select {
		case client := <-r.register:
			r.mu.Lock()
			r.clients[client] = &Client{Conn: client, Language: "en"}
			clientCount := len(r.clients)
			r.mu.Unlock()
			log.Printf("👋 Client joined room %s (total clients: %d)", r.ID, clientCount)

		case client := <-r.unregister:
			r.mu.Lock()
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				client.Close()

				clientCount := len(r.clients)
				log.Printf("👋 Client left room %s (remaining clients: %d)", r.ID, clientCount)

				// If this was the last client, remove the room
				if clientCount == 0 {
					r.manager.RemoveRoom(r.ID)
					r.mu.Unlock()
					return // Exit the Run loop as room is being removed
				}
			}
			r.mu.Unlock()

		case message := <-r.broadcast:
			r.mu.RLock()
			for client := range r.clients {
				if err := client.WriteMessage(websocket.TextMessage, message); err != nil {
					client.Close()
					delete(r.clients, client)
				}
			}
			r.mu.RUnlock()
		}
	}
}

// BroadcastMessage sends a message to all clients in the room
func (r *Room) BroadcastMessage(message []byte) {
	r.broadcast <- message
}

// BroadcastTranslatedMessage sends a translated message to all clients in the room
func (r *Room) BroadcastTranslatedMessage(text, fromLang string, sender *websocket.Conn, translateFn func(text, targetLang string) (string, error)) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Broadcast to all clients (skipping sender)
	for conn, client := range r.clients {
		if conn == sender {
			continue
		}

		// For the sender, use the original text
		msgText := text
		if conn != sender {
			// For other clients, translate if needed
			if translated, err := translateFn(text, client.Language); err == nil {
				msgText = translated
			}
		}

		msg := Message{
			Type: "message",
			Text: msgText,
		}

		msgBytes, err := json.Marshal(msg)
		if err != nil {
			continue
		}

		if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
			conn.Close()
			delete(r.clients, conn)
		}
	}
}

// AddClient adds a new client to the room
func (r *Room) AddClient(client *websocket.Conn) {
	r.register <- client
}

// RemoveClient removes a client from the room
func (r *Room) RemoveClient(client *websocket.Conn) {
	r.unregister <- client
}

// SetClientLanguage sets the language preference for a client
func (r *Room) SetClientLanguage(client *websocket.Conn, language string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if c, exists := r.clients[client]; exists {
		c.Language = language
	}
}

// GetClientCount returns the current number of clients in the room
func (r *Room) GetClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}
