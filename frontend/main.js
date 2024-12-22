let ws = null;
let currentRoom = null;
let recognition = null;
let isRecording = false;

// Initialize DOM elements after the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, setting up event listeners...');
    setupEventListeners();
    setupSpeechRecognition();
});

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Join room button
    const joinButton = document.getElementById('join-room-button');
    console.log('Join button:', joinButton);
    joinButton.addEventListener('click', joinRoom);

    // Message input
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Language change handler
    document.getElementById('language').addEventListener('change', () => {
        if (recognition) {
            recognition.lang = getSpeechLangCode(document.getElementById('language').value);
        }
        sendPreferences();
    });

    // Speech recognition buttons
    document.getElementById('start-button').addEventListener('click', startRecording);
    document.getElementById('stop-button').addEventListener('click', stopRecording);
}

function joinRoom() {
    console.log('Join room clicked');
    const roomId = document.getElementById('roomInput').value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }

    if (ws) {
        ws.close();
    }

    currentRoom = roomId;
    connectWebSocket();
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('status').textContent = 'Connecting...';
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?roomId=${currentRoom}`;
    console.log('Connecting to:', wsUrl);
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to WebSocket');
        document.getElementById('status').textContent = `Connected to room: ${currentRoom}`;
        sendPreferences();
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket');
        document.getElementById('status').textContent = 'Disconnected';
        // Try to reconnect after 2 seconds
        setTimeout(() => {
            if (currentRoom) {
                connectWebSocket();
            }
        }, 2000);
    };

    ws.onmessage = (event) => {
        console.log('Received message:', event.data);
        const message = JSON.parse(event.data);
        if (message.type === 'message') {
            displayMessage(message.text, false);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('status').textContent = 'Error: ' + error;
    };
}

function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert('Speech recognition is not supported in this browser. Please use Chrome.');
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechLangCode(document.getElementById('language').value);

    recognition.onresult = (event) => {
        let final_transcript = '';
        let interim_transcript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final_transcript = event.results[i][0].transcript;
                if (final_transcript.trim()) {
                    sendMessage(final_transcript.trim());
                }
            } else {
                interim_transcript += event.results[i][0].transcript;
            }
        }

        if (interim_transcript) {
            document.getElementById('recording-status').textContent = `Recording: ${interim_transcript}`;
        }
    };

    recognition.onend = () => {
        if (isRecording) {
            recognition.start();
        }
    };
}

function startRecording() {
    if (!recognition) {
        setupSpeechRecognition();
    }
    isRecording = true;
    recognition.lang = getSpeechLangCode(document.getElementById('language').value);
    recognition.start();
    document.getElementById('start-button').disabled = true;
    document.getElementById('stop-button').disabled = false;
    document.getElementById('recording-status').textContent = 'Recording...';
}

function stopRecording() {
    isRecording = false;
    if (recognition) {
        recognition.stop();
    }
    document.getElementById('start-button').disabled = false;
    document.getElementById('stop-button').disabled = true;
    document.getElementById('recording-status').textContent = '';
}

function getSpeechLangCode(lang) {
    const speechLangMap = {
        'en': 'en-US',
        'ja': 'ja-JP',
        'es': 'es-ES',
        'fr': 'fr-FR'
    };
    return speechLangMap[lang] || 'en-US';
}

function sendMessage(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to a room');
        return;
    }

    const content = text || document.getElementById('messageInput').value.trim();
    
    if (content) {
        const message = {
            type: 'message',
            roomId: currentRoom,
            text: content,
            language: document.getElementById('language').value
        };
        
        ws.send(JSON.stringify(message));
        displayMessage(content, true);
        
        // Only clear the input if we're sending from the input field
        if (!text) {
            document.getElementById('messageInput').value = '';
        }
    }
}

function sendPreferences() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const prefs = {
            type: 'preferences',
            language: document.getElementById('language').value
        };
        ws.send(JSON.stringify(prefs));
    }
}

function displayMessage(text, isOwn = false) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);
    
    // Scroll to the bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
