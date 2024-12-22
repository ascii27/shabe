class TranslationChat {
    constructor() {
        this.ws = null;
        this.recognition = null;
        this.isRecording = false;
        
        // DOM elements
        this.startButton = document.getElementById('start-button');
        this.stopButton = document.getElementById('stop-button');
        this.language = document.getElementById('language');
        this.chatContainer = document.getElementById('chat-container');
        this.statusDiv = document.getElementById('status');
        this.recordingStatus = document.getElementById('recording-status');

        this.setupWebSocket();
        this.setupSpeechRecognition();
        this.setupEventListeners();
    }

    setupWebSocket() {
        this.ws = new WebSocket('ws://localhost:8080/ws');
        
        this.ws.onopen = () => {
            this.statusDiv.textContent = 'Connected';
            this.sendPreferences();
        };

        this.ws.onclose = () => {
            this.statusDiv.textContent = 'Disconnected';
            // Attempt to reconnect after 2 seconds
            setTimeout(() => this.setupWebSocket(), 2000);
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.displayMessage(message.text, false);
        };
    }

    setupSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            alert('Speech recognition is not supported in this browser. Please use Chrome.');
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        // Map language codes for speech recognition
        const speechLangMap = {
            'en': 'en-US',
            'ja': 'ja-JP',
            'es': 'es-ES',
            'fr': 'fr-FR'
        };

        this.recognition.onresult = (event) => {
            let final_transcript = '';
            let interim_transcript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript = event.results[i][0].transcript;
                    if (final_transcript.trim()) {
                        this.sendMessage(final_transcript.trim());
                    }
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }

            if (interim_transcript) {
                this.recordingStatus.textContent = `Recording: ${interim_transcript}`;
            }
        };

        this.recognition.onend = () => {
            if (this.isRecording) {
                this.recognition.start();
            }
        };
    }

    setupEventListeners() {
        this.startButton.addEventListener('click', () => this.startRecording());
        this.stopButton.addEventListener('click', () => this.stopRecording());
        
        this.language.addEventListener('change', () => {
            this.recognition.lang = this.getSpeechLangCode(this.language.value);
            this.sendPreferences();
        });
    }

    getSpeechLangCode(lang) {
        const speechLangMap = {
            'en': 'en-US',
            'ja': 'ja-JP',
            'es': 'es-ES',
            'fr': 'fr-FR'
        };
        return speechLangMap[lang] || 'en-US';
    }

    startRecording() {
        this.isRecording = true;
        this.recognition.lang = this.getSpeechLangCode(this.language.value);
        this.recognition.start();
        this.startButton.disabled = true;
        this.stopButton.disabled = false;
        this.recordingStatus.textContent = 'Recording...';
    }

    stopRecording() {
        this.isRecording = false;
        this.recognition.stop();
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.recordingStatus.textContent = '';
    }

    sendMessage(text) {
        if (this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'message',
                text: text,
                language: this.language.value
            };
            this.ws.send(JSON.stringify(message));
            this.displayMessage(text, true);
        }
    }

    sendPreferences() {
        if (this.ws.readyState === WebSocket.OPEN) {
            const prefs = {
                type: 'preferences',
                language: this.language.value
            };
            this.ws.send(JSON.stringify(prefs));
        }
    }

    displayMessage(text, isSent) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.textContent = text;
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
}

// Initialize the chat application
document.addEventListener('DOMContentLoaded', () => {
    new TranslationChat();
});
