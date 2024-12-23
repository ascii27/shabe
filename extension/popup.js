let ws = null;
let currentRoom = null;
let recognition = null;
let isRecording = false;

// Initialize DOM elements after the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupSpeechRecognition();
    
    // Load last used room and language from storage
    chrome.storage.sync.get(['roomId', 'language'], (result) => {
        if (result.roomId) {
            document.getElementById('roomInput').value = result.roomId;
        }
        if (result.language) {
            document.getElementById('language').value = result.language;
        }
    });
});

function setupEventListeners() {
    // Join room button
    document.getElementById('join-room-button').addEventListener('click', joinRoom);

    // Message input
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Send button
    document.getElementById('send-button').addEventListener('click', () => sendMessage());

    // Language change handler
    document.getElementById('language').addEventListener('change', () => {
        const language = document.getElementById('language').value;
        if (recognition) {
            recognition.lang = getSpeechLangCode(language);
        }
        sendPreferences();
        
        // Save language preference
        chrome.storage.sync.set({ language });
    });

    // Speech recognition buttons
    document.getElementById('start-button').addEventListener('click', () => {
        chrome.permissions.request({
            permissions: ['audioCapture']
        }, (granted) => {
            if (granted) {
                startRecording();
            } else {
                document.getElementById('status').textContent = 'Microphone permission denied';
            }
        });
    });
    
    document.getElementById('stop-button').addEventListener('click', stopRecording);
}

function joinRoom() {
    const roomId = document.getElementById('roomInput').value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }

    // Save room ID
    chrome.storage.sync.set({ roomId });

    if (ws) {
        ws.close();
    }

    currentRoom = roomId;
    connectWebSocket();
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('status').textContent = 'Connecting...';
}

function connectWebSocket() {
    const wsUrl = `ws://localhost:8080/ws?roomId=${currentRoom}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        document.getElementById('status').textContent = `Connected to room: ${currentRoom}`;
        sendPreferences();
    };

    ws.onclose = () => {
        document.getElementById('status').textContent = 'Disconnected';
        setTimeout(() => {
            if (currentRoom) {
                connectWebSocket();
            }
        }, 2000);
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'message') {
            displayMessage(message.text, false);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('status').textContent = 'Connection error';
    };
}

function setupSpeechRecognition() {
    try {
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new window.SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = getSpeechLangCode(document.getElementById('language').value);

        recognition.onstart = () => {
            document.getElementById('status').textContent = 'Listening...';
            document.getElementById('start-button').disabled = true;
            document.getElementById('stop-button').disabled = false;
        };

        recognition.onend = () => {
            if (isRecording) {
                recognition.start();
            } else {
                document.getElementById('status').textContent = 'Stopped listening';
                document.getElementById('start-button').disabled = false;
                document.getElementById('stop-button').disabled = true;
            }
        };

        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            if (result.isFinal) {
                const text = result[0].transcript.trim();
                if (text) {
                    sendMessage(text);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            document.getElementById('status').textContent = `Error: ${event.error}`;
            stopRecording();
        };
    } catch (error) {
        console.error('Speech recognition not supported:', error);
        document.getElementById('start-button').disabled = true;
        document.getElementById('stop-button').disabled = true;
        document.getElementById('status').textContent = 'Speech recognition not supported';
    }
}

function startRecording() {
    if (!recognition) {
        document.getElementById('status').textContent = 'Speech recognition not available';
        return;
    }
    
    isRecording = true;
    try {
        recognition.start();
    } catch (error) {
        console.error('Failed to start recording:', error);
        document.getElementById('status').textContent = 'Failed to start recording';
        stopRecording();
    }
}

function stopRecording() {
    if (!recognition) return;
    
    isRecording = false;
    try {
        recognition.stop();
    } catch (error) {
        console.error('Failed to stop recording:', error);
    }
    document.getElementById('start-button').disabled = false;
    document.getElementById('stop-button').disabled = true;
    document.getElementById('status').textContent = 'Stopped listening';
}

function getSpeechLangCode(lang) {
    const langMap = {
        'en': 'en-US',
        'ja': 'ja-JP',
        'es': 'es-ES',
        'ko': 'ko-KR',
        'zh': 'zh-CN',
        'fr': 'fr-FR',
        'de': 'de-DE'
    };
    return langMap[lang] || 'en-US';
}

function sendMessage(text = null) {
    if (!ws) return;

    const messageText = text || document.getElementById('messageInput').value.trim();
    if (!messageText) return;

    const message = {
        type: 'message',
        text: messageText,
        roomId: currentRoom,
        language: document.getElementById('language').value
    };

    ws.send(JSON.stringify(message));
    displayMessage(messageText, true);

    if (!text) {
        document.getElementById('messageInput').value = '';
    }
}

function sendPreferences() {
    if (!ws) return;

    const message = {
        type: 'preferences',
        language: document.getElementById('language').value
    };

    ws.send(JSON.stringify(message));
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
