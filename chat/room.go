package chat

import (
	"github.com/gorilla/websocket"
	"log"
	"sync"
)

// Room represents a chat room with its participants
type Room struct {
	ID         string
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	manager    *RoomManager
}

// Client represents a connected client with their language preference
type Client struct {
	Conn     *websocket.Conn
	Language string
	Name     string
}

// Message represents a chat message
type Message struct {
	Type     string `json:"type"`
	Text     string `json:"text"`
	Language string `json:"language,omitempty"`
	Name     string `json:"name,omitempty"`
}

// NewRoom creates a new chat room with the given ID
func NewRoom(id string, manager *RoomManager) *Room {
	return &Room{
		ID:         id,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		manager:    manager,
	}
}

// Run starts the room's message handling
func (r *Room) Run() {
	for {
		select {
		case client := <-r.register:
			r.mu.Lock()
			r.clients[client] = true
			r.mu.Unlock()
			log.Printf("Client joined room %s", r.ID)

		case client := <-r.unregister:
			r.mu.Lock()
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				client.Conn.Close()

				log.Printf("Client left room %s", r.ID)

				// If this was the last client, remove the room
				if len(r.clients) == 0 {
					r.manager.RemoveRoom(r.ID)
				}
			}
			r.mu.Unlock()

		case message := <-r.broadcast:
			r.mu.RLock()
			for client := range r.clients {
				err := client.Conn.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Printf("Error broadcasting message: %v", err)
					client.Conn.Close()
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

// GetClients returns a slice of all clients in the room
func (r *Room) GetClients() []*Client {
	r.mu.RLock()
	defer r.mu.RUnlock()

	clients := make([]*Client, 0, len(r.clients))
	for client := range r.clients {
		clients = append(clients, client)
	}
	return clients
}

// AddClient adds a new client to the room
func (r *Room) AddClient(client *Client) {
	r.register <- client
}

// RemoveClient removes a client from the room
func (r *Room) RemoveClient(client *Client) {
	r.unregister <- client
}

// SetClientLanguage sets the language preference for a client
func (r *Room) SetClientLanguage(client *Client, language string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	client.Language = language
}

// GetClientCount returns the current number of clients in the room
func (r *Room) GetClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}
