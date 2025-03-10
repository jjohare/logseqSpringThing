import { Settings } from './types/settings';
import { NodeManagerFacade } from './rendering/node/NodeManagerFacade';
import { EdgeManager } from './rendering/EdgeManager';
import { HologramManager } from './visualization/HologramManager';
import { TextRenderer } from './rendering/textRenderer';
import { WebSocketService } from './websocket/websocketService';
import { SettingsStore } from './state/SettingsStore';
import { LoggerConfig, createLogger, createErrorMetadata, createDataMetadata } from './core/logger';
import { platformManager } from './platform/platformManager';

import { XRSessionManager } from './xr/xrSessionManager';
import { XRInitializer } from './xr/xrInitializer';
import { SceneManager } from './rendering/scene';
import { graphDataManager } from './state/graphData';
import { debugState } from './core/debugState';
import { ModularControlPanel } from './ui/ModularControlPanel';
import { defaultSettings } from './state/defaultSettings';
import { MaterialFactory } from './rendering/factories/MaterialFactory';
import './ui'; // Import UI initialization

import { Vector3 } from 'three';
const logger = createLogger('GraphVisualization');

export function checkWebGLSupport(): boolean {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    if (!gl) {
        logger.error('WebGL not supported');
        return false;
    }
    
    return true;
}

/**
 * Helper to validate and sanitize Vector3 positions
 * Returns true if fixed, false if already valid
 */
function validateAndFixVector3(vec: Vector3): boolean {
    if (isNaN(vec.x) || isNaN(vec.y) || isNaN(vec.z) || !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z)) {
        vec.set(isNaN(vec.x) || !isFinite(vec.x) ? 0 : vec.x, isNaN(vec.y) || !isFinite(vec.y) ? 0 : vec.y, isNaN(vec.z) || !isFinite(vec.z) ? 0 : vec.z);
        return true;
    }
    return false;
}

export class GraphVisualization {
    private sceneManager: SceneManager;
    private nodeManager: NodeManagerFacade;
    private edgeManager: EdgeManager;
    private hologramManager: HologramManager;
    private textRenderer: TextRenderer;
    private websocketService!: WebSocketService;
    private initialized: boolean = false;
    private websocketInitialized: boolean = false;
    private componentsReady: boolean = false;
    private loadingTimeout: number | null = null;

    // Start a timeout to detect endless loading states
    private startLoadingTimeout(): void {
        if (this.loadingTimeout) {
            window.clearTimeout(this.loadingTimeout);
        }
        this.loadingTimeout = window.setTimeout(() => {
            logger.error('Loading timeout: Initial graph data loading took too long');
            // Try to make the app usable even with timeout
            document.getElementById('loading-message')?.remove();
        }, 30000); // 30 second timeout
    }
    
