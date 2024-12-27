package auth

import (
	"encoding/json"
	"fmt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"net/http"
)

// Config holds the OAuth2 configuration
type Config struct {
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	RedirectURL  string `yaml:"redirect_url"`
}

// GoogleUser represents the user info from Google
type GoogleUser struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// Manager handles OAuth2 authentication
type Manager struct {
	config *oauth2.Config
}

// NewManager creates a new auth manager
func NewManager(cfg *Config) *Manager {
	oauthConfig := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
		},
		Endpoint: google.Endpoint,
	}

	return &Manager{
		config: oauthConfig,
	}
}

// GetAuthURL returns the Google OAuth2 URL for authentication
func (m *Manager) GetAuthURL(state string) string {
	return m.config.AuthCodeURL(state)
}

// Exchange exchanges the authorization code for a token
func (m *Manager) Exchange(code string) (*oauth2.Token, error) {
	return m.config.Exchange(oauth2.NoContext, code)
}

// GetUserInfo fetches the user info from Google
func (m *Manager) GetUserInfo(token *oauth2.Token) (*GoogleUser, error) {
	client := m.config.Client(oauth2.NoContext, token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, fmt.Errorf("failed getting user info: %v", err)
	}
	defer resp.Body.Close()

	var user GoogleUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("failed decoding user info: %v", err)
	}

	return &user, nil
}

// AuthMiddleware creates a middleware that checks for valid authentication
func (m *Manager) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for WebSocket upgrade requests
		if r.Header.Get("Upgrade") == "websocket" {
			next.ServeHTTP(w, r)
			return
		}

		// Get token from cookie
		cookie, err := r.Cookie("auth_token")
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Verify token
		token := &oauth2.Token{
			AccessToken: cookie.Value,
		}

		// Get user info to verify token is valid
		_, err = m.GetUserInfo(token)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
