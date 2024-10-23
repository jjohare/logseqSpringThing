[Previous content remains the same until the template section, where we update the form elements with proper IDs:]

<template>
  <div id="control-panel" :class="{ hidden: isHidden }">
    <button @click="togglePanel" class="toggle-button" id="toggle-panel-btn">
      {{ isHidden ? '>' : '<' }}
    </button>
    <div class="panel-content" v-show="!isHidden">
      <!-- Chat Interface -->
      <div class="control-group">
        <h3>Chat Interface</h3>
        <div class="chat-messages" ref="chatMessagesRef">
          <div v-for="(message, index) in chatMessages" :key="index" :class="['chat-message', message.sender === 'You' ? 'user' : 'ai']">
            <strong>{{ message.sender }}:</strong> {{ message.message }}
          </div>
        </div>
        <div class="chat-input-container">
          <input type="text" id="chat-input" name="chat-input" v-model="chatInput" @keyup.enter="sendMessage" placeholder="Type a message..." />
          <button @click="sendMessage" id="send-message-btn">Send</button>
        </div>
        <div v-if="chatError" class="error-message">
          {{ chatError }}
        </div>
      </div>

      <!-- Fisheye Distortion Controls -->
      <div class="control-group">
        <h3>Fisheye Distortion</h3>
        <div class="control-item">
          <label>Enable Fisheye</label>
          <div>
            <label>
              <input type="radio" id="fisheye-enabled" name="fisheye_enabled" value="true" v-model="fisheyeEnabled" @change="emitChange('fisheyeEnabled', true)">
              Enable
            </label>
            <label>
              <input type="radio" id="fisheye-disabled" name="fisheye_enabled" value="false" v-model="fisheyeEnabled" @change="emitChange('fisheyeEnabled', false)">
              Disable
            </label>
          </div>
        </div>
        <div class="control-item">
          <label for="fisheye-strength">Fisheye Strength</label>
          <input
            id="fisheye-strength"
            name="fisheye_strength"
            type="range"
            v-model.number="fisheyeStrength"
            :min="0"
            :max="1"
            :step="0.01"
            @input="emitChange('fisheyeStrength', fisheyeStrength)"
          >
          <span class="range-value">{{ fisheyeStrength }}</span>
        </div>
      </div>

      <!-- Color Controls -->
      <div class="control-group">
        <h3>Colors</h3>
        <div v-for="control in colorControls" :key="control.name" class="control-item">
          <label :for="control.name + '-input'">{{ control.label }}</label>
          <input
            :id="control.name + '-input'"
            :name="control.name"
            type="color"
            v-model="control.value"
            @change="emitChange(control.name, colorToInt(control.value))"
          >
        </div>
      </div>

      <!-- Size and Opacity Controls -->
      <div class="control-group">
        <h3>Size and Opacity</h3>
        <div v-for="control in sizeOpacityControls" :key="control.name" class="control-item">
          <label :for="control.name + '-input'">{{ control.label }}</label>
          <input
            :id="control.name + '-input'"
            :name="control.name"
            type="range"
            v-model.number="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            @input="emitChange(control.name, control.value)"
          >
          <span class="range-value">{{ control.value }}</span>
        </div>
      </div>

      <!-- Bloom Effect Controls -->
      <div class="control-group">
        <h3>Bloom Effects</h3>
        <div v-for="control in bloomControls" :key="control.name" class="control-item">
          <label :for="control.name + '-input'">{{ control.label }}</label>
          <input
            :id="control.name + '-input'"
            :name="control.name"
            type="range"
            v-model.number="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            @input="emitChange(control.name, control.value)"
          >
          <span class="range-value">{{ control.value }}</span>
        </div>
      </div>

      <!-- Force-Directed Graph Controls -->
      <div class="control-group">
        <h3>Force-Directed Graph</h3>
        <div class="control-item">
          <label for="simulation-mode">Simulation Mode</label>
          <select
            id="simulation-mode"
            name="simulation_mode"
            v-model="simulationMode"
            @change="emitChange('simulationMode', simulationMode)"
          >
            <option value="cpu">CPU</option>
            <option value="gpu" :disabled="!gpuAvailable">GPU</option>
            <option value="remote">Remote</option>
          </select>
        </div>
        <div v-for="control in forceDirectedControls" :key="control.name" class="control-item">
          <label :for="control.name + '-input'">{{ control.label }}</label>
          <input
            :id="control.name + '-input'"
            :name="control.name"
            type="range"
            v-model.number="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            @input="emitChange(control.name, control.value)"
          >
          <span class="range-value">{{ control.value }}</span>
        </div>
      </div>

      <!-- Additional Settings -->
      <div class="control-group">
        <h3>Additional Settings</h3>
        <div v-for="control in additionalControls" :key="control.name" class="control-item">
          <label :for="control.name + '-input'">{{ control.label }}</label>
          <input
            :id="control.name + '-input'"
            :name="control.name"
            type="range"
            v-model.number="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            @input="emitChange(control.name, control.value)"
          >
          <span class="range-value">{{ control.value }}</span>
        </div>
        <!-- TTS Mode Control -->
        <div class="control-item">
          <label for="tts-mode">TTS Mode</label>
          <select
            id="tts-mode"
            name="tts_mode"
            v-model="ttsMode"
            @change="handleTTSModeChange"
          >
            <option value="local">Local Sonata TTS</option>
            <option value="openai">OpenAI WebSocket TTS</option>
          </select>
        </div>
      </div>

      <!-- Additional Buttons -->
      <div class="button-group">
        <button @click="toggleFullscreen" class="control-button" id="fullscreen-btn">Toggle Fullscreen</button>
        <button @click="enableSpacemouse" class="control-button" id="spacemouse-btn">Enable Spacemouse</button>
      </div>

      <button @click="resetControls" class="reset-button" id="reset-btn">Reset to Defaults</button>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'ControlPanel',
    props: {
        websocketService: {
            type: Object,
            required: true
        },
        gpuAvailable: {
            type: Boolean,
            required: true
        },
        config: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            isHidden: false,
            fisheyeEnabled: false,
            fisheyeStrength: 0.5,
            simulationMode: 'cpu',
            ttsMode: 'local',
            // Chat interface data
            chatInput: '',
            chatMessages: [],
            chatError: null,
            colorControls: [
                { name: 'nodeColor', label: 'Node Color', type: 'color', value: this.intToColor(this.config.visualization.node_color) },
                { name: 'edgeColor', label: 'Edge Color', type: 'color', value: this.intToColor(this.config.visualization.edge_color) },
                { name: 'hologramColor', label: 'Hologram Color', type: 'color', value: this.intToColor(this.config.visualization.hologram_color) },
            ],
            sizeOpacityControls: [
                { name: 'nodeSizeScalingFactor', label: 'Node Size Scaling', type: 'range', value: this.config.visualization.node_size_scaling_factor, min: 1, max: 10, step: 0.1 },
                { name: 'hologramScale', label: 'Hologram Scale', type: 'range', value: this.config.visualization.hologram_scale, min: 1, max: 10, step: 0.1 },
                { name: 'hologramOpacity', label: 'Hologram Opacity', type: 'range', value: this.config.visualization.hologram_opacity, min: 0, max: 1, step: 0.01 },
                { name: 'edgeOpacity', label: 'Edge Opacity', type: 'range', value: this.config.visualization.edge_opacity, min: 0, max: 1, step: 0.01 },
            ],
            bloomControls: [
                { name: 'nodeBloomStrength', label: 'Node Bloom Strength', type: 'range', value: this.config.bloom.node_bloom_strength, min: 0, max: 1, step: 0.01 },
                { name: 'nodeBloomRadius', label: 'Node Bloom Radius', type: 'range', value: this.config.bloom.node_bloom_radius, min: 0, max: 1, step: 0.01 },
                { name: 'nodeBloomThreshold', label: 'Node Bloom Threshold', type: 'range', value: this.config.bloom.node_bloom_threshold, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomStrength', label: 'Edge Bloom Strength', type: 'range', value: this.config.bloom.edge_bloom_strength, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomRadius', label: 'Edge Bloom Radius', type: 'range', value: this.config.bloom.edge_bloom_radius, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomThreshold', label: 'Edge Bloom Threshold', type: 'range', value: this.config.bloom.edge_bloom_threshold, min: 0, max: 1, step: 0.01 },
                { name: 'environmentBloomStrength', label: 'Environment Bloom Strength', type: 'range', value: this.config.bloom.environment_bloom_strength, min: 0, max: 2, step: 0.01 },
                { name: 'environmentBloomRadius', label: 'Environment Bloom Radius', type: 'range', value: this.config.bloom.environment_bloom_radius, min: 0, max: 2, step: 0.01 },
                { name: 'environmentBloomThreshold', label: 'Environment Bloom Threshold', type: 'range', value: this.config.bloom.environment_bloom_threshold, min: 0, max: 1, step: 0.01 },
            ],
            forceDirectedControls: [
                { name: 'forceDirectedIterations', label: 'Iterations', type: 'range', value: this.config.visualization.force_directed_iterations, min: 10, max: 500, step: 10 },
                { name: 'forceDirectedRepulsion', label: 'Repulsion', type: 'range', value: this.config.visualization.force_directed_repulsion, min: 0.1, max: 10.0, step: 0.1 },
                { name: 'forceDirectedAttraction', label: 'Attraction', type: 'range', value: this.config.visualization.force_directed_attraction, min: 0.001, max: 0.1, step: 0.001 },
            ],
            additionalControls: [
                { name: 'labelFontSize', label: 'Label Font Size', type: 'range', value: this.config.visualization.label_font_size, min: 12, max: 72, step: 1 },
                { name: 'fogDensity', label: 'Fog Density', type: 'range', value: this.config.visualization.fog_density, min: 0, max: 0.01, step: 0.0001 },
            ],
        };
    },
    methods: {
        togglePanel() {
            this.isHidden = !this.isHidden;
        },
        emitChange(name, value) {
            this.$emit('control-change', { name, value });
        },
        async sendMessage() {
            if (this.chatInput.trim()) {
                try {
                    await this.websocketService.sendChatMessage({
                        type: 'chatMessage',
                        message: this.chatInput,
                        use_openai: this.ttsMode === 'openai'  // Changed from useOpenAI to use_openai
                    });
                    this.chatMessages.push({ sender: 'You', message: this.chatInput });
                    this.chatInput = '';
                    this.chatError = null;
                } catch (error) {
                    console.error('Error sending message:', error);
                    this.chatError = 'Failed to send message. Please try again.';
                }
            }
        },
        handleTTSModeChange() {
            this.emitChange('ttsMode', this.ttsMode);
            this.websocketService.toggleTTS(this.ttsMode === 'openai');
        },
        async receiveMessage(data) {
            try {
                this.chatMessages.push({ sender: 'AI', message: data.text });
                if (data.audio && this.ttsMode === 'local') {
                    await this.websocketService.playAudio(data.audio);
                } else if (this.ttsMode === 'openai') {
                    await this.websocketService.generateAndPlayOpenAIAudio(data.text);
                }
                this.chatError = null;
            } catch (error) {
                console.error('Error processing received message:', error);
                this.chatError = 'Failed to process received message. Please try again.';
            }
        },
        handleWebSocketError(error) {
            console.error('WebSocket error:', error);
            this.chatError = 'Connection error. Please check your internet connection and try again.';
        },
        resetControls() {
            this.colorControls.forEach(control => {
                control.value = this.intToColor(this.config.visualization[this.snakeCaseName(control.name)]);
                this.emitChange(control.name, this.colorToInt(control.value));
            });
            this.sizeOpacityControls.forEach(control => {
                control.value = this.config.visualization[this.snakeCaseName(control.name)];
                this.emitChange(control.name, control.value);
            });
            this.bloomControls.forEach(control => {
                control.value = this.config.bloom[this.snakeCaseName(control.name)];
                this.emitChange(control.name, control.value);
            });
            this.forceDirectedControls.forEach(control => {
                control.value = this.config.visualization[this.snakeCaseName(control.name)];
                this.emitChange(control.name, control.value);
            });
            this.additionalControls.forEach(control => {
                control.value = this.config.visualization[this.snakeCaseName(control.name)];
                this.emitChange(control.name, control.value);
            });
            this.fisheyeEnabled = false;
            this.emitChange('fisheyeEnabled', false);
            this.fisheyeStrength = 0.5;
            this.emitChange('fisheyeStrength', 0.5);
            
            // Reset simulation mode based on availability
            if (this.gpuAvailable) {
                this.simulationMode = 'gpu';
            } else if (this.websocketService.isConnected()) {
                this.simulationMode = 'remote';
            } else {
                this.simulationMode = 'cpu';
            }
            this.emitChange('simulationMode', this.simulationMode);

            // Reset chat interface
            this.chatMessages = [];
            this.chatInput = '';
            this.chatError = null;
            
            // Reset TTS mode
            this.ttsMode = 'local';
            this.handleTTSModeChange();
        },
        toggleFullscreen() {
            this.$emit('toggle-fullscreen');
        },
        enableSpacemouse() {
            this.$emit('enable-spacemouse');
        },
        colorToInt(color) {
            // Remove the '#' and convert directly to integer
            return parseInt(color.replace('#', ''), 16);
        },
        intToColor(int) {
            // Convert integer to 6-digit hex string with '#' prefix
            return '#' + int.toString(16).padStart(6, '0');
        },
        snakeCaseName(name) {
            return name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        }
    },
    mounted() {
        // Set initial simulation mode based on availability
        if (this.gpuAvailable) {
            this.simulationMode = 'gpu';
        } else if (this.websocketService.isConnected()) {
            this.simulationMode = 'remote';
        }
        this.emitChange('simulationMode', this.simulationMode);

        // Set up WebSocket listeners for chat
        if (this.websocketService) {
            this.websocketService.on('ragflowResponse', this.receiveMessage);
            this.websocketService.on('error', this.handleWebSocketError);
        }
    },
    beforeUnmount() {
        // Clean up WebSocket listeners
        if (this.websocketService) {
            this.websocketService.off('ragflowResponse', this.receiveMessage);
            this.websocketService.off('error', this.handleWebSocketError);
        }
    }
});
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

.control-group {
  margin-bottom: 20px;
}

.control-group h3 {
  margin-bottom: 10px;
  border-bottom: 1px solid #444;
  padding-bottom: 5px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
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

select {
  width: 100%;
  padding: 5px;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 5px;
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

.button-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Chat interface styles */
.chat-messages {
  max-height: 200px;
  overflow-y: auto;
  background-color: #333;
  padding: 10px;
  border-radius: 5px;
  margin-bottom: 10px;
}

.chat-message {
  margin-bottom: 10px;
  word-wrap: break-word;
}

.chat-message.user {
  text-align: right;
  color: #4CAF50;
}

.chat-message.ai {
  text-align: left;
  color: #2196F3;
}

.chat-input-container {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.chat-input-container input[type="text"] {
  flex-grow: 1;
  padding: 8px;
  background-color: #333;
  color: white;
  border: 1px solid #555;
  border-radius: 4px;
}

.chat-input-container button {
  padding: 8px 15px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.chat-input-container button:hover {
  background-color: #45a049;
}

.error-message {
  color: #ff4444;
  margin-top: 10px;
  font-size: 0.9em;
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
