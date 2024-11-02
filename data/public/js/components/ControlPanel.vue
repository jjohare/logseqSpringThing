<script>
import { defineComponent, ref, onMounted, onBeforeUnmount, onUpdated } from 'vue';

export default defineComponent({
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
            simulationMode: 'remote',
            fisheyeEnabled: false,
            fisheyeStrength: 0.5,
            chatInput: '',
            chatMessages: [],
            useOpenAITTS: false,
            // Initialize controls with empty arrays, will be populated from settings
            colorControls: [],
            sizeOpacityControls: [],
            bloomControls: [],
            forceDirectedControls: [],
            additionalControls: [],
            // Track collapsed state of control groups
            collapsedGroups: {
                chat: false,
                fisheye: false,
                colors: false,
                sizeOpacity: false,
                bloom: false,
                forceDirected: false,
                additional: false
            }
        };
    },
    methods: {
        togglePanel() {
            this.isHidden = !this.isHidden;
        },
        toggleGroup(group) {
            this.collapsedGroups[group] = !this.collapsedGroups[group];
        },
        setSimulationMode() {
            console.log('Setting simulation mode to:', this.simulationMode);
            if (this.websocketService) {
                this.websocketService.setSimulationMode(this.simulationMode);
            } else {
                console.error('WebSocketService is undefined');
            }
        },
        emitChange(name, value) {
            if (this.isColorControl(name)) {
                value = parseInt(value.replace('#', '0x'), 16);
            }
            this.$emit('control-change', { name, value });
        },
        isColorControl(name) {
            return this.colorControls.some(control => control.name === name);
        },
        resetControls() {
            window.dispatchEvent(new CustomEvent('resetVisualizationSettings'));
        },
        sendMessage() {
            if (this.chatInput.trim() && this.websocketService) {
                this.chatMessages.push({ sender: 'You', message: this.chatInput });
                this.websocketService.sendChatMessage({
                    message: this.chatInput,
                    useOpenAI: true,
                    useTTS: this.useOpenAITTS
                });
                this.chatInput = '';
            }
        },
        receiveMessage(message) {
            if (!this.useOpenAITTS) {
                this.chatMessages.push({ sender: 'AI', message });
            }
        },
        toggleFullscreen() {
            this.$emit('toggle-fullscreen');
        },
        enableSpacemouse() {
            this.$emit('enable-spacemouse');
        },
        initializeControls(settings) {
            this.colorControls = [
                { name: 'nodeColor', label: 'Node Color', type: 'color', value: settings.visualization.nodeColor },
                { name: 'edgeColor', label: 'Edge Color', type: 'color', value: settings.visualization.edgeColor },
                { name: 'hologramColor', label: 'Hologram Color', type: 'color', value: settings.visualization.hologramColor }
            ];

            this.sizeOpacityControls = [
                { name: 'nodeSizeScalingFactor', label: 'Node Size Scaling', type: 'range', value: settings.visualization.nodeSizeScalingFactor, min: 1, max: 10, step: 0.1 },
                { name: 'hologramScale', label: 'Hologram Scale', type: 'range', value: settings.visualization.hologramScale, min: 1, max: 10, step: 0.1 },
                { name: 'hologramOpacity', label: 'Hologram Opacity', type: 'range', value: settings.visualization.hologramOpacity, min: 0, max: 1, step: 0.01 },
                { name: 'edgeOpacity', label: 'Edge Opacity', type: 'range', value: settings.visualization.edgeOpacity, min: 0, max: 1, step: 0.01 }
            ];

            this.bloomControls = [
                { name: 'nodeBloomStrength', label: 'Node Bloom Strength', type: 'range', value: settings.bloom.nodeBloomStrength, min: 0, max: 1, step: 0.01 },
                { name: 'nodeBloomRadius', label: 'Node Bloom Radius', type: 'range', value: settings.bloom.nodeBloomRadius, min: 0, max: 1, step: 0.01 },
                { name: 'nodeBloomThreshold', label: 'Node Bloom Threshold', type: 'range', value: settings.bloom.nodeBloomThreshold, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomStrength', label: 'Edge Bloom Strength', type: 'range', value: settings.bloom.edgeBloomStrength, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomRadius', label: 'Edge Bloom Radius', type: 'range', value: settings.bloom.edgeBloomRadius, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomThreshold', label: 'Edge Bloom Threshold', type: 'range', value: settings.bloom.edgeBloomThreshold, min: 0, max: 1, step: 0.01 },
                { name: 'environmentBloomStrength', label: 'Environment Bloom Strength', type: 'range', value: settings.bloom.environmentBloomStrength, min: 0, max: 2, step: 0.01 },
                { name: 'environmentBloomRadius', label: 'Environment Bloom Radius', type: 'range', value: settings.bloom.environmentBloomRadius, min: 0, max: 2, step: 0.01 },
                { name: 'environmentBloomThreshold', label: 'Environment Bloom Threshold', type: 'range', value: settings.bloom.environmentBloomThreshold, min: 0, max: 1, step: 0.01 }
            ];

            this.forceDirectedControls = [
                { name: 'forceDirectedIterations', label: 'Iterations', type: 'range', value: settings.visualization.forceDirectedIterations, min: 10, max: 500, step: 10 },
                { name: 'forceDirectedRepulsion', label: 'Repulsion', type: 'range', value: settings.visualization.forceDirectedRepulsion, min: 0.1, max: 10.0, step: 0.1 },
                { name: 'forceDirectedAttraction', label: 'Attraction', type: 'range', value: settings.visualization.forceDirectedAttraction, min: 0.001, max: 0.1, step: 0.001 }
            ];

            this.additionalControls = [
                { name: 'labelFontSize', label: 'Label Font Size', type: 'range', value: settings.visualization.labelFontSize, min: 12, max: 72, step: 1 },
                { name: 'fogDensity', label: 'Fog Density', type: 'range', value: settings.visualization.fogDensity, min: 0, max: 0.01, step: 0.0001 }
            ];
        }
    },
    mounted() {
        if (this.websocketService) {
            this.websocketService.on('message', this.receiveMessage);
            this.websocketService.on('simulationModeSet', (mode) => {
                console.log('Simulation mode set to:', mode);
                this.simulationMode = mode;
            });

            window.addEventListener('serverSettings', (event) => {
                this.initializeControls(event.detail);
            });
        } else {
            console.error('WebSocketService is undefined');
        }
    },
    beforeUnmount() {
        if (this.websocketService) {
            this.websocketService.off('message', this.receiveMessage);
        }
        window.removeEventListener('serverSettings', this.initializeControls);
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
    <div id="control-panel" :class="{ hidden: isHidden }">
        <button @click="togglePanel" class="toggle-button">
            {{ isHidden ? '>' : '<' }}
        </button>
        <div class="panel-content" v-show="!isHidden">
            <!-- Chat Interface -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('chat')">
                    <h3>Chat Interface</h3>
                    <span class="collapse-icon">{{ collapsedGroups.chat ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.chat">
                    <div class="chat-messages" ref="chatMessagesRef">
                        <div v-for="(message, index) in chatMessages" :key="index" class="message">
                            <strong>{{ message.sender }}:</strong> {{ message.message }}
                        </div>
                    </div>
                    <div class="chat-input">
                        <label class="tts-toggle">
                            <input type="checkbox" v-model="useOpenAITTS">
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
            </div>

            <!-- Fisheye Distortion Controls -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('fisheye')">
                    <h3>Fisheye Distortion</h3>
                    <span class="collapse-icon">{{ collapsedGroups.fisheye ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.fisheye">
                    <div class="control-item">
                        <label for="fisheye_enabled">Enable Fisheye</label>
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
                </div>
            </div>

            <!-- Color Controls -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('colors')">
                    <h3>Colors</h3>
                    <span class="collapse-icon">{{ collapsedGroups.colors ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.colors">
                    <div v-for="control in colorControls" :key="control.name" class="control-item">
                        <label :for="control.name">{{ control.label }}</label>
                        <input
                            :id="control.name"
                            type="color"
                            v-model="control.value"
                            @change="emitChange(control.name, control.value)"
                        >
                    </div>
                </div>
            </div>

            <!-- Size and Opacity Controls -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('sizeOpacity')">
                    <h3>Size and Opacity</h3>
                    <span class="collapse-icon">{{ collapsedGroups.sizeOpacity ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.sizeOpacity">
                    <div v-for="control in sizeOpacityControls" :key="control.name" class="control-item">
                        <label :for="control.name">{{ control.label }}</label>
                        <input
                            :id="control.name"
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
            </div>

            <!-- Bloom Effect Controls -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('bloom')">
                    <h3>Bloom Effects</h3>
                    <span class="collapse-icon">{{ collapsedGroups.bloom ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.bloom">
                    <div v-for="control in bloomControls" :key="control.name" class="control-item">
                        <label :for="control.name">{{ control.label }}</label>
                        <input
                            :id="control.name"
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
            </div>

            <!-- Force-Directed Graph Controls -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('forceDirected')">
                    <h3>Force-Directed Graph</h3>
                    <span class="collapse-icon">{{ collapsedGroups.forceDirected ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.forceDirected">
                    <div class="control-item">
                        <label>Simulation Mode</label>
                        <select v-model="simulationMode" @change="setSimulationMode">
                            <option value="remote">Remote (GPU Server)</option>
                            <option value="gpu">Local GPU</option>
                            <option value="local">Local CPU</option>
                        </select>
                    </div>
                    <div v-for="control in forceDirectedControls" :key="control.name" class="control-item">
                        <label :for="control.name">{{ control.label }}</label>
                        <input
                            :id="control.name"
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
            </div>

            <!-- Additional Controls -->
            <div class="control-group">
                <div class="group-header" @click="toggleGroup('additional')">
                    <h3>Additional Settings</h3>
                    <span class="collapse-icon">{{ collapsedGroups.additional ? '▼' : '▲' }}</span>
                </div>
                <div class="group-content" v-show="!collapsedGroups.additional">
                    <div v-for="control in additionalControls" :key="control.name" class="control-item">
                        <label :for="control.name">{{ control.label }}</label>
                        <input
                            :id="control.name"
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

<style scoped>
#control-panel {
    position: fixed;
    top: 20px;
    right: 0;
    width: 300px;
    max-height: 90vh;
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
    z-index: 2;
}

.panel-content {
    padding: 20px 20px 20px 40px;
    height: 100%;
    overflow-y: auto;
}

.control-group {
    margin-bottom: 20px;
    border: 1px solid #444;
    border-radius: 5px;
    overflow: hidden;
}

.group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    background-color: #333;
    cursor: pointer;
    user-select: none;
}

.group-header h3 {
    margin: 0;
    font-size: 1.1em;
}

.collapse-icon {
    font-size: 0.8em;
    transition: transform 0.3s ease;
}

.group-content {
    padding: 15px;
    background-color: rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
}

.control-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 10px;
}

label {
    font-weight: bold;
    font-size: 0.9em;
}

input[type="color"] {
    width: 100%;
    height: 30px;
    border: none;
    border-radius: 5px;
    background-color: #444;
}

input[type="range"] {
    width: 100%;
    background-color: #444;
}

.range-value {
    font-size: 0.8em;
    text-align: right;
    color: #aaa;
}

select {
    width: 100%;
    padding: 5px;
    background-color: #333;
    color: white;
    border: 1px solid #444;
    border-radius: 5px;
    margin-bottom: 10px;
}

.button-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;
}

.control-button, .reset-button {
    width: 100%;
    padding: 10px;
    background-color: #444;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.control-button:hover, .reset-button:hover {
    background-color: #555;
}

.chat-interface {
    margin-bottom: 15px;
}

.chat-messages {
    max-height: 200px;
    overflow-y: auto;
    padding: 10px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 5px;
    margin-bottom: 10px;
}

.message {
    margin-bottom: 8px;
    padding: 5px;
    border-radius: 3px;
    background-color: rgba(255, 255, 255, 0.1);
}

.chat-input {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.chat-input input[type="text"] {
    width: 100%;
    padding: 8px;
    background-color: #333;
    border: 1px solid #444;
    border-radius: 5px;
    color: white;
}

.tts-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.9em;
}

/* Scrollbar styling */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #666;
}
</style>
