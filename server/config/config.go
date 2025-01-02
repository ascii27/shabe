package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	OpenAIApiKey  string
	Server        ServerConfig
	OAuth         OAuthConfig
}

type ServerConfig struct {
	Port int
	Host string
}

type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

// LoadConfig loads configuration from environment variables
func LoadConfig() (*Config, error) {
	config := &Config{}

	// Required variables
	config.OpenAIApiKey = os.Getenv("OPENAI_API_KEY")
	if config.OpenAIApiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY environment variable is required")
	}

	config.OAuth.ClientID = os.Getenv("GOOGLE_CLIENT_ID")
	if config.OAuth.ClientID == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID environment variable is required")
	}

	config.OAuth.ClientSecret = os.Getenv("GOOGLE_CLIENT_SECRET")
	if config.OAuth.ClientSecret == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_SECRET environment variable is required")
	}

	config.OAuth.RedirectURL = os.Getenv("OAUTH_REDIRECT_URL")
	if config.OAuth.RedirectURL == "" {
		return nil, fmt.Errorf("OAUTH_REDIRECT_URL environment variable is required")
	}

	// Optional variables with defaults
	config.Server.Host = os.Getenv("HOST")
	if config.Server.Host == "" {
		config.Server.Host = "localhost"
	}

	portStr := os.Getenv("PORT")
	if portStr == "" {
		config.Server.Port = 8080
	} else {
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return nil, fmt.Errorf("invalid PORT value: %v", err)
		}
		config.Server.Port = port
	}

	return config, nil
}
