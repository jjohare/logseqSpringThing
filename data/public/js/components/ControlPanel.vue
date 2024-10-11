<template>
  <div id="control-panel" :class="{ hidden: isHidden }">
    <button @click="togglePanel" class="toggle-button">
      {{ isHidden ? '>' : '<' }}
    </button>
    <div class="panel-content" v-show="!isHidden">
      <!-- Chat Interface -->
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

      <!-- Fisheye Distortion Toggle -->
      <div class="control-item">
        <label for="fisheye_enabled">Fisheye Distortion</label>
        <div>
          <label>
            <input type="radio" value="true" v-model="fisheyeEnabled" @change="emitChange('fisheyeEnabled', true)">
            Enable
          </label>
          <label>
            <input type="radio" value="false" v-model="fisheyeEnabled" @change="emitChange('fisheyeEnabled', false)">
            Disable
          </label>
        </div>
      </div>

      <!-- Fisheye Strength Slider -->
      <div class="control-item">
        <label for="fisheye_strength">Fisheye Strength</label>
        <input
          id="fisheye_strength"
          type="range"
          v-model.number="fisheyeStrength"
          :min="0"
          :max="1"
          :step="0.01"
          @input="emitChange('fisheyeStrength', fisheyeStrength)"
        >
        <span class="range-value">{{ fisheyeStrength }}</span>
      </div>

      <!-- Other Controls -->
      <div class="controls-container">
        <div v-for="control in controls" :key="control.name" class="control-item">
          <label :for="control.name">{{ control.label }}</label>
          <input v-if="control.type === 'color'"
                 :id="control.name"
                 type="color"
                 v-model="control.value"
                 @change="emitChange(control.name, control.value)"
          >
          <input v-else-if="control.type === 'range'"
                 :id="control.name"
                 type="range"
                 v-model.number="control.value"
                 :min="control.min"
                 :max="control.max"
                 :step="control.step"
                 @input="emitChange(control.name, control.value)"
          >
          <span v-if="control.type === 'range'" class="range-value">{{ control.value }}</span>
        </div>
      </div>

      <!-- Additional Buttons -->
      <div class="button-group">
        <button @click="toggleFullscreen" class="control-button">Toggle Fullscreen</button>
        <button @click="enableSpacemouse" class="control-button">Enable Spacemouse</button>
      </div>

      <button @click="resetControls" class="reset-button">Reset to Defaults</button>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, onUpdated } from 'vue';

