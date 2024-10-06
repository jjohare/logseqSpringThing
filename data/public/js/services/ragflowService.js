// public/js/services/ragflowService.js

export class RAGflowService {
  constructor(websocketService) {
    this.websocketService = websocketService;
    this.setupWebSocketListeners();
    this.isConnected = false;
    this.audio = new Audio();
  }

  setupWebSocketListeners() {
    this.websocketService.on('open', () => {
      console.log('WebSocket connection established');
      this.isConnected = true;
      // Notify that the chat is ready
      const event = new CustomEvent('chatReady');
      window.dispatchEvent(event);
    });

    this.websocketService.on('close', () => {
      console.log('WebSocket connection closed');
      this.isConnected = false;
    });

    this.websocketService.on('message', (data) => {
      console.log('Received message:', data);
      if (data.type === 'ragflowResponse') {
        this.handleRAGFlowResponse(data);
      } else if (data.type === 'chatHistoryResponse') {
        this.handleChatHistoryResponse(data);
      } else if (data.type === 'error') {
        this.handleError(data);
      } else {
        console.warn('Unhandled message type:', data.type);
      }
    });
  }

  checkConnection() {
    if (!this.isConnected) {
      console.error('WebSocket is not connected');
      return false;
    }
    return true;
  }

  sendQuery(query, quote = false, docIds = null, stream = false) {
    if (!this.checkConnection()) return;

    console.log('Sending query:', query);
    this.websocketService.send({
      type: 'ragflowQuery',
      message: query,
      quote: quote,
      docIds: docIds,
      stream: stream
    });
  }

  handleRAGFlowResponse(data) {
    console.log('Received RAGFlow response:', data);
    if (data.text && data.audio_path) {
      const answer = data.text;
      const audioPath = data.audio_path;

      const event = new CustomEvent('ragflowAnswer', { 
        detail: {
          messages: [{role: 'assistant', content: answer}],
          reference: data.reference || []
        }
      });
      window.dispatchEvent(event);

      // Play the audio
      this.playAudio(audioPath);
    } else {
      console.error('Unexpected RAGFlow response format:', data);
      this.handleError({ message: 'Unexpected response format from server' });
    }
  }

  playAudio(audioPath) {
    this.audio.src = audioPath;
    this.audio.play().catch(error => {
      console.error('Error playing audio:', error);
    });
  }

  getChatHistory() {
    if (!this.checkConnection()) return;

    console.log('Requesting chat history');
    this.websocketService.send({
      type: 'chatHistory'
    });
  }

  handleChatHistoryResponse(data) {
    console.log('Received chat history:', data);
    if (data.messages && Array.isArray(data.messages)) {
      const event = new CustomEvent('chatHistoryReceived', { 
        detail: {
          messages: data.messages
        }
      });
      window.dispatchEvent(event);
    } else {
      console.error('Unexpected chat history format:', data);
      this.handleError({ message: 'Unexpected chat history format from server' });
    }
  }

  handleError(data) {
    console.error('RAGFlow error:', data.message || 'Unknown error');
    const event = new CustomEvent('ragflowError', { detail: data.message || 'Unknown error' });
    window.dispatchEvent(event);
  }
}
