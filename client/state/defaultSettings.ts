import type { Settings } from '../types/settings';

export const defaultSettings: Settings = {
    animations: {
        enableMotionBlur: false,
        enableNodeAnimations: false,
        motionBlurStrength: 0.4,
        selectionWaveEnabled: false,
        pulseEnabled: false,
        rippleEnabled: false,
        edgeAnimationEnabled: false,
        flowParticlesEnabled: false
    },
    ar: {
        dragThreshold: 0.04,
        enableHandTracking: true,
        enableHaptics: true,
        enableLightEstimation: true,
        enablePassthroughPortal: false,
        enablePlaneDetection: true,
        enableSceneUnderstanding: true,
        gestureSsmoothing: 0.5,
        handMeshColor: "#FFD700",
        handMeshEnabled: true,
        handMeshOpacity: 0.3,
        handPointSize: 0.01,
        handRayColor: "#FFD700",
        handRayEnabled: true,
        handRayWidth: 0.002,
        hapticIntensity: 0.7,
        passthroughBrightness: 1.0,
        passthroughContrast: 1.0,
        passthroughOpacity: 0.8,
        pinchThreshold: 0.015,
        planeColor: "#808080",
        planeOpacity: 0.5,
        portalEdgeColor: "#00FF00",
        portalEdgeWidth: 0.02,
        portalSize: 2.0,
        roomScale: true,
        rotationThreshold: 0.08,
        showPlaneOverlay: true,
        snapToFloor: true
    },
    audio: {
        enableSpatialAudio: false,
        enableInteractionSounds: false,
        enableAmbientSounds: false
    },
    bloom: {
        edgeBloomStrength: 0.3,
        enabled: false,
        environmentBloomStrength: 0.5,
        nodeBloomStrength: 0.2,
        radius: 0.5,
        strength: 1.8
    },
    clientDebug: {
        enableDataDebug: false,
        enableWebsocketDebug: false,
        enabled: false,
        logBinaryHeaders: false,
        logFullJson: false
    },
    edges: {
        arrowSize: 0.2,
        baseWidth: 2,
        color: "#917f18",
        enableArrows: false,
        opacity: 0.6,
        widthRange: [1, 3]
    },
    labels: {
        desktopFontSize: 48,
        enableLabels: true,
        textColor: "#FFFFFF"
    },
    network: {
        bindAddress: "0.0.0.0",
        domain: "localhost",
        port: 3000
    },
    nodes: {
        baseColor: "#c3ab6f",
        baseSize: 1,
        clearcoat: 0.5,
        enableHoverEffect: false,
        enableInstancing: false,
        highlightColor: "#822626",
        highlightDuration: 300,
        hoverScale: 1.2,
        materialType: "basic",
        metalness: 0.3,
        opacity: 0.4,
        roughness: 0.35,
        sizeByConnections: true,
        sizeRange: [1, 10]
    },
    physics: {
        attractionStrength: 0.015,
        boundsSize: 12,
        collisionRadius: 0.25,
        damping: 0.88,
        enableBounds: true,
        enabled: false,
        iterations: 500,
        maxVelocity: 2.5,
        repulsionStrength: 1500,
        springStrength: 0.018
    },
    rendering: {
        ambientLightIntensity: 0.7,
        backgroundColor: "#000000",
        directionalLightIntensity: 1,
        enableAmbientOcclusion: false,
        enableAntialiasing: true,
        enableShadows: false,
        environmentIntensity: 1.2
    },
    websocket: {
        heartbeatInterval: 15000,
        heartbeatTimeout: 60000,
        maxMessageSize: 100485760
    }
};