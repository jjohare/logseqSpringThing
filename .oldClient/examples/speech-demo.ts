import { getSpeechWebSocketService, SpeechConnectionStatus } from '../services/SpeechWebSocketService';
import { getAudioPlayer } from '../audio/AudioPlayer';

/**
 * This is a simple demo of the speech service integration with RAGFlow
 * It demonstrates two approaches:
 * 1. Using direct WebSocket communication with the speech service
 * 2. Using the RAGFlow API with TTS enabled
 */

// Initialize the audio player
const audioPlayer = getAudioPlayer();

// First, ensure audio context is active (requires user interaction)
function initializeAudio() {
  audioPlayer.resume().catch(console.error);
  console.log('Audio player initialized', audioPlayer.getState());
}

// Get the speech WebSocket service
const speechService = getSpeechWebSocketService({
  onStatusChange: (status) => {
    console.log('Speech service status changed:', status);
    
    if (status === SpeechConnectionStatus.CONNECTED) {
      console.log('Speech service connected, ready to use!');
    }
  }
});

// Connect to the speech service
function connectSpeechService() {
  speechService.connect();
}

// Send a direct TTS request through the WebSocket
function sendDirectTTS(text: string) {
  if (!speechService.isConnected()) {
    console.error('Speech service not connected');
    return;
  }
  
  console.log('Sending direct TTS request:', text);
  speechService.sendTTS(text);
}

// Use RAGFlow with TTS enabled
async function sendRagflowWithTTS(question: string) {
  const response = await fetch('/api/ragflow/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      enable_tts: true,
      stream: true
    }),
  });

  console.log('RAGFlow request sent with TTS enabled');
  
  if (!response.ok) {
    throw new Error(`RAGFlow request failed: ${response.statusText}`);
  }
  
  // If streaming response, handle the stream
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body!.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Process the chunk (text response)
      const text = new TextDecoder().decode(value);
      console.log('Received text chunk:', text);
      
      // Note: Audio will come through the speech WebSocket separately
    }
  } else {
    // Handle non-streaming response
    const data = await response.json();
    console.log('Received complete response:', data);
  }
}

// Usage example (to be called after user interaction):
// 1. Initialize audio (requires user interaction)
// document.getElementById('initButton')?.addEventListener('click', () => {
//   initializeAudio();
// });
//
// 2. Connect to speech service
// document.getElementById('connectButton')?.addEventListener('click', () => {
//   connectSpeechService();
// });
//
// 3. Send a direct TTS request
// document.getElementById('directTtsButton')?.addEventListener('click', () => {
//   sendDirectTTS('This is a test of the direct TTS service.');
// });
//
// 4. Send a RAGFlow request with TTS enabled
// document.getElementById('ragflowTtsButton')?.addEventListener('click', () => {
//   sendRagflowWithTTS('Tell me about the features of this graph visualization system.');
// });

export {
  initializeAudio,
  connectSpeechService,
  sendDirectTTS,
  sendRagflowWithTTS
};