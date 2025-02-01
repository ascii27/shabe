package auth

import (
	"context"
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
	config          *oauth2.Config
	Exchange        func(code string) (string, error)
	getUserInfoFunc func(token string) (*UserInfo, error) // private field for mocking
}

// NewManager creates a new auth manager
func NewManager(cfg *Config) *Manager {
	m := &Manager{
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

	// Set up the default Exchange function
	m.Exchange = func(code string) (string, error) {
		token, err := m.config.Exchange(context.Background(), code)
		if err != nil {
			return "", fmt.Errorf("failed to exchange code: %w", err)
		}
		return token.AccessToken, nil
	}

	// Set up the default getUserInfoFunc
	m.getUserInfoFunc = m.defaultGetUserInfo

	return m
}

// defaultGetUserInfo is the default implementation of getting user info
func (m *Manager) defaultGetUserInfo(token string) (*UserInfo, error) {
	client := m.config.Client(context.Background(), &oauth2.Token{
		AccessToken: token,
	})

	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, fmt.Errorf("failed to get user info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get user info: %v", resp.Status)
	}

	var userInfo UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, fmt.Errorf("failed to decode user info: %w", err)
	}

	log.Printf("Got user info: %+v (for token %s)", userInfo, token)
	return &userInfo, nil
}

// GetUserInfo retrieves user information using the access token
func (m *Manager) GetUserInfo(token string) (*UserInfo, error) {
	return m.getUserInfoFunc(token)
}

// GetAuthURL returns the URL for OAuth2 authentication
func (m *Manager) GetAuthURL() string {
	return m.config.AuthCodeURL("state")
}

// getTokenFromHeader extracts the token from the Authorization header
func getTokenFromHeader(header string) string {
	if header == "" {
		return ""
	}
	// Check if the header starts with "Bearer "
	const prefix = "Bearer "
	if len(header) < len(prefix) || header[:len(prefix)] != prefix {
		return header // Return as is if it doesn't have the prefix
	}
	return header[len(prefix):] // Return everything after "Bearer "
}

// HandleAuthURL handles the /auth/login endpoint
func (m *Manager) HandleAuthURL(w http.ResponseWriter, r *http.Request) {
	url := m.GetAuthURL()
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
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

	// Return HTML that posts a message to the opener and auto-closes
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprintf(w, `
<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #28a745;
            margin-bottom: 1rem;
        }
        p {
            color: #6c757d;
            margin-bottom: 0.5rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Authentication Successful</h1>
        <p>You can close this window now.</p>
        <p>Closing automatically in 2 seconds...</p>
    </div>
    <script>
        // Post message to opener
        if (window.opener) {
            window.opener.postMessage({
                type: 'auth_success',
                token: %q
            }, '*');
        }

        // Close window after 2 seconds
        setTimeout(() => {
            window.close();
        }, 2000);
    </script>
</body>
</html>
`, token)
}

// HandleAuthVerify verifies the auth token and returns user info
func (m *Manager) HandleAuthVerify(w http.ResponseWriter, r *http.Request) {
	token := getTokenFromHeader(r.Header.Get("Authorization"))
	if token == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userInfo, err := m.GetUserInfo(token)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": true,
		"user":          userInfo,
	})
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
		authHeader := r.Header.Get("Authorization")
		token := getTokenFromHeader(authHeader)
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
