<script>
import { defineComponent, ref, onUpdated, onBeforeUnmount } from 'vue';

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
            useOpenAI: false
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
        handleRagflowAnswer(answer) {
            if (!this.useOpenAI && typeof answer === 'string') {
                this.chatMessages.push({ sender: 'AI', message: answer });
            }
        },
        handleOpenAIResponse(response) {
            // Only show text responses when not using OpenAI TTS
            if (!this.useOpenAI && typeof response === 'string') {
                this.chatMessages.push({ sender: 'AI', message: response });
            }
        }
    },
    mounted() {
        if (this.websocketService) {
            this.websocketService.on('ragflowAnswer', this.handleRagflowAnswer);
            this.websocketService.on('openaiResponse', this.handleOpenAIResponse);
        } else {
            console.error('WebSocketService is undefined');
        }
    },
    beforeUnmount() {
        if (this.websocketService) {
            this.websocketService.off('ragflowAnswer', this.handleRagflowAnswer);
            this.websocketService.off('openaiResponse', this.handleOpenAIResponse);
        }
    },
    setup() {
        const chatMessagesRef = ref(null);

        const scrollToBottom = () => {
            if (chatMessagesRef.value) {
                chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight;
            }
        };

        onUpdated(() => {
            scrollToBottom();
        });

        return {
            chatMessagesRef
        };
    }
});
</script>

<template>
    <div class="chat-container">
        <div class="chat-messages" ref="chatMessagesRef" :class="{ 'hide-messages': useOpenAI }">
            <div v-for="(msg, index) in chatMessages" :key="index" class="message">
                <strong>{{ msg.sender }}:</strong> {{ msg.message }}
            </div>
        </div>
        <div class="chat-input">
            <label class="tts-toggle">
                <input type="checkbox" v-model="useOpenAI" @change="toggleTTS">
                Use OpenAI TTS
            </label>
            <input 
                v-model="chatInput" 
                @keyup.enter="sendMessage" 
                placeholder="Type your message..."
            >
            <button @click="sendMessage">Send</button>
        </div>
    </div>
</template>

<style scoped>
.chat-container {
    display: flex;
    flex-direction: column;
    height: 400px;
    border: 1px solid #ccc;
    border-radius: 4px;
    margin: 10px;
}

.chat-messages {
    flex-grow: 1;
    overflow-y: auto;
    padding: 10px;
    background: #f9f9f9;
    transition: height 0.3s ease;
}

.chat-messages.hide-messages {
    height: 0;
    padding: 0;
    overflow: hidden;
}

.message {
    margin: 5px 0;
    padding: 5px;
    border-radius: 4px;
    background: white;
}

.chat-input {
    display: flex;
    padding: 10px;
    background: white;
    border-top: 1px solid #ccc;
    align-items: center;
}

.chat-input input {
    flex-grow: 1;
    margin: 0 10px;
    padding: 5px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.chat-input button {
    padding: 5px 15px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.chat-input button:hover {
    background: #0056b3;
}

.tts-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.9em;
}
</style>
