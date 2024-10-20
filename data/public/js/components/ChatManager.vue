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
import { defineComponent, inject, ref } from 'vue';

export default defineComponent({
  name: 'ChatManager',
  setup() {
    const websocketService = inject('websocketService');
    const chatInput = ref('');
    const chatMessages = ref([]);
    const useOpenAI = ref(false);

    const sendMessage = () => {
      if (chatInput.value.trim() && websocketService) {
        // Initialize AudioContext on first user interaction
        if (useOpenAI.value && !websocketService.audioContext) {
          websocketService.initAudio();
        }

        websocketService.sendChatMessage({
          message: chatInput.value,
          useOpenAI: useOpenAI.value
        });
        chatMessages.value.push({ sender: 'You', message: chatInput.value });
        chatInput.value = '';
      }
    };

    const toggleTTS = () => {
      if (websocketService) {
        websocketService.toggleTTS(useOpenAI.value);
        if (useOpenAI.value && !websocketService.audioContext) {
          websocketService.initAudio();
        }
        console.log(`TTS method set to: ${useOpenAI.value ? 'OpenAI' : 'Sonata'}`);
      }
    };

    const receiveMessage = (message) => {
      chatMessages.value.push({ sender: 'AI', message });
    };

    if (websocketService) {
      websocketService.on('chatMessage', receiveMessage);
    }

    return {
      chatInput,
      chatMessages,
      useOpenAI,
      sendMessage,
      toggleTTS
    };
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
