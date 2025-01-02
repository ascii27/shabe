package chat

import (
	"github.com/gorilla/websocket"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// mockConn is a mock implementation of the Conn interface for testing
type mockConn struct {
	*websocket.Conn
	messages [][]byte
}

func (m *mockConn) WriteMessage(messageType int, data []byte) error {
	m.messages = append(m.messages, data)
	return nil
}

func TestRoom(t *testing.T) {
	// Create a test room
	room := NewRoom("test-room")
	assert.NotNil(t, room)
	assert.Equal(t, "test-room", room.GetID())

	// Create test clients
	server := httptest.NewServer(nil)
	defer server.Close()

	client1 := NewClient(&websocket.Conn{}, "Test User 1", "user1@example.com")
	client1.SetLanguage("en")

	client2 := NewClient(&websocket.Conn{}, "Test User 2", "user2@example.com")
	client2.SetLanguage("ja")

	// Add clients to room
	room.AddClient(client1)
	assert.Equal(t, 1, room.GetClientCount())

	room.AddClient(client2)
	assert.Equal(t, 2, room.GetClientCount())

	// Test broadcasting
	messageCount := 0
	room.BroadcastMessage(func(c *Client) error {
		messageCount++
		return nil
	})
	assert.Equal(t, 2, messageCount)

	// Remove client and verify count
	room.RemoveClient(client1)
	assert.Equal(t, 1, room.GetClientCount())

	// Verify remaining client
	clients := room.GetClients()
	assert.Len(t, clients, 1)
	assert.Equal(t, client2, clients[0])

	// Remove last client and verify room is empty
	room.RemoveClient(client2)
	assert.True(t, room.IsEmpty())
}

func TestRoomManager(t *testing.T) {
	manager := NewRoomManager()
	assert.NotNil(t, manager)

	// Create a room
	room := manager.GetOrCreateRoom("test-room")
	assert.NotNil(t, room)
	assert.Equal(t, "test-room", room.GetID())

	// Add a test client
	client := NewClient(&websocket.Conn{}, "Test User", "user@example.com")
	room.AddClient(client)

	// Verify room exists
	assert.Equal(t, 1, manager.GetRoomCount())

	// Get the same room again
	sameRoom := manager.GetOrCreateRoom("test-room")
	assert.Equal(t, room, sameRoom)

	// Remove the client
	room.RemoveClient(client)

	// Remove the empty room
	manager.RemoveRoom("test-room")

	// Verify room was removed
	assert.Equal(t, 0, manager.GetRoomCount())
}
