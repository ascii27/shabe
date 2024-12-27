package config

import (
	"fmt"
	"gopkg.in/yaml.v2"
	"os"
)

type Config struct {
	OpenAIApiKey string `yaml:"openai_api_key"`
	Server       struct {
		Port int    `yaml:"port"`
		Host string `yaml:"host"`
	} `yaml:"server"`
	OAuth struct {
		ClientID     string `yaml:"client_id"`
		ClientSecret string `yaml:"client_secret"`
		RedirectURL  string `yaml:"redirect_url"`
	} `yaml:"oauth"`
}

func LoadConfig(configPath string) (*Config, error) {
	// If configPath is empty, try to find config.yaml in the current directory
	if configPath == "" {
		configPath = "config.yaml"
	}

	file, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("error reading config file: %v", err)
	}

	var config Config
	err = yaml.Unmarshal(file, &config)
	if err != nil {
		return nil, fmt.Errorf("error parsing config file: %v", err)
	}

	// Override with environment variable if present
	if envKey := os.Getenv("OPENAI_API_KEY"); envKey != "" {
		config.OpenAIApiKey = envKey
	}

	return &config, nil
}
