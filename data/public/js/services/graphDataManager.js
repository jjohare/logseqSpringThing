// public/js/services/graphDataManager.js

import { EventEmitter } from '../utils/eventEmitter.js';

export class GraphDataManager extends EventEmitter {
    /**
     * Creates a new GraphDataManager instance.
     * @param {WebsocketService} websocketService - The WebSocket service instance.
     */
    constructor(websocketService) {
        super();
        this.websocketService = websocketService;
        this.graphData = null;
        this.forceDirectedParams = {
            iterations: 100,
            repulsion: 1.0,
            attraction: 0.01
        };
        this.useRemoteSimulation = false;

        // Set up WebSocket message listener
        this.websocketService.on('message', this.handleWebSocketMessage.bind(this));
    }

    /**
     * Validates the graph data received.
     * @param {Object} data - The graph data to validate.
     * @returns {boolean} True if valid, false otherwise.
     */
    isGraphDataValid(data = this.graphData) {
        // Implement validation logic
        return data && Array.isArray(data.nodes) && Array.isArray(data.edges);
    }

    /**
     * Updates the graph data.
     * @param {Object} newData - The new graph data.
     */
    updateGraphData(newData) {
        if (this.isGraphDataValid(newData)) {
            this.graphData = newData;
            this.emit('graphDataUpdated', this.graphData);
        } else {
            console.error('Received invalid graph data');
            this.emit('graphDataError', new Error('Invalid graph data received'));
        }
    }

    /**
     * Retrieves the current graph data.
     * @returns {Object} The current graph data.
     */
    getGraphData() {
        return this.graphData;
    }

    /**
     * Retrieves the nodes from the graph data.
     * @returns {Array} The nodes array.
     */
    getNodes() {
        return this.graphData ? this.graphData.nodes : [];
    }

    /**
     * Retrieves the edges from the graph data.
     * @returns {Array} The edges array.
     */
    getEdges() {
        return this.graphData ? this.graphData.edges : [];
    }

    /**
     * Enables remote simulation by notifying the server.
     */
    enableRemoteSimulation() {
        this.useRemoteSimulation = true;
        this.websocketService.send({
            type: 'setSimulationMode',
            mode: 'remote'
        });
        console.log('Remote simulation enabled');
    }

    /**
     * Disables remote simulation by notifying the server.
     */
    disableRemoteSimulation() {
        this.useRemoteSimulation = false;
        this.websocketService.send({
            type: 'setSimulationMode',
            mode: 'local'
        });
        console.log('Remote simulation disabled');
    }

    /**
     * Handles incoming WebSocket messages.
     * @param {Object} message - The received message.
     */
    handleWebSocketMessage(message) {
        const data = JSON.parse(message);
        switch (data.type) {
            case 'graphUpdate':
                this.updateGraphData(data.graphData);
                break;
            case 'remoteSimulationUpdate':
                this.updateGraphData(data.graphData);
                break;
            case 'initialData':
                this.updateGraphData(data.graphData);
                break;
            default:
                console.warn(`Unhandled message type: ${data.type}`);
        }
    }

    /**
     * Recalculates the graph layout using the current force-directed parameters.
     */
    recalculateLayout() {
        if (this.isGraphDataValid()) {
            this.websocketService.send({
                type: 'recalculateLayout',
                params: this.forceDirectedParams
            });
            
            window.dispatchEvent(new CustomEvent('layoutRecalculationRequested', {
                detail: this.forceDirectedParams
            }));
        } else {
            console.error('Cannot recalculate layout: Invalid graph data');
            window.dispatchEvent(new CustomEvent('graphDataError', { detail: new Error('Invalid graph data for layout recalculation') }));
        }
    }
}
