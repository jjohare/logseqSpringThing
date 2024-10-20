import { createApp, provide, inject, onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import ChatManager from './components/ChatManager.vue';
import { WebXRVisualization } from './visualization/WebXRVisualization.js';
import { WebsocketService } from './services/websocketService.js';
import { GraphDataManager } from './services/graphDataManager.js';
import { enableSpacemouse } from './services/spacemouse.js';
import { WebGLRenderer } from 'three';

console.log('App.js: Starting initialization');

class App {
    constructor() {
        console.log('App: Constructor called');
        this.websocketService = new WebsocketService();
        console.log('App: WebsocketService created');
        this.graphDataManager = new GraphDataManager(this.websocketService);
        console.log('App: GraphDataManager created');
        this.visualization = null;
        this.simulationMode = 'local'; // Default to local
        this.renderer = new WebGLRenderer({ antialias: true }); // Initialize renderer
        console.log('App: THREE.WebGLRenderer created');
        this.setupWebsocketListeners = this.setupWebsocketListeners.bind(this);
        this.initializeApp();
    }

    initializeApp() {
        console.log('App: Initializing app');
        this.initVueApp();
        this.setupEventListeners();
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
                    console.log(`App: Render mode changed to ${mode}`);
                    this.renderMode = mode;
                    if (this.visualization) {
                        this.visualization.switchSimulationMode(mode);
                    } else {
                        console.warn('Visualization not initialized yet');
                    }
                },
                handleSimulationModeChange(mode) {
                    console.log(`App: Simulation mode changed to ${mode}`);
                    this.simulationMode = mode;
                    if (this.visualization) {
                        this.visualization.switchSimulationMode(mode);
                    }
                    if (mode === 'remote') {
                        this.graphDataManager.enableRemoteSimulation();
                    } else {
                        this.graphDataManager.disableRemoteSimulation();
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

        this.websocketService.on('enable-spacemouse', () => {
            console.log('App: enable-spacemouse event received');
            enableSpacemouse();
        });
    }

    setupWebsocketListeners() {
        console.log('App: Setting up WebSocket listeners');
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
            this.visualization = new WebXRVisualization(this.graphDataManager, this.renderer);
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
