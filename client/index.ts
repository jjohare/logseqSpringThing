import { Settings } from './types/settings';
import { NodeManagerFacade } from './rendering/node/NodeManagerFacade';
import { EdgeManager } from './rendering/EdgeManager';
import { HologramManager } from './visualization/HologramManager';
import { TextRenderer } from './rendering/textRenderer';
import { WebSocketService } from './websocket/websocketService';
import { SettingsStore } from './state/SettingsStore';
import { LoggerConfig, createLogger } from './core/logger';
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

const logger = createLogger('GraphVisualization');

// Helper for conditional debug logging
function debugLog(message: string, ...args: any[]) {
    if (debugState.isDataDebugEnabled()) {
        logger.debug(message, ...args);
    }
}

export class GraphVisualization {
    private sceneManager: SceneManager;
    private nodeManager: NodeManagerFacade;
    private edgeManager: EdgeManager;
    private hologramManager: HologramManager;
    private textRenderer: TextRenderer;
    private websocketService!: WebSocketService;
    private initialized: boolean = false;

    public async initializeWebSocket(): Promise<void> {
        debugLog('Initializing WebSocket connection');
        
        // Initialize WebSocket but don't connect yet
        this.websocketService = WebSocketService.getInstance();
        
        // Set up binary message handler before connecting
        this.websocketService.onBinaryMessage((nodes) => {
            if (this.initialized) {
                debugLog('Received binary node update', { nodeCount: nodes.length });
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
            logger.info(`WebSocket connection status changed: ${connected}`);
            if (connected) {
                debugLog('Requesting position updates');
                this.websocketService.sendMessage({ type: 'requestInitialData' });
            }
        });
        
        // Load initial graph data before connecting
        debugLog('Loading initial graph data');
        try {
            await graphDataManager.fetchInitialData();
            const graphData = graphDataManager.getGraphData();
            this.nodeManager.updateNodes(graphData.nodes);
            this.edgeManager.updateEdges(graphData.edges);
            
            // Mark as initialized and connect websocket only after initial data is loaded
            this.initialized = true;
            await this.websocketService.connect();
            debugLog('Initial graph data loaded and WebSocket connected');
        } catch (error) {
            logger.error('Failed to load initial graph data:', error);
        }
    }

    constructor(settings: Settings) {
        debugLog('Initializing GraphVisualization');
        
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
        debugLog('GraphVisualization initialization complete');
    }

    public handleSettingsUpdate(settings: Settings) {
        debugLog('Handling settings update');
        this.nodeManager.handleSettingsUpdate(settings);
        this.edgeManager.handleSettingsUpdate(settings);
        this.hologramManager.updateSettings(settings);
        this.textRenderer.handleSettingsUpdate(settings.visualization.labels);
        this.sceneManager.handleSettingsUpdate(settings);
    }

    public dispose() {
        debugLog('Disposing GraphVisualization');
        this.nodeManager.dispose();
        this.edgeManager.dispose();
        this.hologramManager.dispose();
        this.textRenderer.dispose();
        this.websocketService.close();
        
        // Clean up XR components
        if ((window as any).xrInitializer) {
            (window as any).xrInitializer.dispose();
            delete (window as any).xrInitializer;
        }
        
        SceneManager.cleanup();
        debugLog('GraphVisualization disposed');
    }
}

// Initialize settings and logging
async function init() {
    logger.info('Starting application initialization...');
    
    try {
        // Initialize platform detection first
        await platformManager.initialize(defaultSettings);
        
        // Initialize ModularControlPanel first and wait for settings to be ready
        const controlPanel = ModularControlPanel.getInstance();
        
        // Wait for settings to be ready
        if (!controlPanel.isReady()) {
            await new Promise<void>((resolve) => {
                controlPanel.on('settings:ready', () => resolve());
            });
        }
        
        // Get settings store after it's been initialized by ModularControlPanel
        const settingsStore = SettingsStore.getInstance();
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
        
        // Initialize WebSocket after visualization is created
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
                logger.error('Error handling settings update:', error);
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
        logger.info('Application components initialized successfully', {
            platformType: platformManager.getPlatform(),
            xrSupported: platformManager.isXRSupported(),
            isQuest: platformManager.isQuest()
        });
        
        logger.info('Application initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize application components:', error);
        throw error;
    }
}

init().catch(error => {
    console.error('Failed to initialize application:', error);
});
