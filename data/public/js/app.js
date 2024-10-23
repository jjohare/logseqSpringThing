import { createApp, provide, inject, onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import { WebXRVisualization } from './visualization/WebXRVisualization.js';
import { WebsocketService } from './services/websocketService.js';
import { GraphDataManager } from './services/graphDataManager.js';
import { enableSpacemouse } from './services/spacemouse.js';
import { WebGLRenderer } from 'three';
import { isGPUAvailable, initGPUCompute } from './gpuUtils.js';
import toml from 'toml';

async function loadConfig() {
    try {
        const response = await fetch('/settings.toml');
        const tomlText = await response.text();
        return toml.parse(tomlText);
    } catch (error) {
        console.error('Error loading configuration:', error);
        return null;
    }
}

class App {
    constructor() {
        this.websocketService = new WebsocketService();
        this.graphDataManager = new GraphDataManager(this.websocketService);
        this.visualization = null;
        this.gpuCompute = null;
        this.simulationMode = 'cpu'; // Default to CPU mode
        this.ttsMode = 'local';
        this.config = null;
        this.setupWebsocketListeners = this.setupWebsocketListeners.bind(this);
        this.initializeApp();
    }

    async initializeApp() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        try {
            // Load configuration
            this.config = await loadConfig();
            if (!this.config) {
                console.warn('Failed to load configuration. Using default values.');
            }

            // Initialize renderer with proper configuration
            this.renderer = new WebGLRenderer({
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
                precision: "highp"
            });
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);

            // Check GPU availability after renderer is properly initialized
            this.gpuAvailable = isGPUAvailable(this.renderer);
            if (this.gpuAvailable) {
                this.gpuCompute = initGPUCompute(1024, 1024, this.renderer);
                if (this.gpuCompute) {
                    this.simulationMode = 'gpu';
                } else {
                    console.warn('GPU compute initialization failed, falling back to CPU mode');
                    this.simulationMode = 'cpu';
                }
            } else if (this.websocketService.isConnected()) {
                this.simulationMode = 'remote';
            } else {
                console.warn('GPU acceleration not available and not connected to server, using CPU fallback');
            }

            this.initVueApp();
            this.setupEventListeners();
        } catch (error) {
            console.error('Error in initialization:', error);
        }
    }

    initVueApp() {
        const app = createApp({
            setup: () => {
                provide('websocketService', this.websocketService);
                provide('graphDataManager', this.graphDataManager);
                provide('renderer', this.renderer);
                provide('simulationMode', this.simulationMode);
                provide('config', this.config);
                
                onMounted(() => {
                    this.setupWebsocketListeners();
                });

                return {
                    websocketService: this.websocketService,
                    graphDataManager: this.graphDataManager,
                    config: this.config
                };
            },
            components: {
                ControlPanel
            },
            template: `
                <div>
                    <div id="scene-container"></div>
                    <control-panel 
                        :websocketService="websocketService"
                        :gpuAvailable="gpuAvailable"
                        :config="config"
                        @control-change="handleControlChange"
                        @toggle-fullscreen="toggleFullscreen"
                        @enable-spacemouse="enableSpacemouse"
                    ></control-panel>
                </div>
            `,
            methods: {
                handleControlChange(data) {
                    if (this.visualization) {
                        if (data.name === 'simulationMode') {
                            this.simulationMode = data.value;
                            this.visualization.switchSimulationMode(data.value);
                            if (data.value === 'remote') {
                                this.graphDataManager.setSimulationMode('remote');
                            } else {
                                this.graphDataManager.setSimulationMode('local');
                            }
                        } else if (data.name === 'ttsMode') {
                            this.ttsMode = data.value;
                            this.setTTSMode(data.value);
                        } else if (data.name === 'forceDirectedIterations' || 
                            data.name === 'forceDirectedRepulsion' || 
                            data.name === 'forceDirectedAttraction') {
                            this.updateForceDirectedParams(data.name, data.value);
                        } else {
                            this.visualization.updateVisualFeatures({ [data.name]: data.value });
                        }
                    }
                },
                updateForceDirectedParams(name, value) {
                    if (this.graphDataManager) {
                        this.graphDataManager.updateForceDirectedParams({ [name]: value });
                        this.graphDataManager.recalculateLayout();
                        if (this.visualization) {
                            this.visualization.updateVisualization();
                        }
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
                },
                async setTTSMode(mode) {
                    try {
                        const response = await fetch('/api/set-tts-mode', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ mode }),
                        });
                        if (!response.ok) {
                            throw new Error('Failed to set TTS mode');
                        }
                        this.websocketService.setTTSMode(mode);
                    } catch (error) {
                        console.error('Error setting TTS mode:', error);
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
    }

    setupEventListeners() {
        window.addEventListener('graphDataUpdated', (event) => {
            if (this.visualization) {
                this.visualization.updateVisualization();
            }
        });

        window.addEventListener('layoutRecalculationRequested', (event) => {
            if (this.visualization) {
                this.visualization.updateVisualization();
            }
        });

        window.addEventListener('spacemouse-move', (event) => {
            const { x, y, z, rx, ry, rz } = event.detail;
            if (this.visualization) {
                this.visualization.handleSpacemouseInput(x, y, z, rx, ry, rz);
            }
        });
    }

    setupWebsocketListeners() {
        this.websocketService.on('open', () => {
            // Connection opened
        });

        this.websocketService.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.websocketService.on('close', () => {
            // Connection closed
        });

        this.websocketService.on('graphUpdate', (graphData) => {
            if (this.isValidGraphData(graphData)) {
                this.graphDataManager.updateGraphData(graphData);
                if (this.visualization) {
                    this.visualization.updateVisualization();
                }
            }
        });

        this.websocketService.on('initialData', (data) => {
            if (this.isValidGraphData(data)) {
                this.graphDataManager.updateGraphData(data);
                if (!this.visualization) {
                    this.initVisualization();
                } else {
                    this.visualization.updateVisualization();
                }
            }
        });

        this.websocketService.on('audioData', (audioData) => {
            this.playAudio(audioData);
        });
    }

    isValidGraphData(data) {
        return data && 
               typeof data === 'object' && 
               Array.isArray(data.nodes) && 
               Array.isArray(data.edges) &&
               data.nodes.every(node => node && typeof node === 'object' && node.name) &&
               data.edges.every(edge => edge && typeof edge === 'object' && edge.source && edge.target);
    }

    initVisualization() {
        try {
            const container = document.getElementById('scene-container');
            if (!container) {
                throw new Error('Scene container not found');
            }

            this.visualization = new WebXRVisualization(
                this.graphDataManager,
                this.renderer,
                this.gpuCompute,
                this.config
            );
            
            this.visualization.switchSimulationMode(this.simulationMode);
            this.visualization.updateVisualization();
        } catch (error) {
            console.error('Error initializing visualization:', error);
        }
    }

    playAudio(audioData) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
            view[i] = audioData[i];
        }
        audioContext.decodeAudioData(arrayBuffer, (buffer) => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
        }, (error) => {
            console.error('Error decoding audio data:', error);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
