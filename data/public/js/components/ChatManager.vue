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
            useOpenAI: false, // State for TTS toggle
        };
    },
    methods: {
        sendMessage() {
            if (this.chatInput.trim()) {
                this.websocketService.sendChatMessage({
                    message: this.chatInput,
                    useOpenAI: this.useOpenAI
                });
                this.chatMessages.push({ sender: 'You', message: this.chatInput });
                this.chatInput = '';
            }
        },
        toggleTTS() {
            this.websocketService.toggleTTS(this.useOpenAI);
            console.log(`TTS method set to: ${this.useOpenAI ? 'OpenAI' : 'Sonata'}`);
        },
        receiveMessage(message) {
            this.chatMessages.push({ sender: 'AI', message });
        }
    },
    mounted() {
        // Ensure that websocketService is available
        if (this.websocketService) {
            this.websocketService.on('message', this.receiveMessage);
        } else {
            console.error('WebSocketService is undefined');
        }
    },
    beforeUnmount() {
        // Remove the event listener when the component is unmounted
        if (this.websocketService) {
            this.websocketService.off('message', this.receiveMessage);
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
</style>
