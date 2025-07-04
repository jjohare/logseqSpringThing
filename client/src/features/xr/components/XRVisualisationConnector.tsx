import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useXRCore } from '../providers/XRCoreProvider';
import { MetadataVisualizer, useTextLabelManager } from '../../visualisation/components/MetadataVisualizer';
import { useHandTracking } from '../systems/HandInteractionSystem';
import { useSettingsStore } from '../../../store/settingsStore';
import { useMultiUserStore, MultiUserConnection } from '../../../store/multiUserStore';
import { createLogger } from '../../../utils/logger';
import * as THREE from 'three';

const logger = createLogger('XRVisualisationConnector');

/**
 * XRVisualisationConnector connects the Quest 3 AR hand interaction system
 * with the visualisation system and platform manager.
 *
 * This component acts as the dependency injector between these systems.
 * It uses the enhanced XRCoreProvider for robust session management.
 */
const XRVisualisationConnector: React.FC = () => {
  const { isSessionActive: isXRMode, sessionType } = useXRCore();
  const { isPresenting, player } = useXR();
  const { camera } = useThree();
  const settings = useSettingsStore(state => state.settings);
  const handTracking = useHandTracking();
  const labelManager = useTextLabelManager();
  const [interactionEnabled, setInteractionEnabled] = useState(true);
  const multiUserConnection = useRef<MultiUserConnection | null>(null);
  const raycastRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const updateLocalPosition = useMultiUserStore(state => state.updateLocalPosition);
  const updateLocalSelection = useMultiUserStore(state => state.updateLocalSelection);
  const setLocalUserId = useMultiUserStore(state => state.setLocalUserId);
  
  // Initialize multi-user connection when entering AR
  useEffect(() => {
    if (isPresenting && settings?.xr?.enableMultiUser !== false) {
      // Generate or retrieve user ID
      const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
      setLocalUserId(userId);
      
      // Connect to multi-user server
      const wsUrl = settings?.xr?.multiUserServerUrl || 'ws://localhost:8080';
      multiUserConnection.current = new MultiUserConnection(wsUrl);
      multiUserConnection.current.connect();
      
      logger.info('Multi-user connection initialized', { userId, wsUrl });
    }
    
    return () => {
      if (multiUserConnection.current) {
        multiUserConnection.current.disconnect();
        multiUserConnection.current = null;
      }
    };
  }, [isPresenting, settings?.xr?.enableMultiUser, settings?.xr?.multiUserServerUrl, setLocalUserId]);
  
  // Handle platform changes (Quest 3 AR focused)
  useEffect(() => {
    // Configure interactivity based on Quest 3 AR mode
    const isQuest3AR = isXRMode && sessionType === 'immersive-ar';
    setInteractionEnabled(isQuest3AR && settings?.xr?.enableHandTracking !== false);
    
    // Debug logging
    if (isQuest3AR) {
      if (settings?.system?.debug?.enabled) {
        logger.info('Quest 3 AR mode active, configuring visualisation for hand interaction');
      }
    }
  }, [isXRMode, sessionType, settings?.xr?.enableHandTracking, settings?.system?.debug?.enabled]);
  
  // Update user position and rotation in AR space
  useFrame(() => {
    if (!isPresenting || !player) return;
    
    // Get head position and rotation from XR player
    const position = player.position.toArray() as [number, number, number];
    const rotation = [
      player.rotation.x,
      player.rotation.y,
      player.rotation.z
    ] as [number, number, number];
    
    updateLocalPosition(position, rotation);
  });
  
  // Handle hand gesture interactions with visualisations
  useEffect(() => {
    if (!interactionEnabled) return;
    
    const { pinchState, handPositions, isLeftHandVisible, isRightHandVisible } = handTracking;
    
    // Update selection state for multi-user
    const isSelecting = pinchState.left || pinchState.right;
    updateLocalSelection(isSelecting);
    
    // Perform raycasting for node selection
    if (isSelecting) {
      const handPos = pinchState.left ? handPositions.left : handPositions.right;
      if (handPos) {
        // Create ray from hand position
        const origin = new THREE.Vector3(...handPos);
        const direction = new THREE.Vector3(0, 0, -1); // Forward direction
        
        // Apply hand rotation if available
        if (camera) {
          direction.applyQuaternion(camera.quaternion);
        }
        
        raycastRef.current.set(origin, direction);
        
        // Raycast against graph nodes (implementation would integrate with GraphManager)
        // This is where you'd check for intersections with graph nodes
        
        logger.debug(`Hand selection at [${handPos[0]}, ${handPos[1]}, ${handPos[2]}]`);
      }
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [handTracking.pinchState, handTracking.handPositions, interactionEnabled, camera, updateLocalSelection]);
  
  // Render the visualisation system with AR-specific enhancements
  return (
    <>
      <MetadataVisualizer 
        renderLabels={settings?.visualisation?.labels?.enableLabels !== false}
      />
      
      {/* AR-specific UI overlay */}
      {isPresenting && (
        <group>
          {/* Connection status indicator */}
          <mesh position={[0, 2.5, -2]}>
            <planeGeometry args={[0.5, 0.1]} />
            <meshBasicMaterial 
              color={useMultiUserStore.getState().connectionStatus === 'connected' ? '#00ff00' : '#ff0000'}
              transparent
              opacity={0.8}
            />
          </mesh>
          
          {/* User count display */}
          <mesh position={[0.6, 2.5, -2]}>
            <planeGeometry args={[0.3, 0.1]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
          </mesh>
        </group>
      )}
    </>
  );
};

export default XRVisualisationConnector;