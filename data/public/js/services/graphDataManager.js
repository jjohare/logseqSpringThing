// public/js/services/graphDataManager.js

/**
 * GraphDataManager handles the management and updating of graph data received from the server.
 */
export class GraphDataManager {
    /**
     * Creates a new GraphDataManager instance.
     * @param {WebsocketService} websocketService - The WebSocket service instance.
     */
    constructor(websocketService) {
        this.websocketService = websocketService;
        this.graphData = null;
        console.log('GraphDataManager initialized');
        
        // Set up WebSocket message listener
        this.websocketService.on('message', this.handleWebSocketMessage.bind(this));
    }

    /**
     * Requests the initial graph data from the server via WebSocket.
     */
    requestInitialData() {
        console.log('Requesting initial graph data');
        this.websocketService.send({ type: 'getInitialData' });
    }

    /**
     * Handles incoming WebSocket messages.
     * @param {object} message - The received WebSocket message.
     */
    handleWebSocketMessage(message) {
        console.log('Received WebSocket message:', message);
        if (message.type === 'graphUpdate') {
            console.log('Processing graph update message:', message.graphData);
            this.updateGraphData(message.graphData);
        } else {
            console.warn('Unhandled WebSocket message type:', message.type);
        }
    }

    /**
     * Updates the internal graph data with new data received from the server.
     * @param {object} newData - The new graph data.
     */
    updateGraphData(newData) {
        console.log('Updating graph data with:', JSON.stringify(newData, null, 2));
        if (newData && Array.isArray(newData.nodes) && Array.isArray(newData.edges)) {
            this.graphData = newData;
            console.log(`Graph data updated: ${newData.nodes.length} nodes, ${newData.edges.length} edges`);
            
            // Log some sample data
            if (newData.nodes.length > 0) {
                console.log('Sample node:', JSON.stringify(newData.nodes[0], null, 2));
            }
            if (newData.edges.length > 0) {
                console.log('Sample edge:', JSON.stringify(newData.edges[0], null, 2));
            }
            
            // Dispatch an event to notify that the graph data has been updated
            window.dispatchEvent(new CustomEvent('graphDataUpdated', { detail: this.graphData }));
        } else {
            console.error('Received invalid graph data:', newData);
        }
    }

    /**
     * Retrieves the current graph data.
     * @returns {object|null} The current graph data or null if not set.
     */
    getGraphData() {
        if (this.graphData) {
            console.log(`Returning graph data: ${this.graphData.nodes.length} nodes, ${this.graphData.edges.length} edges`);
        } else {
            console.warn('Graph data is null');
        }
        return this.graphData;
    }

    /**
     * Checks if the graph data is valid.
     * @returns {boolean} True if the graph data is valid, false otherwise.
     */
    isGraphDataValid() {
        return this.graphData && Array.isArray(this.graphData.nodes) && Array.isArray(this.graphData.edges);
    }
}
