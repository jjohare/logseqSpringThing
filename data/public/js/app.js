// data/public/js/app.js

import { createApp, provide, inject, ref, onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import ChatManager from './components/chatManager.vue';
import { WebXRVisualization } from './components/webXRVisualization.js';
import WebsocketService from './services/websocketService.js';
import { GraphDataManager } from './services/graphDataManager.js';
import { isGPUAvailable, initGPU } from './gpuUtils.js';
import { enableSpacemouse } from './services/spacemouse.js';

class App {
    constructor() {
        console.log('App constructor called');
        this.websocketService = new WebsocketService();
        this.graphDataManager = new GraphDataManager(this.websocketService);
        this.visualization = new WebXRVisualization(this.graphDataManager);
        this.gpuAvailable = false;
        this.gpuUtils = null;
        this.initializeApp();
    }

    initializeApp() {
        console.log('Initializing Application');

        // Initialize GPU if available
        this.gpuAvailable = isGPUAvailable();
        if (this.gpuAvailable) {
            this.gpuUtils = initGPU();
            console.log('GPU acceleration initialized');
        } else {
            console.warn('GPU acceleration not available, using CPU fallback');
        }

        // Initialize Vue App with ChatManager and ControlPanel
        this.initVueApp();

        // Setup Event Listeners
        this.setupEventListeners();

        // Initialize the visualization
        this.visualization.initThreeJS();
    }

    initVueApp() {
        console.log('Initializing Vue App');
        const app = createApp({
            setup: () => {
                provide('websocketService', this.websocketService);
                provide('visualization', this.visualization);
                provide('graphDataManager', this.graphDataManager);

                console.log('Services provided in Vue app setup');

                onMounted(() => {
                    console.log('Vue app mounted');
                    this.websocketService.on('graphUpdate', (graphData) => {
                        console.log('Received graph update from WebSocket');
                        this.graphDataManager.updateGraphData(graphData);
                        window.dispatchEvent(new CustomEvent('graphDataUpdated', { detail: graphData }));
                    });

                    this.websocketService.on('ttsMethodSet', (method) => {
                        console.log('TTS method set:', method);
                    });

                    this.websocketService.on('initialData', (data) => {
                        console.log('Received initial data:', data);
                        this.graphDataManager.updateGraphData(data);
                        this.visualization.updateVisualization();
                    });
                });

                return {
                    websocketService: this.websocketService,
                    visualization: this.visualization,
                    graphDataManager: this.graphDataManager
                };
            },
            components: {
                ControlPanel,
                ChatManager
            },
            template: `
                <div>
                    <chat-manager></chat-manager>
                    <control-panel 
                        @control-change="handleControlChange"
                        @toggle-fullscreen="toggleFullscreen"
                        @enable-spacemouse="enableSpacemouse"
                    ></control-panel>
                </div>
            `,
            methods: {
                handleControlChange(data) {
                    console.log('Control changed:', data.name, data.value);
                    if (this.graphDataManager) {
                        if (['forceDirectedIterations', 'forceDirectedRepulsion', 'forceDirectedAttraction'].includes(data.name)) {
                            this.updateForceDirectedParams(data.name, data.value);
                        } else {
                            // Handle all other control changes
                            this.graphDataManager.updateParameter(data.name, data.value);
                        }
                    } else {
                        console.error('GraphDataManager not available');
                    }
                    if (this.visualization) {
                        this.visualization.updateVisualFeatures({ [data.name]: data.value });
                    }
                },
                updateForceDirectedParams(name, value) {
                    if (this.graphDataManager) {
                        // Update the force-directed parameters in the graph data manager
                        this.graphDataManager.updateForceDirectedParams(name, value);
                        
                        // Trigger a recalculation of the graph layout
                        this.graphDataManager.recalculateLayout();
                        
                        // Update the visualization with the new layout
                        this.visualization.updateVisualization();
                    } else {
                        console.error('Cannot update force-directed parameters: GraphDataManager not initialized');
                    }
                },
                toggleFullscreen() {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch((err) => {
                            console.error(`Error attempting to enable fullscreen: ${err.message}`);
                        });
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen().catch((err) => {
                                console.error(`Error attempting to exit fullscreen: ${err.message}`);
                            });
                        }
                    }
                },
                enableSpacemouse() {
                    if (this.visualization) {
                        enableSpacemouse(this.visualization.handleSpacemouseInput.bind(this.visualization));
                    } else {
                        console.error('Cannot enable Spacemouse: Visualization not initialized');
                    }
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
        console.log('Vue App mounted');
    }

    setupEventListeners() {
        console.log('Setting up event listeners');

        // Custom Event Listener for Graph Data Updates
        window.addEventListener('graphDataUpdated', (event) => {
            console.log('Graph data updated event received', event.detail);
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.error('Cannot update visualization: not initialized');
            }
        });

        // Layout Recalculation Requested Event Listener
        window.addEventListener('layoutRecalculationRequested', (event) => {
            console.log('Layout recalculation requested', event.detail);
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.error('Cannot update layout: Visualization not initialized');
            }
        });

        // Spacemouse Move Event Listener
        window.addEventListener('spacemouse-move', (event) => {
            const { x, y, z, rx, ry, rz } = event.detail;
            if (this.visualization) {
                this.visualization.handleSpacemouseInput(x, y, z, rx, ry, rz);
            } else {
                console.error('Cannot handle Spacemouse input: Visualization not initialized');
            }
        });

        console.log('Event listeners set up');
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = isConnected ? 'connected' : 'disconnected';
        } else {
            console.warn('Connection status element not found');
        }
    }

    start() {
        console.log('Starting the application');
        if (this.visualization) {
            this.visualization.animate();
        } else {
            console.error('Cannot start animation: Visualization not initialized');
        }
        if (this.gpuAvailable) {
            console.log('GPU acceleration is available');
            // Implement GPU-accelerated features here if needed
        } else {
            console.log('GPU acceleration is not available, using CPU fallback');
        }
    }
}

// Initialize the App once the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded, creating App instance');
    const app = new App();
    app.start();
});
