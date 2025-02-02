package translate

import (
	"context"
	"fmt"

	"github.com/sashabaranov/go-openai"
)

// Translator defines the interface for translation services
type Translator interface {
	Translate(text, fromLang, toLang string) (string, error)
}

// OpenAITranslator implements the Translator interface using OpenAI's API
type OpenAITranslator struct {
	client *openai.Client
}

// NewOpenAITranslator creates a new OpenAITranslator
func NewOpenAITranslator(apiKey string) *OpenAITranslator {
	return &OpenAITranslator{
		client: openai.NewClient(apiKey),
	}
}

// Translate translates text from one language to another using OpenAI's API
func (t *OpenAITranslator) Translate(text, fromLang, toLang string) (string, error) {
	if fromLang == toLang {
		return text, nil
	}

	prompt := fmt.Sprintf("Translate the following text from %s to %s:\n\n%s", fromLang, toLang, text)
	resp, err := t.client.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: openai.GPT4oMini20240718,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
			MaxTokens:   1000,
			Temperature: 0.7,
		},
	)

	if err != nil {
		return "", fmt.Errorf("error calling OpenAI API: %v", err)
	}

	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no translation received from OpenAI")
	}

	return resp.Choices[0].Message.Content, nil
}

// MockTranslator implements the Translator interface for testing
type MockTranslator struct {
	translations map[string]string
}

// NewMockTranslator creates a new MockTranslator with predefined translations
func NewMockTranslator() *MockTranslator {
	return &MockTranslator{
		translations: map[string]string{
			"en->ja:hello":       "こんにちは",
			"ja->en:こんにちは":       "hello",
			"en->ja:how are you": "お元気ですか？",
			"ja->en:お元気ですか？":     "how are you",
		},
	}
}

// Translate returns predefined translations for testing
func (t *MockTranslator) Translate(text, fromLang, toLang string) (string, error) {
	if fromLang == toLang {
		return text, nil
	}

	key := fromLang + "->" + toLang + ":" + text
	if translation, ok := t.translations[key]; ok {
		return translation, nil
	}

	return text, nil // Return original text if no translation found
}
