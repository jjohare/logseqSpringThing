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
        
        // Set up WebSocket graph update listener
        this.websocketService.on('graphUpdate', this.handleGraphUpdate.bind(this));
    }

    /**
     * Requests the initial graph data from the server via WebSocket.
     */
    requestInitialData() {
        console.log('Requesting initial graph data');
        this.websocketService.send({ type: 'get_initial_data' });
    }

    /**
     * Handles incoming graph update messages.
     * @param {object} data - The received graph data.
     */
    handleGraphUpdate(data) {
        console.log('Processing graph update:', data);
        if (!data || !data.graphData) {
            console.error('Invalid graph update data received:', data);
            return;
        }
        this.updateGraphData(data.graphData);
    }

    /**
     * Updates the internal graph data with new data received from the server.
     * @param {object} newData - The new graph data.
     */
    updateGraphData(newData) {
        console.log('Updating graph data with:', newData);
        
        if (!newData) {
            console.error('Received null or undefined graph data');
            return;
        }

        // Handle the case where newData already has nodes and edges arrays
        if (Array.isArray(newData.nodes) && Array.isArray(newData.edges)) {
            this.graphData = {
                nodes: newData.nodes,
                edges: newData.edges,
                metadata: newData.metadata || {}
            };
        }
        // Handle the case where we need to construct nodes from edges
        else if (Array.isArray(newData.edges)) {
            const nodes = new Set();
            newData.edges.forEach(edge => {
                nodes.add(edge.source);
                nodes.add(edge.target_node);
            });

            this.graphData = {
                nodes: Array.from(nodes).map(id => ({ id, label: id })),
                edges: newData.edges.map(e => ({
                    source: e.source,
                    target: e.target_node,
                    weight: e.weight,
                    hyperlinks: e.hyperlinks
                })),
                metadata: newData.metadata || {}
            };
        } else {
            console.error('Received invalid graph data:', newData);
            return;
        }

        console.log(`Graph data updated: ${this.graphData.nodes.length} nodes, ${this.graphData.edges.length} edges`);
        
        // Log some sample data
        if (this.graphData.nodes.length > 0) {
            console.log('Sample node:', this.graphData.nodes[0]);
        }
        if (this.graphData.edges.length > 0) {
            console.log('Sample edge:', this.graphData.edges[0]);
        }
        
        // Dispatch an event to notify that the graph data has been updated
        window.dispatchEvent(new CustomEvent('graphDataUpdated', { detail: this.graphData }));
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
        return this.graphData && 
               Array.isArray(this.graphData.nodes) && 
               Array.isArray(this.graphData.edges) &&
               this.graphData.nodes.length > 0;
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
            // Send a message to the server to recalculate the layout
            this.websocketService.send({
                type: 'recalculate_layout',
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
