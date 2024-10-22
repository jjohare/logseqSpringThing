<template>
  <div class="chat-interface">
    <div class="chat-messages" ref="chatMessagesRef">
      <div v-for="(message, index) in chatMessages" :key="index" :class="['chat-message', message.sender === 'You' ? 'user' : 'ai']">
        <strong>{{ message.sender }}:</strong> {{ message.message }}
      </div>
    </div>
    <div class="chat-input-container">
      <input type="text" v-model="chatInput" @keyup.enter="sendMessage" placeholder="Type a message..." />
      <button @click="sendMessage">Send</button>
    </div>
    <div class="tts-toggle">
      <label>
        <input type="checkbox" v-model="useOpenAI" @change="toggleTTS" />
        Use OpenAI TTS
      </label>
    </div>
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'ChatManager',
    props: {
        websocketService: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            chatInput: '',
            chatMessages: [],
            useOpenAI: false,
            error: null
        };
    },
    methods: {
        async sendMessage() {
            if (this.chatInput.trim()) {
                try {
                    await this.websocketService.sendChatMessage({
                        message: this.chatInput,
                        useOpenAI: this.useOpenAI
                    });
                    this.chatMessages.push({ sender: 'You', message: this.chatInput });
                    this.chatInput = '';
                    this.error = null;
                } catch (error) {
                    console.error('Error sending message:', error);
                    this.error = 'Failed to send message. Please try again.';
                }
            }
        },
        async toggleTTS() {
            try {
                await this.websocketService.toggleTTS(this.useOpenAI);
                console.log(`TTS method set to: ${this.useOpenAI ? 'OpenAI' : 'Sonata'}`);
                this.error = null;
            } catch (error) {
                console.error('Error toggling TTS:', error);
                this.error = 'Failed to toggle TTS. Please try again.';
            }
        },
        async receiveMessage(data) {
            try {
                this.chatMessages.push({ sender: 'AI', message: data.text });
                if (data.audio && !this.useOpenAI) {
                    await this.websocketService.playAudio(data.audio);
                } else if (this.useOpenAI) {
                    await this.websocketService.generateAndPlayOpenAIAudio(data.text);
                }
                this.error = null;
            } catch (error) {
                console.error('Error processing received message:', error);
                this.error = 'Failed to process received message. Please try again.';
            }
        },
        handleWebSocketError(error) {
            console.error('WebSocket error:', error);
            this.error = 'Connection error. Please check your internet connection and try again.';
        }
    },
    mounted() {
        if (this.websocketService) {
            this.websocketService.on('ragflowResponse', this.receiveMessage);
            this.websocketService.on('error', this.handleWebSocketError);
        } else {
            console.error('WebSocketService is undefined');
            this.error = 'Chat service is unavailable. Please try again later.';
        }
    },
    beforeUnmount() {
        if (this.websocketService) {
            this.websocketService.off('ragflowResponse', this.receiveMessage);
            this.websocketService.off('error', this.handleWebSocketError);
        }
    }
});
</script>

<style scoped>
.chat-interface {
  background-color: #222;
  padding: 10px;
  border-radius: 5px;
  margin-bottom: 15px;
}

.chat-messages {
  max-height: 200px;
  overflow-y: auto;
  background-color: #333;
  padding: 10px;
  border-radius: 5px;
}

.chat-message {
  margin-bottom: 10px;
}

.chat-message.user {
  text-align: right;
}

.chat-input-container {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.chat-input-container input[type="text"] {
  flex-grow: 1;
  padding: 5px;
}

.chat-input-container button {
  padding: 5px 10px;
}

.tts-toggle {
  margin-top: 10px;
}

.error-message {
  color: #ff4444;
  margin-top: 10px;
  font-weight: bold;
}
</style>
