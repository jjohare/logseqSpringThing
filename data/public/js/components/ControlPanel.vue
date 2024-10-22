<template>
  <div id="control-panel" :class="{ hidden: isHidden }">
    <button @click="togglePanel" class="toggle-button">
      {{ isHidden ? '>' : '<' }}
    </button>
    <div class="panel-content" v-show="!isHidden">
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
            @change="emitChange(control.name, colorToInt(control.value))"
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
          <label for="simulation_mode">Simulation Mode</label>
          <select
            id="simulation_mode"
            v-model="simulationMode"
            @change="emitChange('simulationMode', simulationMode)"
          >
            <option value="cpu">CPU</option>
            <option value="gpu" :disabled="!gpuAvailable">GPU</option>
            <option value="remote">Remote</option>
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
            simulationMode: 'cpu', // Default to CPU mode
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
            
            // Update: Reset simulation mode based on availability
            if (this.gpuAvailable) {
                this.simulationMode = 'gpu';
            } else if (this.websocketService.isConnected()) {
                this.simulationMode = 'remote';
            } else {
                this.simulationMode = 'cpu';
            }
            this.emitChange('simulationMode', this.simulationMode);
        },
        toggleFullscreen() {
            this.$emit('toggle-fullscreen');
        },
        enableSpacemouse() {
            this.$emit('enable-spacemouse');
        },
        colorToInt(color) {
            return parseInt(color.replace('#', '0x'), 16);
        },
        intToColor(int) {
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
