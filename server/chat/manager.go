package chat

import (
	"log"
	"sync"
)

// RoomManager manages chat rooms
type RoomManager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

// NewRoomManager creates a new room manager
func NewRoomManager() *RoomManager {
	return &RoomManager{
		rooms: make(map[string]*Room),
	}
}

// GetOrCreateRoom returns an existing room or creates a new one
func (m *RoomManager) GetOrCreateRoom(id string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, exists := m.rooms[id]; exists {
		return room
	}

	log.Printf("🏠 Creating new room: %s", id)
	room := NewRoom(id)
	m.rooms[id] = room
	return room
}

// RemoveRoom removes a room if it exists and is empty
func (m *RoomManager) RemoveRoom(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, exists := m.rooms[id]; exists && room.IsEmpty() {
		log.Printf("🏚️  Destroying room: %s", id)
		delete(m.rooms, id)
	}
}

// GetRoom returns a room by ID if it exists
func (m *RoomManager) GetRoom(id string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[id]
}

// GetRoomCount returns the number of active rooms
func (m *RoomManager) GetRoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

// GetRooms returns a slice of all rooms
func (m *RoomManager) GetRooms() []*Room {
	m.mu.RLock()
	defer m.mu.RUnlock()

	rooms := make([]*Room, 0, len(m.rooms))
	for _, room := range m.rooms {
		rooms = append(rooms, room)
	}
	return rooms
}
