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
        this.simulationMode = 'local'; // Default to local simulation

        // Set up WebSocket message listener
        this.websocketService.on('message', this.handleWebSocketMessage.bind(this));
    }

    /**
     * Validates the graph data received.
     * @param {Object} data - The graph data to validate.
     * @returns {boolean} True if valid, false otherwise.
     */
    isGraphDataValid(data = this.graphData) {
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
     * Sets the simulation mode (local or remote).
     * @param {string} mode - The simulation mode ('local' or 'remote').
     */
    setSimulationMode(mode) {
        if (mode !== 'local' && mode !== 'remote') {
            throw new Error('Invalid simulation mode. Must be "local" or "remote".');
        }
        this.simulationMode = mode;
        this.websocketService.send({
            type: 'setSimulationMode',
            mode: this.simulationMode
        });
        console.log(`Simulation mode set to: ${this.simulationMode}`);
        this.emit('simulationModeChanged', this.simulationMode);
    }

    /**
     * Handles incoming WebSocket messages.
     * @param {Object} message - The received message.
     */
    handleWebSocketMessage(message) {
        const data = JSON.parse(message);
        switch (data.type) {
            case 'graphUpdate':
            case 'remoteSimulationUpdate':
            case 'initialData':
                this.updateGraphData(data.graphData);
                break;
            case 'simulationModeConfirmation':
                console.log(`Server confirmed simulation mode: ${data.mode}`);
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
            if (this.simulationMode === 'remote') {
                this.websocketService.send({
                    type: 'recalculateLayout',
                    params: this.forceDirectedParams
                });
            }
            
            this.emit('layoutRecalculationRequested', this.forceDirectedParams);
        } else {
            console.error('Cannot recalculate layout: Invalid graph data');
            this.emit('graphDataError', new Error('Invalid graph data for layout recalculation'));
        }
    }

    /**
     * Updates the force-directed parameters.
     * @param {Object} newParams - The new force-directed parameters.
     */
    updateForceDirectedParams(newParams) {
        this.forceDirectedParams = { ...this.forceDirectedParams, ...newParams };
        console.log('Updated force-directed parameters:', this.forceDirectedParams);
        this.emit('forceDirectedParamsUpdated', this.forceDirectedParams);
    }
}
