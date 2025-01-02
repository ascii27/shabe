package main

import (
	"log"
	"net/http"
	"os"
	"shabe/auth"
	"shabe/chat"
	"shabe/translate"
	"shabe/websocket"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize components
	authManager := auth.NewManager(&auth.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
	})

	roomManager := chat.NewRoomManager()

	translator := translate.NewOpenAITranslator(os.Getenv("OPENAI_API_KEY"))

	wsHandler := websocket.NewHandler(roomManager, authManager, translator)

	// Set up routes
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

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
