import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { usePlatform } from '../platform/platform-manager';
import { useSettingsStore } from '../stores/settings-store';
import { createLogger } from '../utils/logger';
const logger = createLogger('HandInteraction');
/**
 * Modern hand interaction system for WebXR
 * Uses React Three Fiber for Quest hand tracking
 */
export const HandInteractionSystem = ({ children, onGestureRecognized, onHandsVisible, enabled = true, interactionMode = 'both', interactionDistance = 1.5, hapticFeedback = true }) => {
    const { scene, gl, camera } = useThree();
    const { isPresenting, session, controllers, player } = useXR();
    const platform = usePlatform();
    const settings = useSettingsStore(state => state.settings.xr);
    const handTrackingEnabled = settings.handInteraction && enabled;
    // State for hands and interaction
    const [handsVisible, setHandsVisible] = useState(false);
    const [visualizeHands, setVisualizeHands] = useState(false);
    const [interactables, setInteractables] = useState([]);
    const [selectedObject, setSelectedObject] = useState(null);
    const [hoveredObject, setHoveredObject] = useState(null);
    // References for hand state
    const leftHandRef = useRef(null);
    const rightHandRef = useRef(null);
    const leftControllerRef = useRef(null);
    const rightControllerRef = useRef(null);
    const leftRayRef = useRef(null);
    const rightRayRef = useRef(null);
    // Gesture state reference
    const gestureStateRef = useRef({
        left: { pinch: false, grip: false, point: false, thumbsUp: false },
        right: { pinch: false, grip: false, point: false, thumbsUp: false }
    });
    // Raycaster for interaction
    const raycasterRef = useRef(new THREE.Raycaster());
    // Initialize raycaster with proper settings
    useEffect(() => {
        if (raycasterRef.current) {
            raycasterRef.current.near = 0.01;
            raycasterRef.current.far = interactionDistance;
            raycasterRef.current.params.Line = { threshold: 0.2 };
            raycasterRef.current.params.Points = { threshold: 0.2 };
        }
    }, [interactionDistance]);
    // Collect all interactable objects in the scene
    useEffect(() => {
        // In a real implementation, this would scan the scene for objects with interactable components
        // For now, we'll just have an empty array that would be populated by components
    }, [scene]);
    // Map to store joint objects
    const jointsRef = useRef(new Map());
    // Initialize hand tracking
    useEffect(() => {
        if (!handTrackingEnabled)
            return;
        // Create hand groups if they don't exist
        if (!leftHandRef.current) {
            leftHandRef.current = new THREE.Group();
            leftHandRef.current.name = 'left-hand';
            scene.add(leftHandRef.current);
        }
        // Create controller rays if they don't exist
        if (!leftRayRef.current) {
            const rayGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -interactionDistance)
            ]);
            const rayMaterial = new THREE.LineBasicMaterial({
                color: settings.controllerRayColor || 0x00ff00,
                opacity: 0.7,
                transparent: true
            });
            leftRayRef.current = new THREE.Line(rayGeometry, rayMaterial);
        }
        if (!rightHandRef.current) {
            rightHandRef.current = new THREE.Group();
            rightHandRef.current.name = 'right-hand';
            scene.add(rightHandRef.current);
        }
        // Create right controller ray
        if (!rightRayRef.current) {
            const rayGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -interactionDistance)
            ]);
            const rayMaterial = new THREE.LineBasicMaterial({
                color: settings.controllerRayColor || 0x00ff00,
                opacity: 0.7,
                transparent: true
            });
            rightRayRef.current = new THREE.Line(rayGeometry, rayMaterial);
        }
        logger.info('Hand tracking system initialized');
        // Return cleanup function
        return () => {
            if (leftHandRef.current) {
                scene.remove(leftHandRef.current);
                leftHandRef.current = null;
            }
            if (rightHandRef.current) {
                scene.remove(rightHandRef.current);
                rightHandRef.current = null;
            }
            if (leftRayRef.current) {
                scene.remove(leftRayRef.current);
                leftRayRef.current = null;
            }
            if (rightRayRef.current) {
                scene.remove(rightHandRef.current);
                rightHandRef.current = null;
            }
            jointsRef.current.clear();
            logger.info('Hand tracking system disposed');
        };
    }, [handTrackingEnabled, scene, interactionDistance, settings.controllerRayColor]);
    // Update controller references when WebXR session changes
    useEffect(() => {
        if (!isPresenting || !platform.isWebXRSupported)
            return;
        // Attach to XR controllers if available
        if (controllers && controllers.length > 0) {
            controllers.forEach(controller => {
                if (controller.inputSource.handedness === 'left') {
                    leftControllerRef.current = controller.controller;
                    if (leftRayRef.current) {
                        controller.controller.add(leftRayRef.current);
                    }
                }
                else if (controller.inputSource.handedness === 'right') {
                    rightControllerRef.current = controller.controller;
                    if (rightRayRef.current) {
                        controller.controller.add(rightRayRef.current);
                    }
                }
            });
        }
        // Set up controller event listeners
        const handleControllerEvent = (event, type, hand) => {
            handleInteractionEvent({
                type,
                distance: 'far',
                controller: hand === 'left' ? leftControllerRef.current : rightControllerRef.current,
                hand,
                point: event.intersections?.[0]?.point
            });
        };
        // Return cleanup function that removes event listeners
        return () => {
            // In a real implementation, we would remove event listeners here
        };
    }, [isPresenting, platform.isWebXRSupported, controllers, hapticFeedback]);
    // Handle various interaction events from controllers or hand tracking
    const handleInteractionEvent = (event) => {
        // Process different event types
        switch (event.type) {
            case 'select':
                // Handle selection (trigger press)
                if (hoveredObject) {
                    setSelectedObject(hoveredObject);
                    // Trigger haptic feedback if enabled
                    if (hapticFeedback && event.controller && session) {
                        const gamepad = event.controller.inputSource?.gamepad;
                        if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators[0]) {
                            gamepad.hapticActuators[0].pulse(0.5, 100);
                        }
                    }
                    logger.info(`Selected object: ${hoveredObject.name}`);
                }
                break;
            case 'hover':
                // Handle hover state (ray pointing at object)
                if (event.point && event.controller) {
                    setHoveredObject(event.controller);
                    logger.debug(`Hovering object at ${event.point.x}, ${event.point.y}, ${event.point.z}`);
                }
                break;
            case 'unhover':
                // Clear hover state
                setHoveredObject(null);
                break;
            case 'squeeze':
                // Handle grip button press
                if (selectedObject) {
                    logger.info(`Squeezing object: ${selectedObject.name}`);
                    // Trigger stronger haptic feedback for squeeze
                    if (hapticFeedback && event.controller && session) {
                        const gamepad = event.controller.inputSource?.gamepad;
                        if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators[0]) {
                            gamepad.hapticActuators[0].pulse(0.8, 150);
                        }
                    }
                }
                break;
            case 'move':
                // Handle movement of selected object
                if (selectedObject && event.controller) {
                    // In a real implementation, this would update the position/rotation of the selected object
                    logger.debug(`Moving selected object with controller`);
                }
                break;
        }
    };
    // Perform gesture recognition on hand joints
    const recognizeGestures = (handedness, joints) => {
        if (joints.size === 0)
            return;
        // Get key finger joints for gesture recognition
        const thumbTip = joints.get('thumb-tip');
        const indexTip = joints.get('index-finger-tip');
        const indexMiddle = joints.get('index-finger-phalanx-intermediate');
        const middleTip = joints.get('middle-finger-tip');
        const ringTip = joints.get('ring-finger-tip');
        const pinkyTip = joints.get('pinky-finger-tip');
        const wrist = joints.get('wrist');
        if (!thumbTip || !indexTip || !wrist)
            return;
        // Check thumb-index pinch
        const thumbToIndexDistance = thumbTip.position.distanceTo(indexTip.position);
        const isPinching = thumbToIndexDistance < 0.03; // 3cm threshold
        // Check point gesture (index extended, others curled)
        const isPointing = false; // Simplified - would check index extension and other fingers curled
        // Check grip gesture (all fingers curled)
        const isGripping = false; // Simplified - would check all fingers curled
        // Check thumbs up gesture
        const isThumbsUp = false; // Simplified - would check thumb orientation
        // Update gesture state
        const previousState = gestureStateRef.current[handedness];
        gestureStateRef.current[handedness] = {
            pinch: isPinching,
            grip: isGripping,
            point: isPointing,
            thumbsUp: isThumbsUp
        };
        // Notify about gesture changes
        if (isPinching && !previousState.pinch && onGestureRecognized) {
            onGestureRecognized({
                gesture: 'pinch',
                confidence: 0.9,
                hand: handedness
            });
            // Trigger interaction event for pinch
            handleInteractionEvent({ type: 'select', distance: 'near', hand: handedness });
        }
    };
    // Process hand data on each frame
    useFrame(({ clock }) => {
        if (!handTrackingEnabled || !isPresenting)
            return;
        // Process controller raycasting for far interaction
        if (interactionMode !== 'hands-only' && (leftControllerRef.current || rightControllerRef.current)) {
            // Perform raycasting from controllers to detect interactive objects
            if (leftControllerRef.current) {
                raycasterRef.current.ray.origin.setFromMatrixPosition(leftControllerRef.current.matrixWorld);
                raycasterRef.current.ray.direction.set(0, 0, -1).applyMatrix4(leftControllerRef.current.matrixWorld);
                const intersects = raycasterRef.current.intersectObjects(interactables.map(obj => obj.object), false);
                if (intersects.length > 0) {
                    handleInteractionEvent({
                        type: 'hover',
                        distance: 'far',
                        controller: leftControllerRef.current,
                        hand: 'left',
                        point: intersects[0].point
                    });
                }
            }
            // Same for right controller
            if (rightControllerRef.current) {
                // Similar raycasting logic for right controller
            }
        }
        // Process hand tracking for near interaction
        if (interactionMode !== 'controllers-only' && (leftHandRef.current || rightHandRef.current)) {
            // Process joints and recognize gestures for left hand
            if (leftHandRef.current && leftHandRef.current.children.length > 0) {
                const leftJoints = new Map();
                leftHandRef.current.children.forEach(joint => {
                    leftJoints.set(joint.name, joint);
                });
                recognizeGestures('left', leftJoints);
            }
            // Process joints and recognize gestures for right hand
            if (rightHandRef.current && rightHandRef.current.children.length > 0) {
                const rightJoints = new Map();
                rightHandRef.current.children.forEach(joint => {
                    rightJoints.set(joint.name, joint);
                });
                recognizeGestures('right', rightJoints);
            }
        }
    });
    // Toggle hand visualization for debugging
    const toggleHandVisualization = () => {
        setVisualizeHands(!visualizeHands);
    };
    if (!handTrackingEnabled)
        return null;
    return (
    // Only the container group is rendered - the actual implementation is done in useFrame
    _jsx("group", { name: "hand-interaction-system", children: children }));
};
// Hook for hand tracking in components
export const useHandTracking = () => {
    const [pinchState, setPinchState] = useState({
        left: false,
        right: false
    });
    // Hand positions state
    const [handPositions, setHandPositions] = useState({
        left: null,
        right: null
    });
    // Gesture state
    const [gestureState, setGestureState] = useState({
        left: { pinch: false, grip: false, point: false, thumbsUp: false },
        right: { pinch: false, grip: false, point: false, thumbsUp: false }
    });
    // Update hand positions and gestures state from the system
    useFrame(() => {
        // This would be implemented to sync with the hand tracking system 
        // and update the hook's state based on the HandInteractionSystem
    });
    return {
        pinchState,
        handPositions,
        gestureState,
        isLeftHandVisible: !!handPositions.left,
        isRightHandVisible: !!handPositions.right
    };
};
// Interactable component that works with hand tracking
export const HandInteractable = ({ children, id, onHover, onUnhover, onSelect, position = [0, 0, 0], scale = [1, 1, 1] }) => {
    const [isHovered, setIsHovered] = useState(false);
    const handlePointerOver = () => {
        setIsHovered(true);
        if (onHover)
            onHover();
    };
    const handlePointerOut = () => {
        setIsHovered(false);
        if (onUnhover)
            onUnhover();
    };
    const handleClick = () => {
        if (onSelect)
            onSelect();
    };
    return (_jsxs("group", { position: position, name: id || 'interactable', scale: scale, onPointerOver: handlePointerOver, onPointerOut: handlePointerOut, onClick: handleClick, children: [children, isHovered && (_jsxs("mesh", { scale: [1.05, 1.05, 1.05], children: [_jsx("sphereGeometry", { args: [1, 16, 16] }), _jsx("meshBasicMaterial", { color: "#ffffff", wireframe: true, transparent: true, opacity: 0.2 })] }))] }));
};
/**
 * This is a stub implementation for the Quest-specific XR features.
 * In a real implementation, this would integrate with the WebXR API
 * and Quest hand tracking capabilities.
 *
 * Key features that would be implemented:
 * 1. Hand tracking using WebXR Hand Input API
 * 2. Gesture recognition (pinch, grip, point)
 * 3. Proper integration with react-three/fiber and react-three/xr
 * 4. AR passthrough mode specific to Quest devices
 * 5. Performance optimizations for XR
 */
export default HandInteractionSystem;
