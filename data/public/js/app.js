// data/public/js/app.js

import { createApp } from 'vue';
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
        this.websocketService = null;
        this.graphDataManager = null;
        this.visualization = null;
        this.gpuAvailable = false;
        this.gpuUtils = null;
        this.initializeApp();
    }

    initializeApp() {
        console.log('Initializing Application');

        // Initialize Services
        try {
            this.websocketService = new WebsocketService();
            console.log('WebsocketService initialized');
        } catch (error) {
            console.error('Failed to initialize WebsocketService:', error);
        }

        if (this.websocketService) {
            this.graphDataManager = new GraphDataManager(this.websocketService);
            console.log('GraphDataManager initialized');
        } else {
            console.error('Cannot initialize GraphDataManager: WebsocketService is not available');
        }
        
        try {
            this.visualization = new WebXRVisualization(this.graphDataManager);
            console.log('WebXRVisualization initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WebXRVisualization:', error);
        }

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
        if (this.visualization) {
            this.visualization.initThreeJS();
        } else {
            console.error('Visualization not initialized, cannot call initThreeJS');
        }
    }

    initVueApp() {
        console.log('Initializing Vue App');
        const app = createApp({
            components: {
                ControlPanel,
                ChatManager
            },
            data() {
                return {
                    websocketService: null,
                    visualization: null
                };
            },
            template: `
                <div>
                    <chat-manager :websocketService="websocketService"></chat-manager>
                    <control-panel 
                        :websocketService="websocketService"
                        @control-change="handleControlChange"
                        @toggle-fullscreen="toggleFullscreen"
                        @enable-spacemouse="enableSpacemouse"
                    ></control-panel>
                </div>
            `,
            methods: {
                handleControlChange(data) {
                    console.log('Control changed:', data.name, data.value);
                    this.updateVisualization(data);
                },
                updateVisualization(change) {
                    if (this.visualization) {
                        console.log('Updating visualization:', change);
                        this.visualization.updateVisualFeatures({ [change.name]: change.value });
                    } else {
                        console.error('Cannot update visualization: not initialized');
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
            },
            mounted() {
                // Assign the initialized services to the Vue app's data properties
                this.websocketService = app.config.globalProperties.$websocketService;
                this.visualization = app.config.globalProperties.$visualization;
                console.log('Vue app mounted with WebSocketService and Visualization:', this.websocketService, this.visualization);
            }
        });

        app.config.errorHandler = (err, vm, info) => {
            console.error('Vue Error:', err, info);
        };

        app.config.warnHandler = (msg, vm, trace) => {
            console.warn('Vue Warning:', msg, trace);
        };

        if (this.websocketService) {
            app.config.globalProperties.$websocketService = this.websocketService;
        } else {
            console.error('WebsocketService not available for Vue app');
        }

        if (this.visualization) {
            app.config.globalProperties.$visualization = this.visualization;
        } else {
            console.error('Visualization not available for Vue app');
        }

        app.mount('#app');
        console.log('Vue App mounted');
    }

    setupEventListeners() {
        console.log('Setting up event listeners');

        if (this.websocketService) {
            // WebSocket Event Listeners
            this.websocketService.on('open', () => {
                console.log('WebSocket connection established');
                this.updateConnectionStatus(true);
                if (this.graphDataManager) {
                    this.graphDataManager.requestInitialData();
                } else {
                    console.error('GraphDataManager not initialized, cannot request initial data');
                }
            });

            this.websocketService.on('message', (data) => {
                console.log('WebSocket message received:', data);
                this.handleWebSocketMessage(data);
            });

            this.websocketService.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus(false);
            });

            this.websocketService.on('close', () => {
                console.log('WebSocket connection closed');
                this.updateConnectionStatus(false);
            });
        } else {
            console.error('WebsocketService not initialized, cannot set up WebSocket listeners');
        }

        // Custom Event Listener for Graph Data Updates
        window.addEventListener('graphDataUpdated', (event) => {
            console.log('Graph data updated event received', event.detail);
            if (this.visualization) {
                this.visualization.updateVisualization();
            } else {
                console.error('Cannot update visualization: not initialized');
            }
        });

        // Spacemouse Move Event Listener
        window.addEventListener('spacemouse-move', (event) => {
            const { x, y, z } = event.detail;
            if (this.visualization) {
                this.visualization.handleSpacemouseInput(x, y, z);
            } else {
                console.error('Cannot handle Spacemouse input: Visualization not initialized');
            }
        });

        // Initialize audio on first user interaction
        const initAudio = () => {
            if (this.websocketService) {
                this.websocketService.initAudio();
            }
        };

        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('touchstart', initAudio, { once: true });
    }

    handleWebSocketMessage(data) {
        console.log('Handling WebSocket message:', data);
        switch (data.type) {
            case 'graphUpdate':
                console.log('Received graph update:', data.graphData);
                if (this.graphDataManager) {
                    this.graphDataManager.updateGraphData(data.graphData);
                } else {
                    console.error('GraphDataManager not initialized, cannot update graph data');
                }
                if (this.visualization) {
                    this.visualization.updateVisualization();
                } else {
                    console.error('Cannot update visualization: not initialized');
                }
                break;
            case 'ttsMethodSet':
                console.log('TTS method set:', data.method);
                break;
            default:
                console.warn(`Unhandled message type: ${data.type}`);
                break;
        }
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
