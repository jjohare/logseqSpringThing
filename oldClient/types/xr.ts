import * as THREE from 'three';
import { Platform } from '../core/types';

// Core XR Types
export type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';
export type XRHandedness = 'none' | 'left' | 'right';
export type XRSessionState = 'inactive' | 'starting' | 'active' | 'ending' | 'cooldown';
export type XRHand = THREE.XRHand;

export type XRHandJoint =
    | 'wrist'
    | 'thumb-metacarpal'
    | 'thumb-phalanx-proximal'
    | 'thumb-phalanx-distal'
    | 'thumb-tip'
    | 'index-finger-metacarpal'
    | 'index-finger-phalanx-proximal'
    | 'index-finger-phalanx-intermediate'
    | 'index-finger-phalanx-distal'
    | 'index-finger-tip'
    | 'middle-finger-metacarpal'
    | 'middle-finger-phalanx-proximal'
    | 'middle-finger-phalanx-intermediate'
    | 'middle-finger-phalanx-distal'
    | 'middle-finger-tip'
    | 'ring-finger-metacarpal'
    | 'ring-finger-phalanx-proximal'
    | 'ring-finger-phalanx-intermediate'
    | 'ring-finger-phalanx-distal'
    | 'ring-finger-tip'
    | 'pinky-finger-metacarpal'
    | 'pinky-finger-phalanx-proximal'
    | 'pinky-finger-phalanx-intermediate'
    | 'pinky-finger-phalanx-distal'
    | 'pinky-finger-tip';

export interface XRSessionConfig {
    mode: XRSessionMode;
    features: {
        required?: string[];
        optional?: string[];
    };
    spaceType: XRReferenceSpaceType;
}

// Input and Interaction Types
export interface HapticActuator {
    pulse: (intensity: number, duration: number) => Promise<boolean>;
}

export interface WorldObject3D extends THREE.Object3D {
    getWorldPosition(target: THREE.Vector3): THREE.Vector3;
}

export interface XRControllerState {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    hapticActuator?: HapticActuator;
    platform: Platform;
}

export interface XRHandJointState {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    radius?: number;
}

export interface XRHandState {
    position: THREE.Vector3;
    joints: Map<XRHandJoint, XRHandJointState>;
    pinchStrength: number;
    gripStrength: number;
    platform: Platform;
}

export interface XRHandWithHaptics extends THREE.Group {
    hapticActuators?: HapticActuator[];
    hand: {
        joints: {
            [key in XRHandJoint]?: WorldObject3D;
        };
    };
    pinchStrength: number;
    gripStrength: number;
    userData: {
        hapticActuator?: HapticActuator;
        platform: Platform;
    };
}

// Input Configuration
export interface XRInputConfig {
    controllers: boolean;
    hands: boolean;
    haptics: boolean;
}

// Event Types
export interface XRControllerEvent {
    controller: XRSpace;
    inputSource: XRInputSource;
    hapticActuator?: HapticActuator;
}

export interface XRHandEvent {
    hand: XRHandWithHaptics;
    inputSource: XRInputSource;
}

export interface XRInteractionState {
    pinching: boolean;
    pinchStrength: number;
    gripping: boolean;
    gripStrength: number;
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
}

// Platform-specific Types
export interface QuestHandTracking extends XRHandState {
    confidence: number;
    gestureId?: number;
}

export interface QuestControllerTracking extends XRControllerState {
    thumbstick: THREE.Vector2;
    trigger: number;
    grip: number;
}