export default {
  name: 'ControlPanel',
  props: {
    websocketService: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      isHidden: false,
      fisheyeEnabled: false,
      fisheyeStrength: 0.5,
      controls: [
        { name: 'nodeColor', label: 'Node Color', type: 'color', value: '#1A0B31' },
        { name: 'edgeColor', label: 'Edge Color', type: 'color', value: '#ff0000' },
        { name: 'hologramColor', label: 'Hologram Color', type: 'color', value: '#FFD700' },
        { name: 'nodeSizeScalingFactor', label: 'Node Size Scaling', type: 'range', value: 1000, min: 100, max: 2000, step: 10 },
        { name: 'hologramScale', label: 'Hologram Scale', type: 'range', value: 5, min: 1, max: 10, step: 0.1 },
        { name: 'hologramOpacity', label: 'Hologram Opacity', type: 'range', value: 0.1, min: 0, max: 1, step: 0.01 },
        { name: 'edgeOpacity', label: 'Edge Opacity', type: 'range', value: 0.3, min: 0, max: 1, step: 0.01 },
        { name: 'labelFontSize', label: 'Label Font Size', type: 'range', value: 36, min: 12, max: 72, step: 1 },
        { name: 'fogDensity', label: 'Fog Density', type: 'range', value: 0.002, min: 0, max: 0.01, step: 0.0001 },
        { name: 'nodeBloomStrength', label: 'Node Bloom Strength', type: 'range', value: 0.1, min: 0, max: 1, step: 0.01 },
        { name: 'nodeBloomRadius', label: 'Node Bloom Radius', type: 'range', value: 0.1, min: 0, max: 1, step: 0.01 },
        { name: 'nodeBloomThreshold', label: 'Node Bloom Threshold', type: 'range', value: 0, min: 0, max: 1, step: 0.01 },
        { name: 'edgeBloomStrength', label: 'Edge Bloom Strength', type: 'range', value: 0.2, min: 0, max: 1, step: 0.01 },
        { name: 'edgeBloomRadius', label: 'Edge Bloom Radius', type: 'range', value: 0.3, min: 0, max: 1, step: 0.01 },
        { name: 'edgeBloomThreshold', label: 'Edge Bloom Threshold', type: 'range', value: 0, min: 0, max: 1, step: 0.01 },
        { name: 'environmentBloomStrength', label: 'Environment Bloom Strength', type: 'range', value: 1, min: 0, max: 2, step: 0.01 },
        { name: 'environmentBloomRadius', label: 'Environment Bloom Radius', type: 'range', value: 1, min: 0, max: 2, step: 0.01 },
        { name: 'environmentBloomThreshold', label: 'Environment Bloom Threshold', type: 'range', value: 0, min: 0, max: 1, step: 0.01 },
      ],
      chatInput: '',
      chatMessages: [],
      useOpenAI: false,
    };
  },
  methods: {
    togglePanel() {
      this.isHidden = !this.isHidden;
    },
    emitChange(name, value) {
      if (this.isColorControl(name)) {
        value = parseInt(value.replace('#', '0x'), 16);
      }
      this.$emit('control-change', { name, value });
    },
    isColorControl(name) {
      return ['nodeColor', 'edgeColor', 'hologramColor'].includes(name);
    },
    resetControls() {
      this.controls.forEach(control => {
        control.value = this.getDefaultValue(control.name);
        this.emitChange(control.name, control.value);
      });
      this.fisheyeEnabled = false;
      this.emitChange('fisheyeEnabled', false);
      this.fisheyeStrength = 0.5;
      this.emitChange('fisheyeStrength', 0.5);
    },
    getDefaultValue(name) {
      const defaults = {
        nodeColor: '#1A0B31',
        edgeColor: '#ff0000',
        hologramColor: '#FFD700',
        nodeSizeScalingFactor: 1000,
        hologramScale: 5,
        hologramOpacity: 0.1,
        edgeOpacity: 0.3,
        labelFontSize: 36,
        fogDensity: 0.002,
        nodeBloomStrength: 0.1,
        nodeBloomRadius: 0.1,
        nodeBloomThreshold: 0,
        edgeBloomStrength: 0.2,
        edgeBloomRadius: 0.3,
        edgeBloomThreshold: 0,
        environmentBloomStrength: 1,
        environmentBloomRadius: 1,
        environmentBloomThreshold: 0,
      };
      return defaults[name] || '';
    },
    sendMessage() {
      if (this.chatInput.trim() && this.websocketService) {
        this.websocketService.sendChatMessage({
          message: this.chatInput,
          useOpenAI: this.useOpenAI
        });
        this.chatMessages.push({ sender: 'You', message: this.chatInput });
        this.chatInput = '';
      }
    },
    toggleTTS() {
      if (this.websocketService) {
        this.websocketService.toggleTTS(this.useOpenAI);
        console.log(`TTS method set to: ${this.useOpenAI ? 'OpenAI' : 'Sonata'}`);
      }
    },
    receiveMessage(message) {
      this.chatMessages.push({ sender: 'AI', message });
    },
    toggleFullscreen() {
      this.$emit('toggle-fullscreen');
    },
    enableSpacemouse() {
      this.$emit('enable-spacemouse');
    }
  },
  mounted() {
    if (this.websocketService) {
      this.websocketService.on('message', this.receiveMessage);
    } else {
      console.error('WebSocketService is undefined');
    }
  },
  beforeUnmount() {
    if (this.websocketService) {
      this.websocketService.off('message', this.receiveMessage);
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
};
</script>

<style scoped>
#control-panel {
  position: fixed;
  top: 20px;
  right: 0;
  width: 300px;
  max-height: 80vh;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  border-radius: 10px 0 0 10px;
  overflow-y: auto;
  z-index: 1000;
  transition: transform 0.3s ease-in-out;
}

#control-panel.hidden {
  transform: translateX(calc(100% - 40px));
}

.toggle-button {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  border: none;
  padding: 10px;
  cursor: pointer;
  border-radius: 5px 0 0 5px;
}

.panel-content {
  padding: 20px;
}

.controls-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

label {
  font-weight: bold;
}

input[type="color"] {
  width: 100%;
  height: 30px;
  border: none;
  border-radius: 5px;
}

input[type="range"] {
  width: 100%;
}

.range-value {
  font-size: 0.8em;
  text-align: right;
}

.reset-button, .control-button {
  width: 100%;
  padding: 10px;
  margin-top: 15px;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.reset-button:hover, .control-button:hover {
  background-color: #555;
}

/* Chat Interface Styles */
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

.button-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Scrollbar styling */
#control-panel::-webkit-scrollbar {
  width: 10px;
}

#control-panel::-webkit-scrollbar-track {
  background: #1e1e1e;
}

#control-panel::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
}

#control-panel::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
