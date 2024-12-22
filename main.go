package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"shabe/config"

	"github.com/gorilla/websocket"
	"github.com/sashabaranov/go-openai"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for demo
	},
}

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	language string
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	openAI     *openai.Client
}

type Message struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Language string `json:"language,omitempty"`
}

func newHub(openAIKey string) *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
		openAI:     openai.NewClient(openAIKey),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

func (h *Hub) translateText(text, fromLang, toLang string) (string, error) {
	if fromLang == toLang {
		return text, nil
	}

	prompt := "Translate the following text from " + fromLang + " to " + toLang + ":\n\n" + text

	resp, err := h.openAI.CreateChatCompletion(
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
		return "", err
	}

	return resp.Choices[0].Message.Content, nil
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("error unmarshaling message: %v", err)
			continue
		}

		switch msg.Type {
		case "preferences":
			c.language = msg.Language
		case "message":
			var wg sync.WaitGroup
			for client := range c.hub.clients {
				if client == c {
					continue
				}

				wg.Add(1)
				go func(client *Client) {
					defer wg.Done()
					translatedText, err := c.hub.translateText(msg.Text, msg.Language, client.language)
					if err != nil {
						log.Printf("translation error: %v", err)
						return
					}

					response := Message{
						Type: "message",
						Text: translatedText,
					}

					responseJSON, err := json.Marshal(response)
					if err != nil {
						log.Printf("error marshaling response: %v", err)
						return
					}

					client.send <- responseJSON
				}(client)
			}
			wg.Wait()
		}
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()

	for {
		message, ok := <-c.send
		if !ok {
			c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}

		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		language: "en",
	}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func main() {
	cfg, err := config.LoadConfig("")
	if err != nil {
		log.Fatal("Failed to load config: ", err)
	}

	if cfg.OpenAIApiKey == "" {
		log.Fatal("OpenAI API key is required")
	}

	hub := newHub(cfg.OpenAIApiKey)
	go hub.run()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})

	// Serve static files from the frontend directory
	fs := http.FileServer(http.Dir("frontend"))
	http.Handle("/", fs)

	serverAddr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("Server starting on %s", serverAddr)
	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
