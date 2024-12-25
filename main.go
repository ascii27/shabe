package main

import (
	"context"
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
	Name     string `json:"name,omitempty"`
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

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("roomId")
	if roomID == "" {
		http.Error(w, "Room ID is required", http.StatusBadRequest)
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
		Name:     "Anonymous",
	}

	room := roomManager.GetOrCreateRoom(roomID)
	room.AddClient(client)

	defer func() {
		conn.Close()
		room.RemoveClient(client)
	}()

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		switch msg.Type {
		case "preferences":
			client.Language = msg.Language
			if msg.Name != "" {
				client.Name = msg.Name
			}
			room.SetClientLanguage(client, msg.Language)

		case "message":
			if msg.Text == "" {
				continue
			}

			// Set message name if not provided
			if msg.Name == "" {
				msg.Name = client.Name
			}

			// Broadcast translated message to all clients in the room
			for _, c := range room.GetClients() {
				if c == client {
					continue
				}

				translatedText, err := translateText(msg.Text, msg.Language, c.Language)
				if err != nil {
					log.Printf("Translation error: %v", err)
					continue
				}

				response := Message{
					Type: "message",
					Text: translatedText,
					Name: msg.Name,
				}

				err = c.Conn.WriteJSON(response)
				if err != nil {
					log.Printf("WebSocket write error: %v", err)
				}
			}
		}
	}
}

func main() {
	// Get OpenAI API key from environment variable
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		log.Fatal("OPENAI_API_KEY environment variable is required")
	}
	openaiClient = openai.NewClient(apiKey)

	// Initialize router and routes
	router := mux.NewRouter()
	
	// Serve static files
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
	
	// WebSocket endpoint
	router.HandleFunc("/ws", handleWebSocket)
	
	// Serve index.html
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		indexPath := filepath.Join("static", "index.html")
		http.ServeFile(w, r, indexPath)
	})
	
	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	log.Printf("Starting server on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
