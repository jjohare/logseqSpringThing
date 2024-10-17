<script>
import { defineComponent, inject, onMounted, onBeforeUnmount } from 'vue';

export default defineComponent({
    name: 'ChatManager',
    data() {
        return {
            chatInput: '',
            chatMessages: [],
            useOpenAI: true,
            websocketService: null,
        };
    },
    methods: {
        sendMessage() {
            if (this.chatInput.trim() && this.websocketService) {
                this.websocketService.sendRagflowQuery(this.chatInput, false, null);
                this.chatMessages.push({ sender: 'You', message: this.chatInput });
                this.chatInput = '';
            } else if (!this.websocketService) {
                console.error('WebSocketService is not available');
            }
        },
        toggleTTS() {
            if (this.websocketService) {
                this.websocketService.toggleTTS(this.useOpenAI);
                console.log(`TTS method set to: ${this.useOpenAI ? 'OpenAI' : 'Sonata'}`);
            } else {
                console.error('WebSocketService is not available');
            }
        },
        receiveMessage(message) {
            this.chatMessages.push({ sender: 'AI', message });
        }
    },
    mounted() {
        this.websocketService = inject('websocketService');
        if (this.websocketService) {
            this.websocketService.on('ragflowAnswer', this.receiveMessage);
        } else {
            console.error('WebSocketService is undefined');
        }
    },
    beforeUnmount() {
        if (this.websocketService) {
            this.websocketService.off('ragflowAnswer', this.receiveMessage);
        }
    }
});
</script>

<template>
    <div class="chat-manager">
        <div class="chat-messages">
            <div v-for="(msg, index) in chatMessages" :key="index" :class="msg.sender.toLowerCase()">
                <strong>{{ msg.sender }}:</strong> {{ msg.message }}
            </div>
        </div>
        <div class="chat-input">
            <input v-model="chatInput" @keyup.enter="sendMessage" placeholder="Type your message...">
            <button @click="sendMessage">Send</button>
        </div>
        <div class="tts-toggle">
            <label>
                <input type="checkbox" v-model="useOpenAI" @change="toggleTTS">
                Use OpenAI for TTS
            </label>
        </div>
    </div>
</template>

<style scoped>
.chat-manager {
    /* Add your styles here */
}
</style>
