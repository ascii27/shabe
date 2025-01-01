package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"golang.org/x/oauth2"
)

// LoginHandler handles the OAuth2 login
func (m *Manager) LoginHandler(w http.ResponseWriter, r *http.Request) {
	url := m.config.AuthCodeURL("state")
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// CallbackHandler handles the OAuth2 callback
func (m *Manager) CallbackHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Code not found", http.StatusBadRequest)
		return
	}

	token, err := m.config.Exchange(r.Context(), code)
	if err != nil {
		log.Printf("Token exchange error: %v", err)
		http.Error(w, "Failed to exchange token", http.StatusInternalServerError)
		return
	}

	// Return HTML that passes token back to opener
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprintf(w, `
		<html>
		<body>
			<h2>Login successful!</h2>
			<p>You can close this window and return to Google Meet.</p>
			<script>
				if (window.opener) {
					window.opener.postMessage({
						type: 'auth_success',
						token: '%s'
					}, '*');
					setTimeout(function() {
						window.close();
					}, 1000);
				}
			</script>
		</body>
		</html>
	`, token.AccessToken)
}

// LogoutHandler handles user logout
func (m *Manager) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": false,
	})
}

// GetTokenFromRequest extracts the token from Authorization header
func (m *Manager) GetTokenFromRequest(r *http.Request) string {
    authHeader := r.Header.Get("Authorization")
    if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
        return authHeader[7:]
    }
    return ""
}

// UserInfoHandler returns the user's info
func (m *Manager) UserInfoHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	token := m.GetTokenFromRequest(r)
	if token == "" {
		response := struct {
			Authenticated bool   `json:"authenticated"`
			Error        string `json:"error"`
		}{
			Authenticated: false,
			Error:        "Not authenticated",
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Verify the token
	userInfo, err := m.GetUserInfo(&oauth2.Token{
		AccessToken: token,
	})
	if err != nil {
		response := struct {
			Authenticated bool   `json:"authenticated"`
			Error        string `json:"error"`
		}{
			Authenticated: false,
			Error:        "Failed to get user info",
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	response := struct {
		Authenticated bool        `json:"authenticated"`
		User         interface{} `json:"user"`
	}{
		Authenticated: true,
		User:         userInfo,
	}
	json.NewEncoder(w).Encode(response)
}
