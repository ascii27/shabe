package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"shabe/auth"
	"shabe/chat"
	"shabe/translate"
	wshandler "shabe/websocket"
	"testing"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

func setupTestServer(t *testing.T) *httptest.Server {
	// Set up test environment variables
	os.Setenv("GOOGLE_CLIENT_ID", "test-client-id")
	os.Setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
	os.Setenv("GOOGLE_REDIRECT_URL", "http://localhost:8080/auth/callback")
	os.Setenv("OPENAI_API_KEY", "test-api-key")

	// Initialize components
	authManager := auth.NewManager(&auth.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
	})

	roomManager := chat.NewRoomManager()
	translator := translate.NewMockTranslator()
	wsHandler := wshandler.NewHandler(roomManager, authManager, translator)

	// Set up router
	router := mux.NewRouter()

	// Auth routes
	router.HandleFunc("/auth/url", authManager.HandleAuthURL).Methods("GET")
	router.HandleFunc("/auth/callback", authManager.HandleAuthCallback).Methods("GET")
	router.HandleFunc("/auth/verify", authManager.HandleAuthVerify).Methods("GET")

	// WebSocket route
	router.HandleFunc("/ws", wsHandler.HandleConnection)

	// Static file server
	fs := http.FileServer(http.Dir("static"))
	router.PathPrefix("/").Handler(fs)

	// Create test server
	return httptest.NewServer(router)
}

func TestAuthEndpoints(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	// Test /auth/url endpoint
	t.Run("Auth URL endpoint", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/auth/url")
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status OK, got %v", resp.Status)
		}
	})

	// Test /auth/verify endpoint without token
	t.Run("Auth verify without token", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/auth/verify")
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected status Unauthorized, got %v", resp.Status)
		}
	})

	// Test /auth/callback endpoint
	t.Run("Auth callback without code", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/auth/callback")
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("Expected status BadRequest, got %v", resp.Status)
		}
	})
}

func TestWebSocketEndpoint(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	wsURL := "ws" + server.URL[4:] + "/ws"

	// Test basic connection without auth
	t.Run("WebSocket without auth", func(t *testing.T) {
		_, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			t.Error("Expected connection to fail without token")
		}
	})

	// Test with auth but without room ID
	t.Run("WebSocket with auth but no room", func(t *testing.T) {
		headers := http.Header{}
		headers.Set("Authorization", "test-token")
		_, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
		if err == nil {
			t.Error("Expected connection to fail without room ID")
		}
	})
}

func TestStaticFileServer(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	// Test root path
	t.Run("Root path", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/")
		if err != nil {
			t.Fatal(err)
		}
		// Should return index.html or 404 if not found
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
			t.Errorf("Expected status OK or NotFound, got %v", resp.Status)
		}
	})

	// Test non-existent file
	t.Run("Non-existent file", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/nonexistent.file")
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("Expected status NotFound, got %v", resp.Status)
		}
	})
}
