import React, { useEffect, useState, useCallback } from 'react';
import { useSafeXR, withSafeXR } from '../lib/xr/safeXRHooks';
import { MetadataVisualizer, useTextLabelManager } from '../lib/visualization/MetadataVisualizer';
import { useHandTracking } from '../lib/xr/HandInteractionSystem';
import { useSettingsStore } from '../lib/stores/settings-store';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('XRVisualizationConnector');

/**
 * XRVisualizationConnector connects the XR hand interaction system
 * with the visualization system and platform manager.
 * 
 * This component acts as the dependency injector between these systems.
 * It is wrapped with the XR context safety check to prevent errors.
 */
const XRVisualizationConnectorInner: React.FC = () => {
  const { isPresenting: isXRMode } = useSafeXR();
  const settings = useSettingsStore(state => state.settings);
  const handTracking = useHandTracking();
  const labelManager = useTextLabelManager();
  const [interactionEnabled, setInteractionEnabled] = useState(true);
  
  // Handle platform changes
  useEffect(() => {
    // Configure interactivity based on XR mode
    setInteractionEnabled(isXRMode && settings?.xr?.handInteraction !== false);
    
    // Debug logging
    if (isXRMode) {
      logger.info('XR mode active, configuring visualization for hand interaction');
    }
  }, [isXRMode, settings?.xr?.handInteraction]);
  
  // Handle hand gesture interactions with visualizations
  useEffect(() => {
    if (!interactionEnabled) return;
    
    // Example: Use pinch gesture state to interact with labels
    const { pinchState, handPositions } = handTracking;
    
    // Update visualization system based on hand state
    // This is just a stub - real implementation would have more logic
    if (pinchState.left || pinchState.right) {
      logger.debug('Hand pinch detected, could update visualization here');
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [handTracking, interactionEnabled]);
  
  // Render the visualization system with the appropriate settings
  return (
    <MetadataVisualizer 
      renderLabels={settings?.visualization?.labels?.enabled !== false}
      renderIcons={settings?.visualization?.icons?.enabled !== false}
      renderMetrics={settings?.visualization?.metrics?.enabled}
    />
  );
};

// Wrap with XR context safety check to prevent outside-XR-context errors
const XRVisualizationConnector = withSafeXR(XRVisualizationConnectorInner, 'XRVisualizationConnector');
export default XRVisualizationConnector;