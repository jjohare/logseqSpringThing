import { createApp, provide, inject, onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import ChatManager from './components/ChatManager.vue';
import { WebXRVisualization } from './visualization/WebXRVisualization.js';
import { WebsocketService } from './services/websocketService.js';
import { GraphDataManager } from './services/graphDataManager.js';
import { enableSpacemouse } from './services/spacemouse.js';
import * as THREE from 'three';

// TODO: The following utility files are currently unused but preserved for potential future use:
// - utils/colorUtils.js: Contains functions for calculating node and edge colors.
// - utils/gpuUtils.js: Contains utilities for GPU-accelerated computations.
// - utils/labelUtils.js: Contains functions for creating and managing node labels.
// - utils/postProcessing.js: Placeholder for post-processing effects.
// - utils/sizeUtils.js: Contains utilities for calculating sizes of graph elements.
// Consider integrating these utilities when implementing new features or optimizations.

class App {
    constructor() {
        this.websocketService = new WebsocketService();
        this.graphDataManager = new GraphDataManager(this.websocketService);
        this.visualization = null;
        this.simulationMode = 'local'; // Default to local
        this.renderer = new THREE.WebGLRenderer({ antialias: true }); // Initialize renderer
        this.setupWebsocketListeners = this.setupWebsocketListeners.bind(this);
        this.initializeApp();
    }

    initializeApp() {
        this.initVueApp();
        this.setupEventListeners();
    }

    /**
     * Sets up the Vue application and provides necessary services and methods.
     */
    initVueApp() {
        const app = createApp({
            setup: () => {
                provide('websocketService', this.websocketService);
                provide('graphDataManager', this.graphDataManager);
                provide('renderer', this.renderer);
                provide('simulationMode', this.simulationMode);
                
                onMounted(() => {
                    this.setupWebsocketListeners();
                });

                return {
                    websocketService: this.websocketService,
                    graphDataManager: this.graphDataManager
                };
            },
            components: {
                ControlPanel
            },
            template: `
                <div>
                    <control-panel 
                        @renderModeChange="handleRenderModeChange" 
                        @simulationModeChange="handleSimulationModeChange"
                    ></control-panel>
                </div>
            `,
            methods: {
                handleRenderModeChange(mode) {
                    this.renderMode = mode;
                    if (this.visualization) {
                        this.visualization.switchSimulationMode(mode);
                    } else {
                        console.warn('Visualization not initialized yet');
                    }
                },
                handleSimulationModeChange(mode) {
                    this.simulationMode = mode;
                    if (this.visualization) {
                        this.visualization.switchSimulationMode(mode);
                    }
                    if (mode === 'remote') {
                        this.graphDataManager.enableRemoteSimulation();
                    } else {
                        this.graphDataManager.disableRemoteSimulation();
                    }
                    console.log(`Simulation mode is now: ${mode}`);
                }
            }
        });

        app.config.errorHandler = (err, vm, info) => {
            console.error('Vue Error:', err, info);
        };

        app.config.warnHandler = (msg, vm, trace) => {
            console.warn('Vue Warning:', msg, trace);
        };

        app.mount('#app');
    }

    /**
     * Sets up global event listeners and WebSocket event handlers.
     */
    setupEventListeners() {
        window.addEventListener('graphDataUpdated', (event) => {
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.warn('Cannot update visualization: not initialized');
            }
        });

        window.addEventListener('layoutRecalculationRequested', (event) => {
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.warn('Cannot update layout: Visualization not initialized');
            }
        });

        window.addEventListener('spacemouse-move', (event) => {
            const { x, y, z, rx, ry, rz } = event.detail;
            if (this.visualization) {
                this.visualization.handleSpacemouseInput(x, y, z, rx, ry, rz);
            } else {
                console.warn('Cannot handle Spacemouse input: Visualization not initialized');
            }
        });

        // Add event listener for enable-spacemouse
        this.websocketService.on('enable-spacemouse', () => {
            enableSpacemouse();
        });
    }

    /**
     * Sets up WebSocket listeners for incoming data.
     * This method is now part of the App class and is provided to the Vue component.
     */
    setupWebsocketListeners() {
        this.websocketService.on('graphUpdate', (graphData) => {
            this.graphDataManager.updateGraphData(graphData);
            if (this.visualization && this.simulationMode === 'remote') {
                this.visualization.updateVisualization();
            }
        });

        this.websocketService.on('initialData', (data) => {
            this.graphDataManager.updateGraphData(data);
            if (!this.visualization) {
                this.initVisualization();
            } else {
                this.visualization.updateVisualization();
            }
        });
    }

    /**
     * Initializes the visualization component.
     */
    initVisualization() {
        this.visualization = new WebXRVisualization(this.graphDataManager, this.renderer);
        this.visualization.initThreeJS();
        this.visualization.updateVisualization();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
