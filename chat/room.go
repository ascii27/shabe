package chat

import (
	"log"
	"sync"
)

// Room represents a chat room
type Room struct {
	id       string
	clients  map[*Client]bool
	mu       sync.RWMutex
}

// NewRoom creates a new chat room
func NewRoom(id string) *Room {
	return &Room{
		id:      id,
		clients: make(map[*Client]bool),
	}
}

// AddClient adds a client to the room
func (r *Room) AddClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[client] = true
	log.Printf("Client %s joined room %s", client.GetName(), r.id)
}

// RemoveClient removes a client from the room
func (r *Room) RemoveClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clients, client)
	log.Printf("Client %s left room %s", client.GetName(), r.id)
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

// BroadcastMessage sends a message to all clients in the room
func (r *Room) BroadcastMessage(messageHandler func(*Client) error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for client := range r.clients {
		if err := messageHandler(client); err != nil {
			log.Printf("Error sending message to client %s: %v", client.GetName(), err)
		}
	}
}

// GetID returns the room ID
func (r *Room) GetID() string {
	return r.id
}

// GetClientCount returns the number of clients in the room
func (r *Room) GetClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// IsEmpty returns true if the room has no clients
func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0
}
