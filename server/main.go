package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"shabe/server/auth"
	"shabe/server/chat"
	"shabe/server/translate"
	"shabe/server/websocket"
)

func main() {
	// Initialize components
	authManager := auth.NewManager(&auth.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("OAUTH_REDIRECT_URL"),
	})

	roomManager := chat.NewRoomManager()

	translator := translate.NewOpenAITranslator(os.Getenv("OPENAI_API_KEY"))

	wsHandler := websocket.NewHandler(roomManager, authManager, translator)

	// Set up routes
	router := mux.NewRouter()

	// CORS middleware
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "https://meet.google.com")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			// Handle preflight requests
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// Auth routes
	router.HandleFunc("/auth/login", authManager.HandleAuthURL).Methods("GET")
	router.HandleFunc("/auth/callback", authManager.HandleAuthCallback).Methods("GET")
	router.HandleFunc("/auth/user", authManager.HandleAuthVerify).Methods("GET")

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
