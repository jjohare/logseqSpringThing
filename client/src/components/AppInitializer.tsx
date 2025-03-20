import React, { useEffect } from 'react';
import { initializeApplication } from '../../core/initialize';
import { GraphVisualization } from '../../index';
import { Settings } from '../../types/settings';
import { SceneManager } from '../../rendering/scene';
import { XRSessionManager } from '../../xr/xrSessionManager';
import { XRInitializer } from '../../xr/xrInitializer';
import { SettingsStore } from '../../state/SettingsStore';
import { createLogger, createErrorMetadata } from '../../core/logger';
import { debugState } from '../../core/debugState';

const logger = createLogger('AppInitializer');

interface AppInitializerProps {
  onInitialized: () => void;
}

const AppInitializer: React.FC<AppInitializerProps> = ({ onInitialized }) => {
  useEffect(() => {
    const initialize = async () => {
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
          'visualization', // Subscribe to all visualization changes
          'system.websocket', // Subscribe to websocket settings
          'system.debug', // Subscribe to debug settings
          'xr', // Subscribe to XR settings
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
                  rendering: currentSettings.visualization?.rendering,
                },
                system: currentSettings.system,
                xr: currentSettings.xr,
              });
            }
          } catch (error) {
            logger.error('Error handling settings update:', createErrorMetadata(error));
          }
        };

        // Use a single subscription for all visualization paths
        const settingsStore = SettingsStore.getInstance();
        visualizationPaths.forEach((path) => {
          settingsStore.subscribe(
            path,
            () => {
              if (!pendingUpdate) {
                pendingUpdate = true;
                pendingSettings = settingsStore.get('') as Settings;
                window.requestAnimationFrame(handleSettingsChange);
              }
            },
            false // Don't trigger immediate update on subscription
          );
        });

        // Log successful initialization
        if (debugState.isEnabled()) {
          logger.info('Application initialized successfully');
        }

        onInitialized();
      } catch (error) {
        logger.error(
          'Failed to initialize application components:',
          createErrorMetadata(error)
        );
      }
    };

    initialize();
  }, [onInitialized]);

  return null; // This component doesn't render anything directly
};

export default AppInitializer;