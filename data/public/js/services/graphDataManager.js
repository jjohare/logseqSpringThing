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
        this.graphData = {
            nodes: [],
            edges: []
        };
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
    isGraphDataValid(data) {
        try {
            if (!data || typeof data !== 'object') {
                console.error('Graph data is null or not an object');
                return false;
            }

            if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
                console.error('Graph data nodes or edges are not arrays');
                return false;
            }

            // Validate nodes
            const validNodes = data.nodes.every(node => {
                if (!node || typeof node !== 'object') {
                    console.error('Invalid node object:', node);
                    return false;
                }
                if (!node.name || typeof node.name !== 'string') {
                    console.error('Node missing required name property:', node);
                    return false;
                }
                return true;
            });

            if (!validNodes) return false;

            // Validate edges
            const validEdges = data.edges.every(edge => {
                if (!edge || typeof edge !== 'object') {
                    console.error('Invalid edge object:', edge);
                    return false;
                }
                if (!edge.source || !edge.target) {
                    console.error('Edge missing required source/target properties:', edge);
                    return false;
                }
                // Verify edge endpoints exist in nodes
                const sourceExists = data.nodes.some(n => n.name === edge.source);
                const targetExists = data.nodes.some(n => n.name === edge.target);
                if (!sourceExists || !targetExists) {
                    console.error('Edge references non-existent node:', edge);
                    return false;
                }
                return true;
            });

            return validEdges;
        } catch (error) {
            console.error('Error validating graph data:', error);
            return false;
        }
    }

    /**
     * Updates the graph data.
     * @param {Object} newData - The new graph data.
     */
    updateGraphData(newData) {
        if (this.isGraphDataValid(newData)) {
            // Deep clone the data to prevent external modifications
            this.graphData = {
                nodes: JSON.parse(JSON.stringify(newData.nodes)),
                edges: JSON.parse(JSON.stringify(newData.edges))
            };
            
            // Initialize positions if not present
            this.graphData.nodes.forEach(node => {
                if (!node.position) {
                    node.position = {
                        x: (Math.random() - 0.5) * 100,
                        y: (Math.random() - 0.5) * 100,
                        z: (Math.random() - 0.5) * 100
                    };
                }
            });

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
        return this.graphData.nodes;
    }

    /**
     * Retrieves the edges from the graph data.
     * @returns {Array} The edges array.
     */
    getEdges() {
        return this.graphData.edges;
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
        this.emit('simulationModeChanged', this.simulationMode);
    }

    /**
     * Handles incoming WebSocket messages.
     * @param {Object|string} message - The received message.
     */
    handleWebSocketMessage(message) {
        try {
            const data = typeof message === 'string' ? JSON.parse(message) : message;
            
            switch (data.type) {
                case 'graphUpdate':
                case 'remoteSimulationUpdate':
                case 'initialData':
                    if (data.graphData) {
                        this.updateGraphData(data.graphData);
                    } else {
                        console.error('Message missing graphData:', data);
                    }
                    break;
                case 'simulationModeConfirmation':
                    // Mode confirmed by server
                    break;
                default:
                    console.warn(`Unhandled message type: ${data.type}`);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    /**
     * Recalculates the graph layout using the current force-directed parameters.
     */
    recalculateLayout() {
        if (this.isGraphDataValid(this.graphData)) {
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
        if (typeof newParams !== 'object') {
            console.error('Invalid parameters object:', newParams);
            return;
        }

        // Validate and update each parameter
        Object.entries(newParams).forEach(([key, value]) => {
            if (this.forceDirectedParams.hasOwnProperty(key)) {
                if (typeof value === 'number' && !isNaN(value)) {
                    this.forceDirectedParams[key] = value;
                } else {
                    console.error(`Invalid value for parameter ${key}:`, value);
                }
            } else {
                console.warn(`Unknown parameter: ${key}`);
            }
        });

        this.emit('forceDirectedParamsUpdated', this.forceDirectedParams);
    }
}
