// public/js/components/chatManager.js

export class ChatManager {
  constructor(websocketService) {
    this.websocketService = websocketService;
    this.chatInput = null;
    this.sendButton = null;
    this.chatMessages = null;
    this.audioPlayer = null;
    this.isChatReady = false;
  }

  initialize() {
    this.chatInput = document.getElementById('chat-input');
    this.sendButton = document.getElementById('send-button');
    this.chatMessages = document.getElementById('chat-messages');
    this.audioPlayer = document.getElementById('audio-player');

    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.chatInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        this.sendMessage();
      }
    });

    this.websocketService.on('message', (data) => this.handleWebSocketMessage(data));
  }

  handleWebSocketMessage(data) {
    console.log("Received WebSocket message:", data);
    if (data.type === 'ragflowResponse') {
      this.handleRagflowAnswer(data);
    } else if (data.type === 'chatHistory') {
      this.handleChatHistory(data);
    } else if (data.type === 'chatReady') {
      this.handleChatReady();
    }
  }

  handleChatReady() {
    console.log("Chat is ready");
    this.isChatReady = true;
    this.displayMessage('System', "Chat is ready. You can start chatting now.");
  }

  sendMessage() {
    const message = this.chatInput.value.trim();
    if (message) {
      if (!this.isChatReady) {
        console.error("Chat is not ready yet. Please wait.");
        this.displayMessage('System', "Chat is not ready yet. Please wait.");
        return;
      }

      console.log('Sending message:', message);
      this.displayMessage('You', message);
      this.websocketService.send({
        type: 'ragflowQuery',
        message: message
      });
      this.chatInput.value = '';
    }
  }

  displayMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.style.marginBottom = '10px';
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    this.chatMessages.appendChild(messageElement);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  handleRagflowAnswer(data) {
    console.log("Received RAGFlow answer:", data);
    this.displayMessage('AI', data.text);
    
    if (data.audio_path) {
      this.playAudio(data.audio_path);
    }
    
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  playAudio(audioPath) {
    // Clear previous audio player content
    this.audioPlayer.innerHTML = '';

    const audioElement = document.createElement('audio');
    audioElement.src = audioPath;
    audioElement.controls = true;
    audioElement.style.width = '100%';
    
    this.audioPlayer.appendChild(audioElement);
    
    // Automatically play the audio
    audioElement.play().catch(e => console.error("Error playing audio:", e));
  }

  handleChatHistory(data) {
    console.log('Received chat history:', data);
    this.chatMessages.innerHTML = '';
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach(msg => {
        this.displayMessage(msg.role === 'user' ? 'You' : 'AI', msg.content);
      });
    } else {
      console.error("Unexpected chat history format:", data);
      this.displayMessage('System', "Failed to load chat history.");
    }
  }
}
