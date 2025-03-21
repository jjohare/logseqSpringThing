import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
const logger = createLogger('GraphDataManager');
class GraphDataManager {
    constructor() {
        this.data = { nodes: [], edges: [] };
        this.binaryUpdatesEnabled = false;
        this.webSocketService = null;
        this.graphDataListeners = [];
        this.positionUpdateListeners = [];
        this.lastBinaryUpdateTime = 0;
        this.retryTimeout = null;
        this.nodePositionBuffer = null;
        this.nodeIdMap = new Map();
        this.reverseNodeIdMap = new Map();
        // Private constructor for singleton
    }
    static getInstance() {
        if (!GraphDataManager.instance) {
            GraphDataManager.instance = new GraphDataManager();
        }
        return GraphDataManager.instance;
    }
    // Set WebSocket service for sending binary updates
    setWebSocketService(service) {
        this.webSocketService = service;
        if (debugState.isDataDebugEnabled()) {
            logger.debug('WebSocket service set');
        }
    }
    // Fetch initial graph data from the API
    async fetchInitialData() {
        try {
            if (debugState.isEnabled()) {
                logger.info('Fetching initial graph data');
            }
            const response = await fetch('/api/graph/data');
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            const data = await response.json();
            this.setGraphData(data);
            if (debugState.isEnabled()) {
                logger.info(`Loaded initial graph data: ${this.data.nodes.length} nodes, ${this.data.edges.length} edges`);
            }
            return this.data;
        }
        catch (error) {
            logger.error('Failed to fetch initial graph data:', createErrorMetadata(error));
            throw error;
        }
    }
    // Set graph data and notify listeners
    setGraphData(data) {
        this.data = data;
        // Reset ID maps
        this.nodeIdMap.clear();
        this.reverseNodeIdMap.clear();
        // Create mappings between string IDs and numeric IDs
        this.data.nodes.forEach((node, index) => {
            const numericId = parseInt(node.id, 10);
            if (!isNaN(numericId)) {
                // If the ID can be parsed as a number, use it directly
                this.nodeIdMap.set(node.id, numericId);
                this.reverseNodeIdMap.set(numericId, node.id);
            }
            else {
                // For non-numeric IDs, use the index + 1 as the numeric ID
                // We add 1 to avoid using 0 as an ID
                const mappedId = index + 1;
                this.nodeIdMap.set(node.id, mappedId);
                this.reverseNodeIdMap.set(mappedId, node.id);
            }
        });
        // Prepare buffer for binary updates
        this.prepareNodePositionBuffer();
        // Notify listeners
        this.notifyGraphDataListeners();
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Graph data updated: ${data.nodes.length} nodes, ${data.edges.length} edges`);
        }
    }
    // Prepare the binary buffer for position updates
    prepareNodePositionBuffer() {
        if (!this.data.nodes.length) {
            return;
        }
        // Each node has an x, y, z position (3 floats) plus its ID (1 float)
        const bufferSize = this.data.nodes.length * 4;
        this.nodePositionBuffer = new Float32Array(bufferSize);
        // Initialize buffer with current positions
        this.data.nodes.forEach((node, index) => {
            const baseIndex = index * 4;
            // Use the numeric ID from the map
            const numericId = this.nodeIdMap.get(node.id) || index + 1;
            this.nodePositionBuffer[baseIndex] = numericId;
            this.nodePositionBuffer[baseIndex + 1] = node.position.x;
            this.nodePositionBuffer[baseIndex + 2] = node.position.y;
            this.nodePositionBuffer[baseIndex + 3] = node.position.z;
        });
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Prepared position buffer for ${this.data.nodes.length} nodes with ID mapping`);
        }
    }
    // Enable binary updates and start the retry mechanism
    enableBinaryUpdates() {
        if (!this.webSocketService) {
            logger.warn('Cannot enable binary updates: WebSocket service not set');
            return;
        }
        // If WebSocket is already ready, enable binary updates immediately
        if (this.webSocketService.isReady()) {
            this.setBinaryUpdatesEnabled(true);
            return;
        }
        // Otherwise, start a retry mechanism
        if (this.retryTimeout) {
            window.clearTimeout(this.retryTimeout);
        }
        this.retryTimeout = window.setTimeout(() => {
            if (this.webSocketService && this.webSocketService.isReady()) {
                this.setBinaryUpdatesEnabled(true);
                if (debugState.isEnabled()) {
                    logger.info('WebSocket ready, binary updates enabled');
                }
            }
            else {
                if (debugState.isEnabled()) {
                    logger.info('WebSocket not ready yet, retrying...');
                }
                this.enableBinaryUpdates();
            }
        }, 500);
    }
    setBinaryUpdatesEnabled(enabled) {
        this.binaryUpdatesEnabled = enabled;
        if (enabled && !this.nodePositionBuffer) {
            this.prepareNodePositionBuffer();
        }
        if (debugState.isEnabled()) {
            logger.info(`Binary updates ${enabled ? 'enabled' : 'disabled'}`);
        }
    }
    // Get current graph data
    getGraphData() {
        return this.data;
    }
    // Add a node to the graph
    addNode(node) {
        // Check if node with this ID already exists
        const existingIndex = this.data.nodes.findIndex(n => n.id === node.id);
        if (existingIndex >= 0) {
            // Update existing node
            this.data.nodes[existingIndex] = {
                ...this.data.nodes[existingIndex],
                ...node
            };
        }
        else {
            // Add new node
            this.data.nodes.push(node);
            // Resize position buffer if needed
            this.prepareNodePositionBuffer();
        }
        this.notifyGraphDataListeners();
    }
    // Add an edge to the graph
    addEdge(edge) {
        // Check if edge with this ID already exists
        const existingIndex = this.data.edges.findIndex(e => e.id === edge.id);
        if (existingIndex >= 0) {
            // Update existing edge
            this.data.edges[existingIndex] = {
                ...this.data.edges[existingIndex],
                ...edge
            };
        }
        else {
            // Add new edge
            this.data.edges.push(edge);
        }
        this.notifyGraphDataListeners();
    }
    // Remove a node from the graph
    removeNode(nodeId) {
        // Remove node
        this.data.nodes = this.data.nodes.filter(node => node.id !== nodeId);
        // Remove all edges connected to this node
        this.data.edges = this.data.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId);
        // Prepare new buffer for binary updates
        this.prepareNodePositionBuffer();
        this.notifyGraphDataListeners();
    }
    // Remove an edge from the graph
    removeEdge(edgeId) {
        this.data.edges = this.data.edges.filter(edge => edge.id !== edgeId);
        this.notifyGraphDataListeners();
    }
    // Update node positions from binary data
    updateNodePositions(positionData) {
        if (!positionData || positionData.length === 0) {
            return;
        }
        // Check if this is a duplicate update (can happen with WebSocket)
        const now = Date.now();
        if (now - this.lastBinaryUpdateTime < 16) { // Less than 16ms (60fps)
            if (debugState.isDataDebugEnabled()) {
                logger.debug('Skipping duplicate position update');
            }
            return;
        }
        this.lastBinaryUpdateTime = now;
        // Process position data (4 values per node: id, x, y, z)
        for (let i = 0; i < positionData.length; i += 4) {
            const numericId = positionData[i];
            const x = positionData[i + 1];
            const y = positionData[i + 2];
            const z = positionData[i + 3];
            // Convert numeric ID back to string ID using the reverse map
            const nodeId = this.reverseNodeIdMap.get(numericId);
            if (nodeId) {
                // Find and update the node
                const nodeIndex = this.data.nodes.findIndex(node => node.id === nodeId);
                if (nodeIndex >= 0) {
                    this.data.nodes[nodeIndex].position = { x, y, z };
                }
            }
        }
        // Notify position update listeners
        this.notifyPositionUpdateListeners(positionData);
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Updated ${positionData.length / 4} node positions`);
        }
    }
    // Send node positions to the server via WebSocket
    sendNodePositions() {
        if (!this.binaryUpdatesEnabled || !this.webSocketService || !this.nodePositionBuffer) {
            return;
        }
        // Update the buffer with current positions
        this.data.nodes.forEach((node, index) => {
            const baseIndex = index * 4;
            const numericId = this.nodeIdMap.get(node.id) || index + 1;
            this.nodePositionBuffer[baseIndex] = numericId;
            this.nodePositionBuffer[baseIndex + 1] = node.position.x;
            this.nodePositionBuffer[baseIndex + 2] = node.position.y;
            this.nodePositionBuffer[baseIndex + 3] = node.position.z;
        });
        try {
            // Send the buffer via WebSocket
            this.webSocketService.send(this.nodePositionBuffer.buffer);
            if (debugState.isDataDebugEnabled()) {
                logger.debug(`Sent positions for ${this.data.nodes.length} nodes with ID mapping`);
            }
        }
        catch (error) {
            logger.error('Error sending node positions:', createErrorMetadata(error));
        }
    }
    // Add listener for graph data changes
    onGraphDataChange(listener) {
        this.graphDataListeners.push(listener);
        // Call immediately with current data
        listener(this.data);
        // Return unsubscribe function
        return () => {
            this.graphDataListeners = this.graphDataListeners.filter(l => l !== listener);
        };
    }
    // Add listener for position updates
    onPositionUpdate(listener) {
        this.positionUpdateListeners.push(listener);
        // Return unsubscribe function
        return () => {
            this.positionUpdateListeners = this.positionUpdateListeners.filter(l => l !== listener);
        };
    }
    // Notify all graph data listeners
    notifyGraphDataListeners() {
        this.graphDataListeners.forEach(listener => {
            try {
                listener(this.data);
            }
            catch (error) {
                logger.error('Error in graph data listener:', createErrorMetadata(error));
            }
        });
    }
    // Notify all position update listeners
    notifyPositionUpdateListeners(positions) {
        this.positionUpdateListeners.forEach(listener => {
            try {
                listener(positions);
            }
            catch (error) {
                logger.error('Error in position update listener:', createErrorMetadata(error));
            }
        });
    }
    // Clean up resources
    dispose() {
        if (this.retryTimeout) {
            window.clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        this.graphDataListeners = [];
        this.positionUpdateListeners = [];
        this.webSocketService = null;
        this.nodePositionBuffer = null;
        if (debugState.isEnabled()) {
            logger.info('GraphDataManager disposed');
        }
    }
}
// Create singleton instance
export const graphDataManager = GraphDataManager.getInstance();
