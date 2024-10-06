// public/js/components/chatManager.js

export class ChatManager {
  constructor(ragflowService) {
    this.ragflowService = ragflowService;
    this.chatInput = null;
    this.sendButton = null;
    this.chatMessages = null;
    this.isChatReady = false;
  }

  initialize() {
    this.chatInput = document.getElementById('chat-input');
    this.sendButton = document.getElementById('send-button');
    this.chatMessages = document.getElementById('chat-messages');

    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.chatInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        this.sendMessage();
      }
    });

    window.addEventListener('chatReady', () => this.handleChatReady());
    window.addEventListener('ragflowAnswer', (event) => this.handleRagflowAnswer(event.detail));
    window.addEventListener('chatHistoryReceived', (event) => this.handleChatHistory(event.detail));
    window.addEventListener('ragflowError', (event) => this.handleError(event.detail));
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
      this.ragflowService.sendQuery(message);
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
    if (data.messages && data.messages.length > 0) {
      this.displayMessage('AI', data.messages[0].content);
    }
    
    // Audio playback is handled by the RAGflowService
    
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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

  handleError(error) {
    console.error('RAGFlow error:', error);
    this.displayMessage('System', `Error: ${error}`);
  }
}
