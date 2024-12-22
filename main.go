package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/sashabaranov/go-openai"
	"shabe/chat"
	"shabe/config"
)

func init() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.SetOutput(os.Stdout)
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			log.Printf("Checking origin: %s", r.Header.Get("Origin"))
			return true // Allow all origins for now
		},
		HandshakeTimeout: 10 * time.Second,
	}
	roomManager  = chat.NewRoomManager()
	openaiClient *openai.Client
)

type Message struct {
	Type     string `json:"type"`
	RoomID   string `json:"roomId"`
	Text     string `json:"text,omitempty"`
	Language string `json:"language,omitempty"`
}

type Client struct {
	conn     *websocket.Conn
	room     *chat.Room
	language string
}

func translateText(text, fromLang, toLang string) (string, error) {
	if fromLang == toLang || openaiClient == nil {
		return text, nil
	}

	prompt := fmt.Sprintf("Translate the following text from %s to %s:\n\n%s", fromLang, toLang, text)

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
		return text, err // Return original text on error
	}

	return resp.Choices[0].Message.Content, nil
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Printf("WebSocket connection attempt from %s", r.RemoteAddr)
	
	roomID := r.URL.Query().Get("roomId")
	if roomID == "" {
		log.Printf("Error: No room ID provided")
		http.Error(w, "Room ID is required", http.StatusBadRequest)
		return
	}

	log.Printf("Attempting to upgrade connection for room: %s", roomID)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error: Failed to upgrade connection: %v", err)
		return
	}

	log.Printf("Successfully upgraded connection for room: %s", roomID)

	room := roomManager.GetOrCreateRoom(roomID)
	client := &Client{
		conn:     conn,
		room:     room,
		language: "en", // Default language
	}

	room.AddClient(conn)
	defer func() {
		room.RemoveClient(conn)
		conn.Close()
	}()

	// Handle incoming messages
	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Error reading message: %v", err)
			break
		}

		var msg Message
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		switch msg.Type {
		case "preferences":
			client.language = msg.Language
			room.SetClientLanguage(conn, msg.Language)
			log.Printf("Updated client language to: %s", msg.Language)

		case "message":
			if msg.RoomID != roomID {
				continue
			}

			// Get all clients in the room
			room.BroadcastTranslatedMessage(msg.Text, msg.Language, client.conn, func(text, targetLang string) (string, error) {
				return translateText(text, msg.Language, targetLang)
			})
		}
	}
}

func main() {
	log.Println(" Starting Shabe chat server...")

	cfg, err := config.LoadConfig("")
	if err != nil {
		log.Printf("Warning: Failed to load config: %v", err)
	} else if cfg.OpenAIApiKey != "" {
		openaiClient = openai.NewClient(cfg.OpenAIApiKey)
		log.Println("OpenAI translation enabled")
	} else {
		log.Println("OpenAI translation disabled - no API key provided")
	}

	r := mux.NewRouter()

	// WebSocket endpoint - must be defined before the catch-all handler
	r.HandleFunc("/ws", handleWebSocket)

	// Serve static files
	fs := http.FileServer(http.Dir("frontend"))
	r.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("HTTP request: %s %s", r.Method, r.URL.Path)
		// If the file doesn't exist, serve index.html
		path := filepath.Join("frontend", r.URL.Path)
		_, err := os.Stat(path)
		if os.IsNotExist(err) {
			http.ServeFile(w, r, "frontend/index.html")
			return
		}
		fs.ServeHTTP(w, r)
	}))

	port := ":8080"
	if cfg != nil && cfg.Server.Port != 0 {
		port = fmt.Sprintf(":%d", cfg.Server.Port)
	}

	log.Printf("Server starting on http://localhost%s", port)
	log.Fatal(http.ListenAndServe(port, r))
}
