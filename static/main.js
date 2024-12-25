let ws = null;
let recognition = null;
let isTranslating = false;
let userName = 'Anonymous';
let selectedLanguage = 'en';
let currentRoomId = '';

// Function to get user name from Chrome identity API
async function getUserNameFromChrome() {
    try {
        const identity = await chrome.identity?.getProfileUserInfo();
        if (identity?.email) {
            return identity.email.split('@')[0];
        }
    } catch (error) {
        console.log('Could not get Chrome identity:', error);
    }
    return null;
}

// Function to generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

// Function to join a room
function joinRoom(roomId) {
    if (ws) {
        ws.close();
    }

    currentRoomId = roomId;
    document.getElementById('current-room-id').textContent = roomId;
    document.getElementById('join-room').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?roomId=${roomId}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        document.getElementById('status').textContent = 'Connected';
        
        // Send initial preferences
        ws.send(JSON.stringify({
            type: 'preferences',
            language: selectedLanguage,
            name: userName
        }));
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        document.getElementById('status').textContent = 'Disconnected';
        setTimeout(() => connectToWebSocket(roomId), 2000);
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'message') {
            displayMessage(message.text, false, message.name);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('status').textContent = 'Connection error';
    };
}

// Function to leave the current room
function leaveRoom() {
    if (ws) {
        ws.close();
    }
    currentRoomId = '';
    document.getElementById('messages').innerHTML = '';
    document.getElementById('join-room').style.display = 'block';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('status').textContent = 'Enter a room ID to begin';
}

// Initialize the UI
async function initializeUI() {
    // Try to get name from Chrome
    const chromeName = await getUserNameFromChrome();
    if (chromeName) {
        userName = chromeName;
        document.getElementById('user-name').value = userName;
    }

    // Load saved preferences
    const savedName = localStorage.getItem('userName');
    const savedLanguage = localStorage.getItem('language');
    
    if (savedName) {
        userName = savedName;
        document.getElementById('user-name').value = userName;
    }
    
    if (savedLanguage) {
        selectedLanguage = savedLanguage;
        document.getElementById('language-select').value = selectedLanguage;
    }

    // Add event listeners
    document.getElementById('user-name').addEventListener('change', (e) => {
        userName = e.target.value.trim() || 'Anonymous';
        localStorage.setItem('userName', userName);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'preferences',
                language: selectedLanguage,
                name: userName
            }));
        }
    });

    document.getElementById('language-select').addEventListener('change', (e) => {
        selectedLanguage = e.target.value;
        localStorage.setItem('language', selectedLanguage);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'preferences',
                language: selectedLanguage,
                name: userName
            }));
        }
        if (recognition) {
            recognition.lang = getSpeechLangCode(selectedLanguage);
            if (isTranslating) {
                stopTranslation();
                startTranslation();
            }
        }
    });

    // Room management
    document.getElementById('join-button').addEventListener('click', () => {
        const roomId = document.getElementById('room-id').value.trim() || generateRoomId();
        joinRoom(roomId);
    });

    document.getElementById('leave-room').addEventListener('click', leaveRoom);

    document.getElementById('copy-room-id').addEventListener('click', () => {
        navigator.clipboard.writeText(currentRoomId).then(() => {
            const button = document.getElementById('copy-room-id');
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = 'Copy Room ID';
            }, 2000);
        });
    });

    // Translation controls
    document.getElementById('start-translation').addEventListener('click', startTranslation);
    document.getElementById('stop-translation').addEventListener('click', stopTranslation);

    // Initialize speech recognition
    setupSpeechRecognition();
}

function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        console.error('Speech recognition not supported');
        const startButton = document.getElementById('start-translation');
        if (startButton) {
            startButton.disabled = true;
            startButton.title = 'Speech recognition not supported in this browser';
        }
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechLangCode(selectedLanguage);

    recognition.onstart = () => {
        console.log('Speech recognition started');
        document.getElementById('start-translation').disabled = true;
        document.getElementById('stop-translation').disabled = false;
        document.getElementById('status').textContent = 'Listening...';
    };

    recognition.onend = () => {
        console.log('Speech recognition ended');
        document.getElementById('start-translation').disabled = false;
        document.getElementById('stop-translation').disabled = true;
        if (ws) {
            document.getElementById('status').textContent = 'Connected';
        }
        
        // Restart if we're still translating
        if (isTranslating) {
            recognition.start();
        }
    };

    recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text && ws) {
                sendMessage(text);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isTranslating = false;
        document.getElementById('start-translation').disabled = false;
        document.getElementById('stop-translation').disabled = true;
        document.getElementById('status').textContent = 'Error: ' + event.error;
    };
}

function startTranslation() {
    if (!recognition || !ws) return;
    
    isTranslating = true;
    try {
        recognition.start();
    } catch (error) {
        console.error('Failed to start translation:', error);
    }
}

function stopTranslation() {
    if (!recognition) return;
    
    isTranslating = false;
    try {
        recognition.stop();
    } catch (error) {
        console.error('Failed to stop translation:', error);
    }
}

function getSpeechLangCode(lang) {
    const langMap = {
        'en': 'en-US',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'zh': 'zh-CN',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'de': 'de-DE'
    };
    return langMap[lang] || 'en-US';
}

function displayMessage(text, isOwn = false, senderName = '') {
    const messages = document.getElementById('messages');
    if (!messages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'message-name';
    nameSpan.textContent = senderName || (isOwn ? userName : 'Anonymous');
    
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = text;
    
    messageDiv.appendChild(nameSpan);
    messageDiv.appendChild(textSpan);
    
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
    
    // Remove old messages if there are too many
    while (messages.children.length > 50) {
        messages.removeChild(messages.firstChild);
    }
}

function sendMessage(text) {
    if (!ws || !text.trim()) return;
    
    const message = {
        type: 'message',
        text: text,
        language: selectedLanguage,
        name: userName
    };
    
    ws.send(JSON.stringify(message));
    displayMessage(text, true, userName);
}

// Initialize when the page is ready
document.addEventListener('DOMContentLoaded', initializeUI);
