package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Config holds the OAuth2 configuration
type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

// UserInfo represents the user info from Google
type UserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// Authenticator defines the interface for authentication operations
type Authenticator interface {
	GetUserInfo(token string) (*UserInfo, error)
	HandleAuthURL(w http.ResponseWriter, r *http.Request)
	HandleAuthCallback(w http.ResponseWriter, r *http.Request)
	HandleAuthVerify(w http.ResponseWriter, r *http.Request)
	GetAuthURL() string
	ExchangeCode(code string) (*UserInfo, string, error)
}

// Manager handles OAuth2 authentication
type Manager struct {
	config *oauth2.Config
}

// NewManager creates a new auth manager
func NewManager(cfg *Config) *Manager {
	return &Manager{
		config: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Scopes: []string{
				"https://www.googleapis.com/auth/userinfo.email",
				"https://www.googleapis.com/auth/userinfo.profile",
			},
			Endpoint: google.Endpoint,
		},
	}
}

// GetAuthURL returns the URL for OAuth2 authentication
func (m *Manager) GetAuthURL() string {
	return m.config.AuthCodeURL("state")
}

// Exchange exchanges the authorization code for an access token
func (m *Manager) Exchange(code string) (string, error) {
	token, err := m.config.Exchange(oauth2.NoContext, code)
	if err != nil {
		return "", fmt.Errorf("failed to exchange code: %v", err)
	}
	return token.AccessToken, nil
}

// GetUserInfo retrieves user information using the access token
func (m *Manager) GetUserInfo(token string) (*UserInfo, error) {
	client := m.config.Client(oauth2.NoContext, &oauth2.Token{
		AccessToken: token,
	})

	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, fmt.Errorf("failed to get user info: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get user info: status %d", resp.StatusCode)
	}

	var userInfo UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, fmt.Errorf("failed to decode user info: %v", err)
	}

	log.Printf("Got user info: %+v (for token %s)", userInfo, token)
	return &userInfo, nil
}

// HandleAuthURL handles the /auth/url endpoint
func (m *Manager) HandleAuthURL(w http.ResponseWriter, r *http.Request) {
	url := m.GetAuthURL()
	response := struct {
		URL string `json:"url"`
	}{
		URL: url,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleAuthCallback handles the /auth/callback endpoint
func (m *Manager) HandleAuthCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Missing code parameter", http.StatusBadRequest)
		return
	}

	token, err := m.Exchange(code)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to exchange code: %v", err), http.StatusInternalServerError)
		return
	}

	response := struct {
		Token string `json:"token"`
	}{
		Token: token,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleAuthVerify handles the /auth/verify endpoint
func (m *Manager) HandleAuthVerify(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("Authorization")
	if token == "" {
		http.Error(w, "Missing token", http.StatusUnauthorized)
		return
	}

	userInfo, err := m.GetUserInfo(token)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid token: %v", err), http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userInfo)
}

// ExchangeCode exchanges the authorization code for user info and access token
func (m *Manager) ExchangeCode(code string) (*UserInfo, string, error) {
	token, err := m.Exchange(code)
	if err != nil {
		return nil, "", fmt.Errorf("failed to exchange code: %v", err)
	}

	userInfo, err := m.GetUserInfo(token)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get user info: %v", err)
	}

	return userInfo, token, nil
}

// AuthMiddleware creates a middleware that checks for valid authentication
func (m *Manager) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for WebSocket upgrade requests
		if r.Header.Get("Upgrade") == "websocket" {
			next.ServeHTTP(w, r)
			return
		}

		// Get token from header
		token := r.Header.Get("Authorization")
		if token == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Verify token by getting user info
		_, err := m.GetUserInfo(token)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
