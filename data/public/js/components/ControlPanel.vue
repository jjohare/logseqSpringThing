<template>
  <div id="control-panel" :class="{ hidden: isHidden }">
    <button @click="togglePanel" class="toggle-button">
      {{ isHidden ? '>' : '<' }}
    </button>
    <div class="panel-content" v-show="!isHidden">
      <!-- Chat Manager Component -->
      <ChatManager />

      <!-- Fisheye Distortion Controls -->
      <div class="control-group">
        <h3>Fisheye Distortion</h3>
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

      <!-- Color Controls -->
      <div class="control-group">
        <h3>Colors</h3>
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

      <!-- Size and Opacity Controls -->
      <div class="control-group">
        <h3>Size and Opacity</h3>
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

      <!-- Bloom Effect Controls -->
      <div class="control-group">
        <h3>Bloom Effects</h3>
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

      <!-- Force-Directed Graph Controls -->
      <div class="control-group">
        <h3>Force-Directed Graph</h3>
        <div class="control-item">
          <label for="forceDirectedIterations">Iterations</label>
          <input
            id="forceDirectedIterations"
            type="range"
            v-model.number="forceDirectedControls.iterations.value"
            :min="forceDirectedControls.iterations.min"
            :max="forceDirectedControls.iterations.max"
            :step="forceDirectedControls.iterations.step"
            @input="emitChange('forceDirectedIterations', forceDirectedControls.iterations.value)"
          >
          <span class="range-value">{{ forceDirectedControls.iterations.value }}</span>
        </div>
        <div class="control-item">
          <label for="springForce">Spring Force</label>
          <input
            id="springForce"
            type="range"
            v-model.number="forceDirectedControls.springForce.value"
            :min="forceDirectedControls.springForce.min"
            :max="forceDirectedControls.springForce.max"
            :step="forceDirectedControls.springForce.step"
            @input="updateSpringForce"
          >
          <span class="range-value">{{ forceDirectedControls.springForce.value }}</span>
        </div>
      </div>

      <!-- Additional Controls -->
      <div class="control-group">
        <h3>Additional Settings</h3>
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
import { defineComponent, inject } from 'vue';
import ChatManager from './ChatManager.vue';

export default defineComponent({
    name: 'ControlPanel',
    components: {
        ChatManager
    },
    data() {
        return {
            isHidden: false,
            fisheyeEnabled: false,
            fisheyeStrength: 0.5,
            // Color controls mapped to settings.toml
            colorControls: [
                { name: 'nodeColor', label: 'Node Color', type: 'color', value: '#1A0B31' },
                { name: 'edgeColor', label: 'Edge Color', type: 'color', value: '#ff0000' },
                { name: 'hologramColor', label: 'Hologram Color', type: 'color', value: '#FFD700' },
            ],
            // Size and opacity controls mapped to settings.toml
            sizeOpacityControls: [
                { name: 'nodeSizeScalingFactor', label: 'Node Size Scaling', type: 'range', value: 5, min: 1, max: 10, step: 0.1 },
                { name: 'hologramScale', label: 'Hologram Scale', type: 'range', value: 5, min: 1, max: 10, step: 0.1 },
                { name: 'hologramOpacity', label: 'Hologram Opacity', type: 'range', value: 0.1, min: 0, max: 1, step: 0.01 },
                { name: 'edgeOpacity', label: 'Edge Opacity', type: 'range', value: 0.3, min: 0, max: 1, step: 0.01 },
            ],
            // Bloom effect controls mapped to settings.toml
            bloomControls: [
                { name: 'nodeBloomStrength', label: 'Node Bloom Strength', type: 'range', value: 0.1, min: 0, max: 1, step: 0.01 },
                { name: 'nodeBloomRadius', label: 'Node Bloom Radius', type: 'range', value: 0.1, min: 0, max: 1, step: 0.01 },
                { name: 'nodeBloomThreshold', label: 'Node Bloom Threshold', type: 'range', value: 0, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomStrength', label: 'Edge Bloom Strength', type: 'range', value: 0.2, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomRadius', label: 'Edge Bloom Radius', type: 'range', value: 0.3, min: 0, max: 1, step: 0.01 },
                { name: 'edgeBloomThreshold', label: 'Edge Bloom Threshold', type: 'range', value: 0, min: 0, max: 1, step: 0.01 },
                { name: 'environmentBloomStrength', label: 'Environment Bloom Strength', type: 'range', value: 0.5, min: 0, max: 2, step: 0.01 },
                { name: 'environmentBloomRadius', label: 'Environment Bloom Radius', type: 'range', value: 0.1, min: 0, max: 2, step: 0.01 },
                { name: 'environmentBloomThreshold', label: 'Environment Bloom Threshold', type: 'range', value: 0, min: 0, max: 1, step: 0.01 },
            ],
            // Force-directed graph controls
            forceDirectedControls: {
                iterations: { value: 100, min: 10, max: 500, step: 10 },
                springForce: { value: 0.5, min: 0, max: 1, step: 0.01 },
            },
            // Additional controls mapped to settings.toml
            additionalControls: [
                { name: 'labelFontSize', label: 'Label Font Size', type: 'range', value: 36, min: 12, max: 72, step: 1 },
                { name: 'fogDensity', label: 'Fog Density', type: 'range', value: 0.002, min: 0, max: 0.01, step: 0.0001 },
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
        resetControls() {
            this.colorControls.forEach(control => {
                control.value = this.getDefaultValue(control.name);
                this.emitChange(control.name, control.value);
            });
            this.sizeOpacityControls.forEach(control => {
                control.value = this.getDefaultValue(control.name);
                this.emitChange(control.name, control.value);
            });
            this.bloomControls.forEach(control => {
                control.value = this.getDefaultValue(control.name);
                this.emitChange(control.name, control.value);
            });
            this.forceDirectedControls.iterations.value = this.getDefaultValue('forceDirectedIterations');
            this.emitChange('forceDirectedIterations', this.forceDirectedControls.iterations.value);
            this.forceDirectedControls.springForce.value = 0.5;
            this.updateSpringForce();
            this.additionalControls.forEach(control => {
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
                nodeSizeScalingFactor: 5,
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
                environmentBloomStrength: 0.5,
                environmentBloomRadius: 0.1,
                environmentBloomThreshold: 0,
                forceDirectedIterations: 100,
            };
            return defaults[name] || '';
        },
        toggleFullscreen() {
            this.$emit('toggle-fullscreen');
        },
        enableSpacemouse() {
            this.$emit('enable-spacemouse');
        },
        updateSpringForce() {
            const springForce = this.forceDirectedControls.springForce.value;
            const repulsion = 1 + springForce;
            const attraction = 0.1 - (springForce * 0.09);
            
            this.emitChange('forceDirectedRepulsion', repulsion);
            this.emitChange('forceDirectedAttraction', attraction);
            
            console.log(`Spring Force updated: ${springForce}, Repulsion: ${repulsion}, Attraction: ${attraction}`);
        }
    },
    mounted() {
        this.visualization = inject('visualization');
    }
});
</script>

<style scoped>
/* Styles remain unchanged */
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