    private clearLoadingTimeout(): void {
        if (this.loadingTimeout) {
            window.clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }

    public async initializeWebSocket(): Promise<void> {
        if (!this.componentsReady) {
            if (debugState.isEnabled()) {
                logger.warn('Attempting to initialize WebSocket before components are ready');
            }
            return;
        }
        
        // Prevent duplicate WebSocket initialization
        if (this.websocketInitialized) {
            if (debugState.isEnabled()) {
                logger.warn('WebSocket already initialized, skipping duplicate initialization');
            }
            return;
        }

        if (debugState.isDataDebugEnabled()) {
            logger.debug('Loading initial graph data via REST');
        }
        
        // Set a timeout for the initial data loading to avoid hanging in the loading state
        const LOADING_TIMEOUT = 30000; // 30 seconds
        if (this.loadingTimeout) {
            window.clearTimeout(this.loadingTimeout);
        }
        
        this.loadingTimeout = window.setTimeout(() => {
            logger.error('Timeout while loading initial graph data. The server may be unresponsive.');
            document.getElementById('loading-message')?.setAttribute('data-error', 'true');
            const loadingEl = document.getElementById('loading-message');
            if (loadingEl) {
                loadingEl.textContent = 'Error: Timeout while loading graph data. Please refresh the page to try again.';
                loadingEl.classList.add('error');
            }
        }, LOADING_TIMEOUT);
        
        // Start loading timeout
        this.startLoadingTimeout();
        
        try {
            // First load graph data via REST
            await graphDataManager.fetchInitialData();
            const graphData = graphDataManager.getGraphData();
            
            // Clear the loading timeout since we have data
            this.clearLoadingTimeout();
            
            // Check for empty or invalid graph data
            if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
                logger.error('Initial graph data is empty or invalid', createDataMetadata({ 
                    hasGraphData: !!graphData,
                    hasNodes: !!(graphData && graphData.nodes),
                    nodeCount: graphData?.nodes?.length || 0
                }));
            }
            
            // Clear the loading timeout since data was loaded successfully
            if (this.loadingTimeout) {
                window.clearTimeout(this.loadingTimeout);
                this.loadingTimeout = null;
            }
            
            // Validate the received data
            if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
                logger.error('Initial graph data is empty or invalid', createDataMetadata(graphData));
                throw new Error('Initial graph data is empty or invalid');
            }
            
            // Update visualization with initial data
            this.nodeManager.updateNodes(graphData.nodes);
            this.edgeManager.updateEdges(graphData.edges);
            
            if (debugState.isDataDebugEnabled()) {
                logger.debug('Initial graph data loaded via REST', {
                    nodes: graphData.nodes.length,
                    edges: graphData.edges.length
                });
            }

            // Now initialize WebSocket for binary updates
            this.websocketService = WebSocketService.getInstance();
            
            // Create an adapter that implements the InternalWebSocketService interface
            // expected by GraphDataManager
            const webSocketAdapter = {
                send: (data: ArrayBuffer) => {
                    if (debugState.isDataDebugEnabled()) {
                        logger.debug('Sending binary data via WebSocket adapter');
                    }
                    // Use WebSocketService's binary message handling capability
                    // The WebSocketService handles compression internally
                    this.websocketService.sendNodeUpdates([]);
                    
                    // Send the raw binary data - this may be needed for certain types of updates
                    const success = this.websocketService.sendRawBinaryData(data);
                    if (!success) {
                        logger.error('Failed to send binary data via WebSocket adapter: WebSocket may not be connected');
                    }
                }
            };
            
            // Register the adapter with GraphDataManager
            graphDataManager.setWebSocketService(webSocketAdapter);
            
            // Set up binary message handler
            this.websocketService.onBinaryMessage((nodes) => {
                if (this.initialized && this.componentsReady) {
                    if (debugState.isDataDebugEnabled()) {
                        logger.debug('Received binary node update', { nodeCount: nodes.length });
                    }
                    
                    // Check each node for NaN values and fix if needed
                    nodes.forEach(node => {
                        if (validateAndFixVector3(node.position)) {
                            logger.warn(`Fixed invalid position for node ${node.id}`);
                        }
                        if (node.velocity && validateAndFixVector3(node.velocity)) {
                            logger.warn(`Fixed invalid velocity for node ${node.id}`);
                        }
                    });
                    this.nodeManager.updateNodePositions(nodes.map(node => ({
                        id: node.id.toString(),
                        data: {
                            position: node.position,
                            velocity: node.velocity
                        }
                    })));
                }
            });
            
            // Set up connection status handler
            this.websocketService.onConnectionStatusChange((connected) => {
                if (debugState.isEnabled()) {
                    logger.info(`WebSocket connection status changed: ${connected}`);
                }
                if (connected && this.componentsReady) {
                    // Enable binary updates in GraphDataManager
                    graphDataManager.setBinaryUpdatesEnabled(true);
                    if (debugState.isDataDebugEnabled()) {
                        logger.debug('Binary updates enabled');
                    }
                }
            });
            
            // Mark as initialized before connecting WebSocket
            this.initialized = true;
            this.websocketInitialized = true;
            
            // Finally connect WebSocket
            await this.websocketService.connect();
            
            /**
             * At this point, we need to manually notify other components that the WebSocket is ready.
             * The GraphDataManager tries to configure itself with WebSocketService but 
             * they use different interfaces, which is causing the "WebSocket service not configured" error.
             * 
             * Instead of trying to bridge them directly (which would require modifying interfaces),
             * we're enabling binary updates on GraphDataManager after the WebSocket is connected, and
             * the components will communicate through their existing API methods:
             * 
             * - GraphDataManager.setBinaryUpdatesEnabled(true) -> enables updates
             * - WebSocketService.sendNodeUpdates() -> handles outgoing node updates
             * - WebSocketService.onBinaryMessage() -> processes incoming binary data (already set up above)
             */
            try {
                // Enable binary updates now that WebSocket is connected
                logger.info('Binary updates enabled for GraphDataManager with WebSocket adapter');
            } catch (error) {
                logger.error('Error enabling binary updates:', createErrorMetadata(error));
            }
            
            if (debugState.isDataDebugEnabled()) {
                logger.debug('WebSocket connected and ready for binary updates');
            }
        } catch (error) {
            logger.error('Failed to initialize data and WebSocket:', createErrorMetadata(error));
            
            // Clear the loading timeout
            if (this.loadingTimeout) {
                window.clearTimeout(this.loadingTimeout);
                this.loadingTimeout = null;
            }
            
            // Show error to user
            this.showLoadingError('Failed to load graph data. Please check your connection and try again.');
            throw error;
        }
    }

    constructor(settings: Settings) {
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Initializing GraphVisualization');
        }
        
        // Get existing canvas element
        const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
        if (!canvas) {
            throw new Error('Could not find #main-canvas element');
        }
        
        // Initialize SceneManager
        this.sceneManager = SceneManager.getInstance(canvas);
        
        // Initialize managers with SceneManager's scene and renderer
        const scene = this.sceneManager.getScene();
        const camera = this.sceneManager.getCamera();
        const renderer = this.sceneManager.getRenderer();
        const materialFactory = MaterialFactory.getInstance();
        
        this.nodeManager = NodeManagerFacade.getInstance(
            scene,
            camera,
            materialFactory.getNodeMaterial(settings)
        );
        this.edgeManager = new EdgeManager(scene, settings, this.nodeManager.getNodeInstanceManager());
        this.hologramManager = new HologramManager(scene, renderer, settings);
        this.textRenderer = new TextRenderer(camera, scene);
        
        // Apply initial settings to all components but don't connect websocket yet
        this.handleSettingsUpdate(settings);
        
        // Start rendering
        this.sceneManager.start();
        this.componentsReady = true;
        if (debugState.isDataDebugEnabled()) {
            logger.debug('GraphVisualization initialization complete');
        }
    }

    public handleSettingsUpdate(settings: Settings) {
        if (!this.componentsReady) {
            if (debugState.isEnabled()) {
                logger.warn('Attempting to update settings before components are ready');
            }
            return;
        }

        if (debugState.isDataDebugEnabled()) {
            logger.debug('Handling settings update');
        }
        this.nodeManager.handleSettingsUpdate(settings);
        this.edgeManager.handleSettingsUpdate(settings);
        this.hologramManager.updateSettings(settings);
        this.textRenderer.handleSettingsUpdate(settings.visualization.labels);
        this.sceneManager.handleSettingsUpdate(settings);
    }

    private showLoadingError(message: string): void {
        const loadingEl = document.getElementById('loading-message');
        if (loadingEl) {
            loadingEl.textContent = `Error: ${message}`;
            loadingEl.classList.add('error');
        } else {
            // Create error message if loading element doesn't exist
            logger.error('Loading error:', createDataMetadata({ message }));
        }
    }

    public dispose() {
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Disposing GraphVisualization');
        }
        this.nodeManager.dispose();
        this.edgeManager.dispose();
        this.hologramManager.dispose();
        this.textRenderer.dispose();
        if (this.websocketService) {
            this.websocketService.close();
        }
        
        // Clean up XR components
        if ((window as any).xrInitializer) {
            (window as any).xrInitializer.dispose();
            delete (window as any).xrInitializer;
        }
        
        SceneManager.cleanup();
        // Clear any pending timeouts
        if (this.loadingTimeout) {
            window.clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
        this.initialized = false;
        this.componentsReady = false;
        if (debugState.isDataDebugEnabled()) {
            logger.debug('GraphVisualization disposed');
        }
    }
}

