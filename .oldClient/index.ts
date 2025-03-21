import { Settings } from './types/settings';
import { NodeManagerFacade } from './rendering/node/NodeManagerFacade';
import { EdgeManager } from './rendering/EdgeManager';
import { HologramManager } from './visualization/HologramManager';
import { TextRenderer } from './rendering/textRenderer';
import { WebSocketService } from './websocket/websocketService';
import { createLogger, createErrorMetadata, createDataMetadata } from './core/logger';
import { debugState } from './core/debugState';
import { SceneManager } from './rendering/scene';
import { graphDataManager } from './state/graphData';
import { MaterialFactory } from './rendering/factories/MaterialFactory';
import { XRSessionManager } from './xr/xrSessionManager';
import { XRInitializer } from './xr/xrInitializer';
import { initializeApplication } from './core/initialize';
import { SettingsStore } from './state/SettingsStore';

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

export class GraphVisualization {
    private sceneManager: SceneManager;
    private nodeManager: NodeManagerFacade;
    private edgeManager: EdgeManager;
    private hologramManager: HologramManager;
    private textRenderer: TextRenderer;
    private websocketService: WebSocketService | null = null;
    private websocketInitialized = false;
    private componentsReady = false;
    private loadingTimeout: number | null = null;

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

    public async initializeWebSocket(): Promise<void> {
        if (this.websocketInitialized) {
            logger.warn('WebSocket already initialized');
            return;
        }

        try {
            // Initialize WebSocket service
            this.websocketService = WebSocketService.getInstance();
            
            // Handle binary position updates from WebSocket
            this.websocketService?.onBinaryMessage((data) => {
                if (data instanceof ArrayBuffer) {
                    // Process binary position update through graph data manager
                    graphDataManager.updateNodePositions(new Float32Array(data));
                    if (debugState.isDataDebugEnabled()) {
                        logger.debug('Received binary position update');
                    }
                }
            });
            
            // Set up connection status handler
            this.websocketService?.onConnectionStatusChange((connected) => {
                if (debugState.isEnabled()) {
                    logger.info(`WebSocket connection status changed: ${connected}`);
                }
                
                // Check if websocket is both connected AND ready (received 'connection_established' message)
                if (connected && this.componentsReady) {
                    if (this.websocketService?.isReady()) {
                        // WebSocket is fully ready, now it's safe to enable binary updates
                        logger.info('WebSocket is connected and fully established - enabling binary updates');
                        graphDataManager.setBinaryUpdatesEnabled(true);
                        if (debugState.isDataDebugEnabled()) {
                            logger.debug('Binary updates enabled');
                        }
                    } else {
                        logger.info('WebSocket connected but not fully established yet - waiting for readiness');
                        
                        // We'll let graphDataManager handle the binary updates enablement
                        // through its retry mechanism that now checks for websocket readiness
                        graphDataManager.enableBinaryUpdates();
                    }
                }
            });
            
            // Configure GraphDataManager with WebSocket service (adapter pattern)
            if (this.websocketService) {
                const wsAdapter = {
                    send: (data: ArrayBuffer) => {
                        this.websocketService?.sendRawBinaryData(data);
                    },
                    isReady: () => this.websocketService?.isReady() || false
                };
                graphDataManager.setWebSocketService(wsAdapter);
            }
            
            // Mark as initialized before connecting WebSocket
            this.websocketInitialized = true;
            
            // Finally connect WebSocket
            await this.websocketService?.connect();
            
            // Fetch initial graph data from REST API before enabling binary updates
            logger.info('Fetching initial graph data via REST API');
            await graphDataManager.fetchInitialData();
            
            if (debugState.isDataDebugEnabled()) {
                logger.debug('WebSocket connected and waiting for server readiness confirmation');
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
        this.textRenderer.handleSettingsUpdate(settings.visualization?.labels);
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
        this.componentsReady = false;
        if (debugState.isDataDebugEnabled()) {
            logger.debug('GraphVisualization disposed');
        }
    }
}

// Initialize application
async function init() {
    if (debugState.isEnabled()) {
        logger.info('Starting application initialization...');
    }
    
    try {
        // Initialize core systems (auth, platform, settings)
        const settings = await initializeApplication();

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
            'visualization',  // Subscribe to all visualization changes
            'system.websocket',  // Subscribe to websocket settings
            'system.debug',  // Subscribe to debug settings
            'xr'  // Subscribe to XR settings
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
                        visualization: {
                            bloom: currentSettings.visualization?.bloom,
                            rendering: currentSettings.visualization?.rendering
                        },
                        system: currentSettings.system,
                        xr: currentSettings.xr
                    });
                }
            } catch (error) {
                logger.error('Error handling settings update:', createErrorMetadata(error));
            }
        };

        // Use a single subscription for all visualization paths
        const settingsStore = SettingsStore.getInstance();
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
            logger.info('Application initialized successfully');
        }
    } catch (error) {
        logger.error('Failed to initialize application components:', createErrorMetadata(error));
        throw error;
    }
}


