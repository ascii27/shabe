package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"shabe/auth"
	"shabe/chat"
	"shabe/translate"

	"github.com/gorilla/websocket"
)

// WebSocket manages WebSocket connections and message handling
type WebSocket struct {
	upgrader    websocket.Upgrader
	roomManager *chat.RoomManager
	authManager auth.Authenticator
	translator  translate.Translator
}

// Message represents a websocket message
type Message struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Language string `json:"language,omitempty"`
	Name     string `json:"name,omitempty"`
}

// NewHandler creates a new WebSocket handler
func NewHandler(roomManager *chat.RoomManager, authManager auth.Authenticator, translator translate.Translator) *WebSocket {
	return &WebSocket{
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins in development
			},
		},
		roomManager: roomManager,
		authManager: authManager,
		translator:  translator,
	}
}

// HandleConnection is the main WebSocket connection handler
func (ws *WebSocket) HandleConnection(w http.ResponseWriter, r *http.Request) {
	conn, err := ws.upgradeConnection(w, r)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	client, room, err := ws.setupClientAndRoom(r, conn)
	if err != nil {
		log.Printf("Failed to setup client and room: %v", err)
		return
	}
	defer room.RemoveClient(client)

	ws.messageLoop(client, room)
}

// upgradeConnection upgrades the HTTP connection to WebSocket
func (ws *WebSocket) upgradeConnection(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	// Validate required parameters
	token := r.URL.Query().Get("token")
	if token == "" {
		return nil, fmt.Errorf("token is required")
	}
	
	roomID := r.URL.Query().Get("roomId")
	if roomID == "" {
		return nil, fmt.Errorf("roomId is required")
	}

	// Verify auth token before upgrading
	_, err := ws.authManager.GetUserInfo(token)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: %v", err)
	}

	return ws.upgrader.Upgrade(w, r, nil)
}

// setupClientAndRoom creates a new client and adds it to the room
func (ws *WebSocket) setupClientAndRoom(r *http.Request, conn *websocket.Conn) (*chat.Client, *chat.Room, error) {
	roomID := r.URL.Query().Get("roomId")
	token := r.URL.Query().Get("token")
	
	userInfo, err := ws.authManager.GetUserInfo(token)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get user info: %v", err)
	}

	client := chat.NewClient(conn, userInfo.Name, userInfo.Email)
	room := ws.roomManager.GetOrCreateRoom(roomID)
	room.AddClient(client)

	return client, room, nil
}

// messageLoop handles the main message processing loop
func (ws *WebSocket) messageLoop(client *chat.Client, room *chat.Room) {
	for {
		messageType, p, err := client.ReadMessage()
		if err != nil {
			log.Printf("Error reading message: %v", err)
			return
		}

		if messageType == websocket.TextMessage {
			if err := ws.handleTextMessage(p, client, room); err != nil {
				log.Printf("Error handling message: %v", err)
				continue
			}
		}
	}
}

// handleTextMessage processes text messages
func (ws *WebSocket) handleTextMessage(payload []byte, client *chat.Client, room *chat.Room) error {
	var msg Message
	if err := json.Unmarshal(payload, &msg); err != nil {
		return fmt.Errorf("error unmarshaling message: %v", err)
	}

	switch msg.Type {
	case "preferences":
		return ws.handlePreferences(msg, client)
	case "message":
		return ws.handleChatMessage(msg, client, room)
	default:
		return fmt.Errorf("unknown message type: %s", msg.Type)
	}
}

// handlePreferences updates client preferences
func (ws *WebSocket) handlePreferences(msg Message, client *chat.Client) error {
	if msg.Language != "" {
		client.SetLanguage(msg.Language)
	}
	if msg.Name != "" {
		client.SetName(msg.Name)
	}
	log.Printf("Client %s set preferences: language=%s, name=%s",
		client.GetName(), client.GetLanguage(), client.GetName())
	return nil
}

// handleChatMessage processes and broadcasts chat messages
func (ws *WebSocket) handleChatMessage(msg Message, client *chat.Client, room *chat.Room) error {
	if msg.Text == "" {
		return nil
	}

	room.BroadcastMessage(func(c *chat.Client) error {
		if c == client {
			return ws.sendMessage(c, msg.Text, client.GetName())
		}
		return ws.sendTranslatedMessage(c, msg.Text, client)
	})
	return nil
}

// sendMessage sends a message to a client
func (ws *WebSocket) sendMessage(client *chat.Client, text, name string) error {
	return client.WriteJSON(Message{
		Type: "message",
		Text: text,
		Name: name,
	})
}

// sendTranslatedMessage translates and sends a message to a client
func (ws *WebSocket) sendTranslatedMessage(recipient *chat.Client, text string, sender *chat.Client) error {
	translatedText := text
	if recipient.GetLanguage() != sender.GetLanguage() {
		translated, err := ws.translator.Translate(text, sender.GetLanguage(), recipient.GetLanguage())
		if err != nil {
			log.Printf("Translation error: %v", err)
		} else {
			translatedText = translated
		}
	}

	return ws.sendMessage(recipient, translatedText, sender.GetName())
}
