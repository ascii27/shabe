package chat

import (
	"log"
	"sync"
)

// RoomManager manages all active chat rooms
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
func (rm *RoomManager) GetOrCreateRoom(roomID string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, exists := rm.rooms[roomID]; exists {
		return room
	}

	log.Printf("🏠 Creating new room: %s", roomID)
	room := NewRoom(roomID, rm)
	rm.rooms[roomID] = room
	go room.Run()
	return room
}

// RemoveRoom removes a room if it exists
func (rm *RoomManager) RemoveRoom(roomID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if _, exists := rm.rooms[roomID]; exists {
		log.Printf("🏚️  Destroying room: %s", roomID)
		delete(rm.rooms, roomID)
	}
}

// RoomExists checks if a room exists
func (rm *RoomManager) RoomExists(roomID string) bool {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	_, exists := rm.rooms[roomID]
	return exists
}

// GetActiveRoomCount returns the number of active rooms
func (rm *RoomManager) GetActiveRoomCount() int {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	count := len(rm.rooms)
	return count
}
