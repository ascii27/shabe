package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"shabe/auth"
	"shabe/chat"
	"shabe/config"

	"github.com/gorilla/websocket"
	"github.com/sashabaranov/go-openai"
	"golang.org/x/oauth2"
)

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for now
		},
	}
	roomManager  *chat.RoomManager
	authManager  *auth.Manager
	openaiClient *openai.Client
)

func init() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.SetOutput(os.Stdout)
}

// CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Allow requests from Chrome extension and Google Meet
		w.Header().Set("Access-Control-Allow-Origin", "https://meet.google.com")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	// Initialize managers
	roomManager = chat.NewRoomManager()
	authManager = auth.NewManager(&auth.Config{
		ClientID:     cfg.OAuth.ClientID,
		ClientSecret: cfg.OAuth.ClientSecret,
		RedirectURL:  cfg.OAuth.RedirectURL,
	})

	// Initialize OpenAI client
	apiKey := cfg.OpenAIApiKey
	if apiKey == "" {
		log.Fatal("OpenAI API key is required in config")
	}
	openaiClient = openai.NewClient(apiKey)

	// Set up routes
	mux := http.NewServeMux()

	// Auth routes with CORS
	mux.Handle("/auth/login", corsMiddleware(http.HandlerFunc(authManager.LoginHandler)))
	mux.Handle("/auth/callback", corsMiddleware(http.HandlerFunc(authManager.CallbackHandler)))
	mux.Handle("/auth/logout", corsMiddleware(http.HandlerFunc(authManager.LogoutHandler)))
	mux.Handle("/auth/user", corsMiddleware(http.HandlerFunc(authManager.UserInfoHandler)))

	// WebSocket route - requires authentication
	mux.HandleFunc("/ws", handleWebSocket)

	// Login page - no auth required
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/login.html")
	})

	// Static assets (CSS, JS, images) - no auth required
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Root and other paths - protected by auth
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth check for login page
		if r.URL.Path == "/login" {
			http.ServeFile(w, r, "static/login.html")
			return
		}

		// Check auth token from URL parameter
		token := authManager.GetTokenFromRequest(r)
		if token == "" {
			log.Printf("No auth token found in URL")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		oauthToken := &oauth2.Token{
			AccessToken: token,
		}
		if _, err := authManager.GetUserInfo(oauthToken); err != nil {
			log.Printf("Invalid token: %v", err)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// For root path, serve index.html
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "static/index.html")
			return
		}

		// Serve other files from static directory
		http.NotFound(w, r)
	}))

	// Start server
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("Starting server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("roomId")
	if roomID == "" {
		http.Error(w, "Room ID is required", http.StatusBadRequest)
		return
	}

	// Get token from URL query parameter
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	oauthToken := &oauth2.Token{
		AccessToken: token,
	}
	user, err := authManager.GetUserInfo(oauthToken)
	if err != nil {
		http.Error(w, "Invalid authentication token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &chat.Client{
		Conn:     conn,
		Language: "en",
		Name:     user.Name,
		Email:    user.Email,
	}

	room := roomManager.GetOrCreateRoom(roomID)
	room.AddClient(client)

	defer func() {
		conn.Close()
		room.RemoveClient(client)
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg struct {
			Type     string `json:"type"`
			Text     string `json:"text,omitempty"`
			Language string `json:"language,omitempty"`
			Name     string `json:"name,omitempty"`
		}

		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error parsing message: %v", err)
			continue
		}

		switch msg.Type {
		case "message":
			if msg.Text == "" {
				continue
			}

			// Create response message
			response := struct {
				Type string `json:"type"`
				Text string `json:"text"`
				Name string `json:"name"`
			}{
				Type: "message",
				Text: msg.Text,
				Name: client.Name,
			}

			// Marshal and broadcast the message
			jsonResponse, err := json.Marshal(response)
			if err != nil {
				log.Printf("Error marshaling response: %v", err)
				continue
			}
			room.BroadcastMessage(jsonResponse)

		case "preferences":
			log.Printf("Client %s set preferences: language=%s, name=%s", client.Name, msg.Language, msg.Name)
			if msg.Language != "" {
				client.Language = msg.Language
			}
			if msg.Name != "" {
				client.Name = msg.Name
			}
		}
	}
}

func translateText(text, fromLang, toLang string) (string, error) {
	if fromLang == toLang || openaiClient == nil {
		return text, nil
	}

	prompt := fmt.Sprintf("Translate the following text from %s to %s. Maintain the same tone and meaning:\n\n%s", fromLang, toLang, text)

	resp, err := openaiClient.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: openai.GPT3Dot5Turbo,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
		},
	)

	if err != nil {
		return "", fmt.Errorf("translation error: %v", err)
	}

	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no translation received")
	}

	return resp.Choices[0].Message.Content, nil
}
