package websocket

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"shabe/server/auth"
	"shabe/server/chat"
	"shabe/server/translate"

	"github.com/gorilla/websocket"
)

type mockAuth struct {
	userInfo *auth.UserInfo
	err      error
}

func (m *mockAuth) GetUserInfo(token string) (*auth.UserInfo, error) {
	return m.userInfo, m.err
}

func (m *mockAuth) HandleAuthURL(w http.ResponseWriter, r *http.Request)      {}
func (m *mockAuth) HandleAuthCallback(w http.ResponseWriter, r *http.Request) {}
func (m *mockAuth) HandleAuthVerify(w http.ResponseWriter, r *http.Request)   {}
func (m *mockAuth) GetAuthURL() string                                        { return "" }
func (m *mockAuth) ExchangeCode(code string) (*auth.UserInfo, string, error)  { return nil, "", nil }

func setupTest() (*WebSocket, *httptest.Server) {
	roomManager := chat.NewRoomManager()
	authManager := &mockAuth{
		userInfo: &auth.UserInfo{
			Name:  "Test User",
			Email: "test@example.com",
		},
	}
	translator := translate.NewMockTranslator()
	ws := NewHandler(roomManager, authManager, translator)

	server := httptest.NewServer(http.HandlerFunc(ws.HandleConnection))
	return ws, server
}

func TestWebSocket_UpgradeConnection(t *testing.T) {
	_, server := setupTest()
	defer server.Close()

	// Convert http URL to ws URL
	u, _ := url.Parse(server.URL)
	u.Scheme = "ws"
	u.RawQuery = "token=valid-token&roomId=test-room"

	// Test successful connection
	t.Run("successful connection", func(t *testing.T) {
		c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		assert.NoError(t, err)
		defer c.Close()
	})

	// Test missing room ID
	t.Run("missing room ID", func(t *testing.T) {
		u.RawQuery = "token=valid-token"
		_, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		assert.Error(t, err)
	})

	// Test missing token
	t.Run("missing token", func(t *testing.T) {
		u.RawQuery = "roomId=test-room"
		_, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		assert.Error(t, err)
	})
}

func TestWebSocket_MessageHandling(t *testing.T) {
	_, server := setupTest()
	defer server.Close()

	// Setup WebSocket connection
	u, _ := url.Parse(server.URL)
	u.Scheme = "ws"
	u.RawQuery = "token=valid-token&roomId=test-room"

	// Connect two clients
	c1, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	assert.NoError(t, err)
	defer c1.Close()

	c2, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	assert.NoError(t, err)
	defer c2.Close()

	// Test preferences message
	t.Run("preferences message", func(t *testing.T) {
		msg := Message{
			Type:     "preferences",
			Language: "es",
			Name:     "New Name",
		}
		err := c1.WriteJSON(msg)
		assert.NoError(t, err)
	})

	// Test chat message
	t.Run("chat message", func(t *testing.T) {
		// Send message from client 1
		msg := Message{
			Type: "message",
			Text: "Hello, World!",
		}
		err := c1.WriteJSON(msg)
		assert.NoError(t, err)

		// Read message from client 2
		var received Message
		err = c2.ReadJSON(&received)
		assert.NoError(t, err)
		assert.Equal(t, "message", received.Type)
		assert.Equal(t, "Hello, World!", received.Text)
	})
}

func TestWebSocket_ErrorHandling(t *testing.T) {
	// Setup with failing auth
	roomManager := chat.NewRoomManager()
	authManager := &mockAuth{
		err: assert.AnError,
	}
	translator := translate.NewMockTranslator()
	ws := NewHandler(roomManager, authManager, translator)

	server := httptest.NewServer(http.HandlerFunc(ws.HandleConnection))
	defer server.Close()

	// Test auth failure
	t.Run("auth failure", func(t *testing.T) {
		u, _ := url.Parse(server.URL)
		u.Scheme = "ws"
		u.RawQuery = "token=invalid-token&roomId=test-room"

		_, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		assert.Error(t, err)
	})
}
