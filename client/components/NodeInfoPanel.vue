<template>
  <div 
    v-if="nodeData"
    class="node-info-panel"
  >
    <h3>Node Information</h3>
    <p><strong>ID:</strong> {{ nodeData.id }}</p>
    <p v-if="nodeData.label"><strong>Name:</strong> {{ nodeData.label }}</p>
    <template v-if="nodeData.metadata">
      <div v-for="(value, key) in nodeData.metadata" :key="key" class="metadata-item">
        <strong>{{ formatKey(key) }}:</strong> {{ formatValue(value) }}
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useVisualizationStore } from '../stores/visualization';
import type { Node } from '../types/core';

export default defineComponent({
  name: 'NodeInfoPanel',
  
  setup() {
    const store = useVisualizationStore();
    
    const nodeData = computed(() => {
      if (!store.selectedNode) return null;
      return store.getNodeById(store.selectedNode);
    });

    const formatKey = (key: string) => {
      return key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    const formatValue = (value: any) => {
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return value;
    };

    return {
      nodeData,
      formatKey,
      formatValue
    };
  }
});
</script>

<style scoped>
.node-info-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 300px;
  max-height: 40vh;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  overflow-y: auto;
}

.metadata-item {
  margin: 5px 0;
}

h3 {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 1.2em;
}

p {
  margin: 8px 0;
}

strong {
  font-weight: 600;
}
</style>
