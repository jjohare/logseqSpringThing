import React, { useEffect } from 'react';
import { createLogger, createErrorMetadata } from '../lib/utils/logger';
import { debugState } from '../lib/utils/debug-state';
import { useSettingsStore } from '../lib/settings-store';

// Initialize as null, will be populated by dynamic imports
let WebSocketService: any = null;
let graphDataManager: any = null;

// Use dynamic imports instead of require
const loadServices = async () => {
  try {
    const wsServiceModule = await import('../lib/services/websocket-service');
    WebSocketService = wsServiceModule.default;
    
    const graphManagerModule = await import('../lib/managers/graph-data-manager');
    graphDataManager = graphManagerModule.graphDataManager;
  } catch (error) {
    console.error('Could not load required services:', error);
  }
}

const logger = createLogger('AppInitializer');

interface AppInitializerProps {
  onInitialized: () => void;
}

const AppInitializer: React.FC<AppInitializerProps> = ({ onInitialized }) => {
  const { settings, initialize } = useSettingsStore();

  useEffect(() => {
    const initApp = async () => {
      // Load services first
      await loadServices();
      
      if (debugState.isEnabled()) {
        logger.warn('***************** IMPORTANT NOTICE *******************');
          logger.info('Starting application initialization...');
          logger.warn('React Three Fiber is in use - SceneManager is deprecated');
        logger.warn('********************************************************');
        }

        try {
          // Initialize settings
          const settings = await initialize();
  
          // Apply debug settings safely
          if (settings.system?.debug) {
            try {
              const debugSettings = settings.system.debug;
              debugState.enableDebug(debugSettings.enabled);
              if (debugSettings.enabled) {
                debugState.enableDataDebug(debugSettings.showDataUpdates);
                debugState.enablePerformanceDebug(debugSettings.showPerformance);
              }
            } catch (debugError) {
              logger.warn('Error applying debug settings:', createErrorMetadata(debugError));
            }
          }

          // Try to initialize WebSocket
          if (WebSocketService && graphDataManager) {
            try {
              await initializeWebSocket(settings);
            } catch (wsError) {
              logger.error('WebSocket initialization failed, continuing with UI only:', createErrorMetadata(wsError));
              // We'll proceed without WebSocket connectivity
            }
          } else {
            logger.warn('WebSocket services not available, continuing with UI only');
          }
          
          if (debugState.isEnabled()) {
            logger.info('Application initialized successfully');
          }
        
          // Signal that initialization is complete
          onInitialized();
        
      } catch (error) {
          logger.error('Failed to initialize application components:', createErrorMetadata(error));
          // Even if initialization fails, try to signal completion to show UI
          onInitialized();
      }
    };

    initApp();
  }, [initialize, onInitialized]);

  // Initialize WebSocket and set up event handlers - now safer with more error handling
  const initializeWebSocket = async (settings: any): Promise<void> => {
    try {
      const websocketService = WebSocketService.getInstance();
      
      // Handle binary position updates from WebSocket
      websocketService.onBinaryMessage((data) => {
        if (data instanceof ArrayBuffer) {
          // Process binary position update through graph data manager
          graphDataManager.updateNodePositions(new Float32Array(data));
          if (debugState.isDataDebugEnabled()) {
            logger.debug('Received binary position update');
          }
        }
      });
      
      // Set up connection status handler
      websocketService.onConnectionStatusChange((connected) => {
        if (debugState.isEnabled()) {
          logger.info(`WebSocket connection status changed: ${connected}`);
        }

        // Check if websocket is both connected AND ready (received 'connection_established' message)
        if (connected) {
          try {
            if (websocketService.isReady()) {
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
          } catch (connectionError) {
            logger.error('Error during WebSocket status change handling:', createErrorMetadata(connectionError));
          }
        }
      });
      
      // Configure GraphDataManager with WebSocket service (adapter pattern)
      if (websocketService) {
        const wsAdapter = {
          send: (data: ArrayBuffer) => {
            websocketService.sendRawBinaryData(data);
          },
          isReady: () => websocketService.isReady()
        };
        graphDataManager.setWebSocketService(wsAdapter);
      }
      
      try {
        // Connect WebSocket
        await websocketService.connect();
      } catch (connectError) {
        logger.error('Failed to connect to WebSocket:', createErrorMetadata(connectError));
      }
      // Fetch initial graph data from REST API before enabling binary updates
      logger.info('Fetching initial graph data via REST API');
      await graphDataManager.fetchInitialData();
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug('WebSocket connected and waiting for server readiness confirmation');
      }
    } catch (error) {
      logger.error('Failed to initialize WebSocket:', createErrorMetadata(error));
      throw error;
    }
  };

  return null; // This component doesn't render anything directly
};

export default AppInitializer;