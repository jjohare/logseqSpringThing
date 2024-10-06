// data/public/js/app.js

import { WebsocketService } from './services/websocketService.js';
import { RAGflowService } from './services/ragflowService.js';
import { GraphDataManager } from './services/graphDataManager.js';
import { WebXRVisualization } from './components/webXRVisualization.js';
import { ChatManager } from './components/chatManager.js';
import { Interface } from './components/interface.js';
import { isGPUAvailable, initGPU } from './gpuUtils.js';

class App {
    constructor() {
        console.log('Initializing App');
        this.websocketService = new WebsocketService();
        this.ragflowService = new RAGflowService(this.websocketService);
        this.graphDataManager = new GraphDataManager(this.websocketService);
        this.visualization = new WebXRVisualization(this.graphDataManager);
        this.chatManager = new ChatManager(this.ragflowService);
        this.interface = new Interface(document);
        
        this.gpuAvailable = isGPUAvailable();
        if (this.gpuAvailable) {
            this.gpuUtils = initGPU();
        }

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        console.log('Setting up event listeners');
        
        window.addEventListener('chatReady', () => {
            console.log('Chat is ready');
            this.updateConnectionStatus(true);
            this.graphDataManager.requestInitialData();
        });

        window.addEventListener('ragflowError', (event) => {
            console.error('RAGflow error:', event.detail);
            this.interface.displayErrorMessage(`RAGflow error: ${event.detail}`);
            this.updateConnectionStatus(false);
        });

        window.addEventListener('graphDataUpdated', (event) => {
            console.log('Graph data updated event received');
            this.visualization.updateVisualization();
        });

        const fullscreenButton = document.getElementById('fullscreen-button');
        if (fullscreenButton) {
            fullscreenButton.addEventListener('click', this.toggleFullscreen.bind(this));
        } else {
            console.warn('Fullscreen button not found');
        }
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = isConnected ? 'connected' : 'disconnected';
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
                this.interface.displayErrorMessage('Unable to enter fullscreen mode.');
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    start() {
        console.log('Starting the application');
        this.visualization.initialize();
        this.chatManager.initialize();
        if (this.gpuAvailable) {
            console.log('GPU acceleration is available');
            // Implement GPU-accelerated features here
        } else {
            console.log('GPU acceleration is not available, using CPU fallback');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded, creating App instance');
    const app = new App();
    app.start();
});
