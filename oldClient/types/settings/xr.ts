import { XRSessionMode } from '../xr';

export interface XRSettings {
    // Session Settings
    mode: XRSessionMode;
    roomScale: number;  // Scale factor for the entire XR scene (1.0 = real-world scale)
    spaceType: 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded';
    quality: 'low' | 'medium' | 'high';
    
    // Platform Settings
    autoEnterAR?: boolean;
    hideControlPanel?: boolean;
    preferredMode?: XRSessionMode;
    
    // Hand Tracking
    enableHandTracking: boolean;
    handMeshEnabled: boolean;
    handMeshColor: string;
    handMeshOpacity: number;
    handPointSize: number;  // In meters (e.g., 0.006 for 6mm)
    handRayEnabled: boolean;
    handRayColor: string;
    handRayWidth: number;  // In meters (e.g., 0.003 for 3mm)
    gestureSmoothing: number;
    
    // Interaction
    enableHaptics: boolean;
    hapticIntensity: number;
    dragThreshold: number;
    pinchThreshold: number;
    rotationThreshold: number;
    interactionRadius: number;  // In meters (e.g., 0.15 for 15cm)
    movementSpeed: number;
    deadZone: number;
    movementAxes: {
        horizontal: number;
        vertical: number;
    };
    
    // Scene Understanding
    enableLightEstimation: boolean;
    enablePlaneDetection: boolean;
    enableSceneUnderstanding: boolean;
    planeColor: string;
    planeOpacity: number;
    showPlaneOverlay: boolean;
    snapToFloor: boolean;
    planeDetectionDistance?: number;  // In meters (e.g., 3.0 for 3m)
    
    // Passthrough
    enablePassthroughPortal: boolean;
    passthroughOpacity: number;
    passthroughBrightness: number;
    passthroughContrast: number;
    portalSize: number;  // In meters (e.g., 2.5 for 2.5m)
    portalEdgeColor: string;
    portalEdgeWidth: number;  // In meters (e.g., 0.02 for 2cm)
}

// Platform-specific XR settings
export interface QuestXRSettings extends XRSettings {
    enableHandMeshes: boolean;
    enableControllerModel: boolean;
    controllerProfile: string;
}

export interface WebXRSettings extends XRSettings {
    fallbackToInline: boolean;
    requireFeatures: string[];
    optionalFeatures: string[];
}

// Default XR settings
export const defaultXRSettings: XRSettings = {
    // Session Settings
    mode: 'immersive-ar',
    roomScale: 1.0,  // Real-world 1:1 scale
    spaceType: 'local-floor',
    quality: 'high',
    
    // Platform Settings
    autoEnterAR: true,
    hideControlPanel: true,
    preferredMode: 'immersive-ar',
    
    // Hand Tracking
    enableHandTracking: true,
    handMeshEnabled: true,
    handMeshColor: '#ffffff',
    handMeshOpacity: 0.5,
    handPointSize: 0.006,  // 6mm
    handRayEnabled: true,
    handRayColor: '#00ff00',
    handRayWidth: 0.003,  // 3mm
    gestureSmoothing: 0.5,
    
    // Interaction
    enableHaptics: true,
    hapticIntensity: 0.5,
    dragThreshold: 0.02,  // 2cm movement required to start drag
    pinchThreshold: 0.3,  // 30% pinch required for activation
    rotationThreshold: 0.08,  // 8% rotation required for activation
    interactionRadius: 0.15,  // 15cm interaction sphere
    movementSpeed: 0.08,  // 8cm per frame at full stick deflection
    deadZone: 0.12,  // 12% stick movement required
    movementAxes: {
        horizontal: 2,  // Right joystick X
        vertical: 3    // Right joystick Y
    },
    
    // Scene Understanding
    enableLightEstimation: true,
    enablePlaneDetection: true,
    enableSceneUnderstanding: true,
    planeColor: '#808080',
    planeOpacity: 0.5,
    showPlaneOverlay: true,
    snapToFloor: true,
    planeDetectionDistance: 3.0,  // 3 meters
    
    // Passthrough
    enablePassthroughPortal: false,
    passthroughOpacity: 1.0,
    passthroughBrightness: 1.0,
    passthroughContrast: 1.0,
    portalSize: 2.5,  // 2.5 meters
    portalEdgeColor: '#ffffff',
    portalEdgeWidth: 0.02  // 2cm
};
