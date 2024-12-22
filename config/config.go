package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	OpenAIApiKey string `yaml:"openai_api_key"`
	Server       struct {
		Port int    `yaml:"port"`
		Host string `yaml:"host"`
	} `yaml:"server"`
}

func LoadConfig(configPath string) (*Config, error) {
	// If configPath is empty, try to find config.yaml in the current directory
	if configPath == "" {
		configPath = "config.yaml"
	}

	file, err := os.Open(configPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	config := &Config{}
	if err := yaml.NewDecoder(file).Decode(config); err != nil {
		return nil, err
	}

	// Override with environment variable if present
	if envKey := os.Getenv("OPENAI_API_KEY"); envKey != "" {
		config.OpenAIApiKey = envKey
	}

	return config, nil
}
