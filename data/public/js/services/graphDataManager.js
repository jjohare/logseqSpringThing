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
        this.forceDirectedParams = {
            iterations: 100,
            repulsion: 1.0,
            attraction: 0.01
        };
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

            console.log(`Graph data updated: ${this.graphData.nodes.length} nodes, ${this.graphData.edges.length} edges`);
            
            // Log some sample data
            if (this.graphData.nodes.length > 0) {
                console.log('Sample node:', JSON.stringify(this.graphData.nodes[0], null, 2));
            }
            if (this.graphData.edges.length > 0) {
                console.log('Sample edge:', JSON.stringify(this.graphData.edges[0], null, 2));
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

    /**
     * Updates the force-directed graph parameters.
     * @param {string} name - The name of the parameter to update.
     * @param {number} value - The new value for the parameter.
     */
    updateForceDirectedParams(name, value) {
        console.log(`Updating force-directed parameter: ${name} = ${value}`);
        if (name in this.forceDirectedParams) {
            this.forceDirectedParams[name] = value;
            console.log('Force-directed parameters updated:', this.forceDirectedParams);
        } else {
            console.warn(`Unknown force-directed parameter: ${name}`);
        }
    }

    /**
     * Recalculates the graph layout using the current force-directed parameters.
     */
    recalculateLayout() {
        console.log('Recalculating graph layout with parameters:', this.forceDirectedParams);
        if (this.isGraphDataValid()) {
            // Here, you would typically send a message to the server to recalculate the layout
            // For now, we'll just log the action and dispatch an event
            this.websocketService.send({
                type: 'recalculateLayout',
                params: this.forceDirectedParams
            });
            console.log('Layout recalculation requested');
            
            // Dispatch an event to notify that a layout recalculation has been requested
            window.dispatchEvent(new CustomEvent('layoutRecalculationRequested', {
                detail: this.forceDirectedParams
            }));
        } else {
            console.error('Cannot recalculate layout: Invalid graph data');
        }
    }
}