// Initialize settings and logging
async function init() {
    if (debugState.isEnabled()) {
        logger.info('Starting application initialization...');
    }
    
    try {
        // Initialize platform detection first
        await platformManager.initialize(defaultSettings);
        
        // Initialize ModularControlPanel first and wait for settings to be ready
        const controlPanel = ModularControlPanel.getInstance();
        const settingsStore = SettingsStore.getInstance();
        
        // Wait for both control panel and settings store to be ready
        await Promise.all([
            new Promise<void>((resolve) => {
                if (controlPanel.isReady()) {
                    resolve();
                } else {
                    controlPanel.on('settings:ready', () => resolve());
                }
            }),
            settingsStore.initialize()
        ]);
        
        // Get settings after everything is initialized
        const settings = settingsStore.get('') as Settings || defaultSettings;

        // Configure logging based on settings
        const debugEnabled = settingsStore.get('system.debug.enabled') as boolean;
        const logFullJson = settingsStore.get('system.debug.log_full_json') as boolean;
        LoggerConfig.setGlobalDebug(debugEnabled);
        LoggerConfig.setFullJson(logFullJson);
        
        // Subscribe to debug setting changes
        settingsStore.subscribe('system.debug.enabled', (_, value) => {
            LoggerConfig.setGlobalDebug(value as boolean);
        });
        settingsStore.subscribe('system.debug.log_full_json', (_, value) => {
            LoggerConfig.setFullJson(value as boolean);
        });

        // Create XR button if it doesn't exist
        if (!document.getElementById('xr-button')) {
            const xrButton = document.createElement('button');
            xrButton.id = 'xr-button';
            xrButton.className = 'hidden';
            document.body.appendChild(xrButton);
        }

        // Get canvas and scene manager for XR setup
        const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
        if (!canvas) {
            throw new Error('Could not find #main-canvas element');
        }
        const sceneManager = SceneManager.getInstance(canvas);

        // Initialize XR components
        const xrSessionManager = XRSessionManager.getInstance(sceneManager);
        (window as any).xrInitializer = XRInitializer.getInstance(xrSessionManager);

        // Initialize main visualization and store globally
        const viz = new GraphVisualization(settings);
        (window as any).visualization = viz;
        
        // Initialize WebSocket after visualization is created and ready
        await viz.initializeWebSocket();

        // Subscribe to all relevant visualization paths
        const visualizationPaths = [
            'visualization.nodes',
            'visualization.edges',
            'visualization.physics',
            'visualization.rendering',
            'visualization.animations',
            'visualization.labels',
            'visualization.bloom',
            'visualization.hologram'
        ];

        // Subscribe to each path and update both visualization and scene
        let pendingUpdate = false;
        let pendingSettings: Settings | null = null;

        const handleSettingsChange = () => {
            if (!viz || !pendingSettings) return;
            
            try {
                // Use the pending settings and clear it
                const currentSettings = pendingSettings;
                pendingSettings = null;
                pendingUpdate = false;

                if (!currentSettings) {
                    return;
                }
                
                // Batch updates to avoid cascading changes
                viz.handleSettingsUpdate(currentSettings);
                sceneManager.handleSettingsUpdate(currentSettings);
                
                if (debugState.isEnabled()) {
                    logger.debug('Settings updated:', {
                        bloom: currentSettings.visualization.bloom,
                        rendering: currentSettings.visualization.rendering
                    });
                }
            } catch (error) {
                logger.error('Error handling settings update:', createErrorMetadata(error));
            }
        };

        // Use a single subscription for all visualization paths
        visualizationPaths.forEach(path => {
            settingsStore.subscribe(path, () => {
                if (!pendingUpdate) {
                    pendingUpdate = true;
                    pendingSettings = settingsStore.get('') as Settings;
                    window.requestAnimationFrame(handleSettingsChange);
                }
            }, false); // Don't trigger immediate update on subscription
        });

        // Log successful initialization
        if (debugState.isEnabled()) {
            logger.info('Application components initialized successfully', {
                platformType: platformManager.getPlatform(),
                xrSupported: platformManager.isXRSupported(),
                isQuest: platformManager.isQuest()
            });
            
            logger.info('Application initialized successfully');
        }
    } catch (error) {
        logger.error('Failed to initialize application components:', createErrorMetadata(error));
        throw error;
    }
}

// Start the application
init().catch(error => {
    console.error('Failed to initialize application:', error);
});
