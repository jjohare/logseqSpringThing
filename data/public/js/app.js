import { createApp, provide, inject, onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import ChatManager from './components/ChatManager.vue';
import { WebXRVisualization } from './visualization/WebXRVisualization.js';
import { WebsocketService } from './services/websocketService.js';
import { GraphDataManager } from './services/graphDataManager.js';
import { enableSpacemouse } from './services/spacemouse.js';
import { WebGLRenderer } from 'three';
import { isGPUAvailable, initGPUCompute } from './gpuUtils.js';

console.log('App.js: Starting initialization');

class App {
    constructor() {
        console.log('App: Constructor called');
        this.websocketService = new WebsocketService();
        console.log('App: WebsocketService created');
        this.graphDataManager = new GraphDataManager(this.websocketService);
        console.log('App: GraphDataManager created');
        this.visualization = null;
        this.gpuCompute = null;
        this.simulationMode = 'cpu'; // Default simulation mode
        this.renderer = new WebGLRenderer({ antialias: true }); // Initialize renderer
        console.log('App: THREE.WebGLRenderer created');
        this.setupWebsocketListeners = this.setupWebsocketListeners.bind(this);
        this.initializeApp();
    }

    initializeApp() {
        console.log('App: Initializing app');
        this.initGPU();
        this.initVueApp();
        this.setupEventListeners();
    }

    initGPU() {
        // Initialize GPU if available
        this.gpuAvailable = isGPUAvailable(this.renderer);
        if (this.gpuAvailable) {
            this.gpuCompute = initGPUCompute(1024, 1024, this.renderer); // Adjust dimensions as needed
            console.log('GPU computation initialized');
        } else {
            console.warn('GPU acceleration not available, using CPU fallback');
        }
    }

    initVueApp() {
        console.log('App: Initializing Vue app');
        const app = createApp({
            setup: () => {
                console.log('App: Vue app setup function called');
                provide('websocketService', this.websocketService);
                provide('graphDataManager', this.graphDataManager);
                provide('renderer', this.renderer);
                provide('simulationMode', this.simulationMode);
                
                onMounted(() => {
                    console.log('App: Vue app mounted');
                    this.setupWebsocketListeners();
                });

                return {
                    websocketService: this.websocketService,
                    graphDataManager: this.graphDataManager
                };
            },
            components: {
                ControlPanel,
                ChatManager
            },
            template: `
                <div>
                    <chat-manager :websocketService="websocketService"></chat-manager>
                    <control-panel 
                        :websocketService="websocketService"
                        :gpuAvailable="gpuAvailable"
                        @control-change="handleControlChange"
                        @toggle-fullscreen="toggleFullscreen"
                        @enable-spacemouse="enableSpacemouse"
                    ></control-panel>
                </div>
            `,
            methods: {
                handleControlChange(data) {
                    console.log('Control changed:', data.name, data.value);
                    if (this.visualization) {
                        console.log('Updating visualization:', data);
                        
                        if (data.name === 'simulationMode') {
                            this.visualization.switchSimulationMode(data.value);
                        } else if (data.name === 'forceDirectedIterations' || 
                            data.name === 'forceDirectedRepulsion' || 
                            data.name === 'forceDirectedAttraction') {
                            this.updateForceDirectedParams(data.name, data.value);
                        } else {
                            // Handle other visual features
                            this.visualization.updateVisualFeatures({ [data.name]: data.value });
                        }
                    } else {
                        console.error('Cannot update visualization: not initialized');
                    }
                },
                updateForceDirectedParams(name, value) {
                    if (this.graphDataManager) {
                        // Update the force-directed parameters in the graph data manager
                        this.graphDataManager.updateForceDirectedParams(name, value);
                        
                        // Trigger a recalculation of the graph layout
                        this.graphDataManager.recalculateLayout();
                        
                        // Update the visualization with the new layout
                        if (this.visualization) {
                            this.visualization.updateVisualization();
                        }
                    } else {
                        console.error('Cannot update force-directed parameters: GraphDataManager not initialized');
                    }
                },
                toggleFullscreen() {
                    const elem = document.documentElement;
                    if (!document.fullscreenElement) {
                        elem.requestFullscreen().catch(err => {
                            console.error(`Error attempting to enable fullscreen: ${err.message}`);
                        });
                    } else {
                        document.exitFullscreen();
                    }
                },
                enableSpacemouse() {
                    enableSpacemouse();
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
        console.log('App: Vue app mounted to #app');
    }

    setupEventListeners() {
        console.log('App: Setting up event listeners');
        window.addEventListener('graphDataUpdated', (event) => {
            console.log('App: graphDataUpdated event received');
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.warn('Cannot update visualization: not initialized');
            }
        });

        window.addEventListener('layoutRecalculationRequested', (event) => {
            console.log('App: layoutRecalculationRequested event received');
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.warn('Cannot update layout: Visualization not initialized');
            }
        });

        window.addEventListener('spacemouse-move', (event) => {
            console.log('App: spacemouse-move event received');
            const { x, y, z, rx, ry, rz } = event.detail;
            if (this.visualization) {
                this.visualization.handleSpacemouseInput(x, y, z, rx, ry, rz);
            } else {
                console.warn('Cannot handle Spacemouse input: Visualization not initialized');
            }
        });
    }

    setupWebsocketListeners() {
        console.log('App: Setting up WebSocket listeners');
        this.websocketService.on('open', () => {
            console.log('WebSocket connection opened');
            // You can add any initialization logic here
        });

        this.websocketService.on('error', (error) => {
            console.error('WebSocket error:', error);
            // Handle WebSocket errors
        });

        this.websocketService.on('close', () => {
            console.log('WebSocket connection closed');
            // Handle WebSocket closure
        });

        this.websocketService.on('graphUpdate', (graphData) => {
            console.log('App: graphUpdate event received');
            this.graphDataManager.updateGraphData(graphData);
            if (this.visualization && this.simulationMode === 'remote') {
                this.visualization.updateVisualization();
            }
        });

        this.websocketService.on('initialData', (data) => {
            console.log('App: initialData event received');
            this.graphDataManager.updateGraphData(data);
            if (!this.visualization) {
                this.initVisualization();
            } else {
                this.visualization.updateVisualization();
            }
        });
    }

    initVisualization() {
        console.log('App: Initializing visualization');
        try {
            this.visualization = new WebXRVisualization(this.graphDataManager, this.renderer, this.gpuCompute);
            console.log('App: WebXRVisualization created');
            this.visualization.initThreeJS();
            console.log('App: Three.js initialized');
            this.visualization.updateVisualization();
            console.log('App: Visualization updated');
        } catch (error) {
            console.error('Error initializing visualization:', error);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    new App();
});

console.log('App.js: Finished loading');
