package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"golang.org/x/oauth2"
)

func TestNewManager(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	assert.NotNil(t, manager)
	assert.NotNil(t, manager.config)
	assert.Equal(t, "test-client-id", manager.config.ClientID)
	assert.Equal(t, "test-client-secret", manager.config.ClientSecret)
	assert.Equal(t, "http://localhost:8080/auth/callback", manager.config.RedirectURL)
}

func TestGetAuthURL(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	url := manager.GetAuthURL()
	assert.Contains(t, url, "https://accounts.google.com/o/oauth2/auth")
	assert.Contains(t, url, "client_id=test-client-id")
	assert.Contains(t, url, "redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Fcallback")
}

type mockTransport struct{}

func (m *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Mock user info response
	user := UserInfo{
		ID:            "123",
		Email:         "test@example.com",
		EmailVerified: true,
		Name:          "Test User",
		Picture:       "https://example.com/picture.jpg",
	}

	// Create a mock response
	resp := httptest.NewRecorder()
	json.NewEncoder(resp).Encode(user)

	return resp.Result(), nil
}

func TestGetUserInfo(t *testing.T) {
	// Create a test client with mock transport
	client := &http.Client{Transport: &mockTransport{}}

	// Create a mock OAuth2 config
	cfg := &Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	}

	manager := NewManager(cfg)
	manager.config = &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
		},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://accounts.google.com/o/oauth2/auth",
			TokenURL: "https://oauth2.googleapis.com/token",
		},
	}

	// Create a test token
	token := &oauth2.Token{
		AccessToken: "mock-token",
		TokenType:   "Bearer",
	}

	// Replace the HTTP client
	oldClient := http.DefaultClient
	http.DefaultClient = client
	defer func() { http.DefaultClient = oldClient }()

	user, err := manager.GetUserInfo(token.AccessToken)

	assert.NoError(t, err)
	assert.NotNil(t, user)
	assert.Equal(t, "123", user.ID)
	assert.Equal(t, "test@example.com", user.Email)
	assert.Equal(t, "Test User", user.Name)
}

func TestAuthMiddleware(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	// Test without token
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()

	handler := manager.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status code %d, got %d", http.StatusUnauthorized, w.Code)
	}

	// Test with invalid token
	req = httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w = httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status code %d, got %d", http.StatusUnauthorized, w.Code)
	}

	// Test with valid token
	req = httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer mock-token")
	w = httptest.NewRecorder()

	// Mock getUserInfoFunc
	originalGetUserInfo := manager.getUserInfoFunc
	defer func() { manager.getUserInfoFunc = originalGetUserInfo }()
	manager.getUserInfoFunc = func(token string) (*UserInfo, error) {
		if token != "mock-token" {
			t.Errorf("Expected token 'mock-token', got '%s'", token)
		}
		return &UserInfo{
			ID:    "123",
			Email: "test@example.com",
		}, nil
	}

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status code %d, got %d", http.StatusOK, w.Code)
	}
}

func TestManager_HandleAuthVerify(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	// Test without token
	req := httptest.NewRequest("GET", "/auth/verify", nil)
	w := httptest.NewRecorder()

	manager.HandleAuthVerify(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status code %d, got %d", http.StatusUnauthorized, w.Code)
	}

	// Test with invalid token
	req = httptest.NewRequest("GET", "/auth/verify", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w = httptest.NewRecorder()

	manager.HandleAuthVerify(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status code %d, got %d", http.StatusUnauthorized, w.Code)
	}

	// Test with valid token
	req = httptest.NewRequest("GET", "/auth/verify", nil)
	req.Header.Set("Authorization", "Bearer mock-token")
	w = httptest.NewRecorder()

	// Mock getUserInfoFunc
	originalGetUserInfo := manager.getUserInfoFunc
	defer func() { manager.getUserInfoFunc = originalGetUserInfo }()
	manager.getUserInfoFunc = func(token string) (*UserInfo, error) {
		if token != "mock-token" {
			t.Errorf("Expected token 'mock-token', got '%s'", token)
		}
		return &UserInfo{
			ID:    "123",
			Email: "test@example.com",
		}, nil
	}

	manager.HandleAuthVerify(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status code %d, got %d", http.StatusOK, w.Code)
	}

	var response UserInfo
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.ID != "123" || response.Email != "test@example.com" {
		t.Errorf("Unexpected response: %+v", response)
	}
}

func TestManager_HandleAuthURL(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	req := httptest.NewRequest("GET", "/auth/login", nil)
	w := httptest.NewRecorder()

	manager.HandleAuthURL(w, req)

	if w.Code != http.StatusTemporaryRedirect {
		t.Errorf("Expected status code %d, got %d", http.StatusTemporaryRedirect, w.Code)
	}

	location := w.Header().Get("Location")
	if location == "" {
		t.Error("Expected Location header in response, got empty string")
	}

	if !strings.Contains(location, "accounts.google.com") {
		t.Errorf("Expected redirect URL to contain accounts.google.com, got %s", location)
	}
}

func TestManager_GetUserInfo(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	token := &oauth2.Token{
		AccessToken: "test-token",
	}

	// Test with invalid token
	_, err := manager.GetUserInfo(token.AccessToken)
	if err == nil {
		t.Error("Expected error with invalid token, got nil")
	}
}

func TestManager_HandleAuthCallback(t *testing.T) {
	manager := NewManager(&Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://localhost:8080/auth/callback",
	})

	// Test without code
	req := httptest.NewRequest("GET", "/auth/callback", nil)
	w := httptest.NewRecorder()

	manager.HandleAuthCallback(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status code %d, got %d", http.StatusBadRequest, w.Code)
	}

	// Test with invalid code
	req = httptest.NewRequest("GET", "/auth/callback?code=invalid-code", nil)
	w = httptest.NewRecorder()

	manager.HandleAuthCallback(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status code %d, got %d", http.StatusInternalServerError, w.Code)
	}

	// Test successful case with mock exchange
	originalExchange := manager.Exchange
	defer func() { manager.Exchange = originalExchange }()

	manager.Exchange = func(code string) (string, error) {
		return "mock-token", nil
	}

	req = httptest.NewRequest("GET", "/auth/callback?code=valid-code", nil)
	w = httptest.NewRecorder()

	manager.HandleAuthCallback(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status code %d, got %d", http.StatusOK, w.Code)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "text/html" {
		t.Errorf("Expected Content-Type %s, got %s", "text/html", contentType)
	}

	body := w.Body.String()
	expectedContents := []string{
		"Authentication Successful",
		"type: 'auth_success'",
		"mock-token",
		"window.close()",
	}

	for _, expected := range expectedContents {
		if !strings.Contains(body, expected) {
			t.Errorf("Expected response to contain %q", expected)
		}
	}
}
