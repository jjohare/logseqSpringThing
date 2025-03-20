import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { XRSessionManager } from '../../lib/managers/xr-session-manager';
import { XRInitializer } from '../../lib/managers/xr-initializer';
import { SceneManager } from '../../lib/managers/scene-manager';
import { createLogger } from '../../lib/utils/logger';
import HandInteractionSystem from '../../lib/xr/HandInteractionSystem';
import { debugState } from '../../lib/utils/debug-state';
import { useSettingsStore } from '../../lib/settings-store';
const logger = createLogger('XRController');
/**
 * XRController component initializes and manages WebXR in the React application.
 * This is a non-rendering component that coordinates XR functionality.
 */
const XRController = () => {
    const [sessionManager, setSessionManager] = useState(null);
    const [xrInitializer, setXRInitializer] = useState(null);
    const { scene, gl, camera } = useThree();
    const settings = useSettingsStore(state => state.settings);
    const [handsVisible, setHandsVisible] = useState(false);
    const [handTrackingEnabled, setHandTrackingEnabled] = useState(true);
    // Initialize XR session manager
    useEffect(() => {
        if (!scene || !gl || !camera)
            return;
        try {
            // Get the scene manager and initialize XR
            const sceneManager = SceneManager.getInstance();
            const xrSessionManager = XRSessionManager.getInstance(sceneManager);
            // Store reference for other effects
            setSessionManager(xrSessionManager);
            if (debugState.isEnabled()) {
                logger.info('XR session manager initialized');
            }
            // Clean up on unmount
            return () => {
                if (debugState.isEnabled()) {
                    logger.info('Cleaning up XR session manager');
                }
            };
        }
        catch (error) {
            logger.error('Failed to initialize XR session manager:', error);
        }
    }, [scene, gl, camera]);
    // Initialize XR initializer once session manager is ready
    useEffect(() => {
        if (!sessionManager)
            return;
        try {
            // Create XR initializer
            const initializer = XRInitializer.getInstance(sessionManager);
            setXRInitializer(initializer);
            if (debugState.isEnabled()) {
                logger.info('XR initializer created');
            }
            // Clean up on unmount
            return () => {
                if (debugState.isEnabled()) {
                    logger.info('Cleaning up XR initializer');
                }
                initializer.dispose();
            };
        }
        catch (error) {
            logger.error('Failed to initialize XR:', error);
        }
    }, [sessionManager]);
    // Apply settings to XR components when settings change
    useEffect(() => {
        if (!settings || !sessionManager || !xrInitializer)
            return;
        try {
            // Initialize or update XR components with settings
            sessionManager.initialize(settings);
            xrInitializer.initialize(settings);
            if (debugState.isEnabled()) {
                logger.info('XR settings applied');
            }
        }
        catch (error) {
            logger.error('Failed to apply XR settings:', error);
        }
    }, [settings, sessionManager, xrInitializer]);
    // Handle gesture recognition
    const handleGestureRecognized = useCallback((gesture) => {
        if (debugState.isEnabled()) {
            logger.info(`Gesture recognized: ${gesture.gesture} (${gesture.confidence.toFixed(2)}) with ${gesture.hand} hand`);
        }
        // Forward gesture to session manager if needed
        if (sessionManager) {
            sessionManager.notifyGestureRecognized(gesture);
        }
    }, [sessionManager]);
    // Handle hand visibility changes
    const handleHandsVisible = useCallback((visible) => {
        setHandsVisible(visible);
        // Forward event to session manager if needed
        if (sessionManager) {
            sessionManager.notifyHandsVisibilityChanged(visible);
        }
    }, [sessionManager]);
    // Render HandInteractionSystem (invisible but functional)
    return (_jsx(_Fragment, { children: _jsx(HandInteractionSystem, { enabled: handTrackingEnabled, onGestureRecognized: handleGestureRecognized, onHandsVisible: handleHandsVisible }) }));
};
export default XRController;
