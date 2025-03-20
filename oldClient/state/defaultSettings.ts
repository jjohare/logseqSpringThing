import { Settings } from '../types/settings/base';

export const defaultSettings: Settings = {
    visualization: {
        nodes: {
            quality: 'medium',
            enableInstancing: true,
            enableHologram: true,
            enableMetadataShape: true,
            enableMetadataVisualization: true,
            sizeRange: [0.05, 0.2],
            baseColor: '#4a90e2',
            opacity: 0.8,
            colorRangeAge: ['#2ecc71', '#e74c3c'],
            colorRangeLinks: ['#3498db', '#9b59b6'],
            metalness: 0.5,
            roughness: 0.5
        },
        edges: {
            color: '#95a5a6',
            opacity: 0.6,
            arrowSize: 0.02,
            baseWidth: 0.005,
            enableArrows: true,
            widthRange: [0.005, 0.01],
            quality: 'medium',
            enableFlowEffect: true,
            flowSpeed: 1,
            flowIntensity: 0.5,
            glowStrength: 0.3,
            distanceIntensity: 1,
            useGradient: true,
            gradientColors: ['#3498db', '#2ecc71']
        },
        physics: {
            enabled: true,
            attractionStrength: 0.1,
            repulsionStrength: 0.2,
            springStrength: 0.3,
            damping: 0.8,
            iterations: 100,
            maxVelocity: 2,
            collisionRadius: 0.1,
            enableBounds: true,
            boundsSize: 0.33,
            repulsionDistance: 0.5,
            massScale: 1,
            boundaryDamping: 0.5
        },
        rendering: {
            ambientLightIntensity: 0.5,
            directionalLightIntensity: 0.8,
            environmentIntensity: 1.0,
            backgroundColor: '#1a1a1a',
            enableAmbientOcclusion: true,
            enableAntialiasing: true,
            enableShadows: true,
            shadowMapSize: 2048,
            shadowBias: 0.00001,
            context: 'desktop'
        },
        animations: {
            enableNodeAnimations: true,
            enableMotionBlur: true,
            motionBlurStrength: 0.5,
            selectionWaveEnabled: true,
            pulseEnabled: true,
            pulseSpeed: 1,
            pulseStrength: 0.5,
            waveSpeed: 1
        },
        labels: {
            enableLabels: true,
            desktopFontSize: 14,
            textColor: '#ffffff',
            textOutlineColor: '#000000',
            textOutlineWidth: 2,
            textResolution: 32,
            textPadding: 4,
            billboardMode: 'camera',
            visibilityThreshold: 50
        },
        bloom: {
            enabled: true,
            strength: 0.5,
            radius: 0.5,
            threshold: 0.7,
            edgeBloomStrength: 0.3,
            nodeBloomStrength: 0.5,
            environmentBloomStrength: 0.2
        },
        hologram: {
            ringCount: 3,
            sphereSizes: [0.08, 0.16],
            ringRotationSpeed: 0.5,
            globalRotationSpeed: 0.2,
            ringColor: '#00ff00',
            ringOpacity: 0.5,
            enableBuckminster: true,
            buckminsterSize: 0.16,
            buckminsterOpacity: 0.3,
            enableGeodesic: true,
            geodesicSize: 0.16,
            geodesicOpacity: 0.3,
            enableTriangleSphere: true,
            triangleSphereSize: 0.16,
            triangleSphereOpacity: 0.3
        }
    },
    system: {
        websocket: {
            reconnectAttempts: 3,
            reconnectDelay: 1000,
            binaryChunkSize: 16384,
            compressionEnabled: true,
            compressionThreshold: 1024,
            updateRate: 60
        },
        debug: {
            enabled: false,
            enableDataDebug: false,
            enableWebsocketDebug: false,
            logBinaryHeaders: false,
            logFullJson: false,
            logLevel: 'info',
            logFormat: 'json'
        }
    },
    xr: {
        mode: 'immersive-ar',
        roomScale: 1.0,  // Real-world 1:1 scale
        spaceType: 'local-floor',
        quality: 'high',
        autoEnterAR: true,
        hideControlPanel: true,
        preferredMode: 'immersive-ar',
        enableHandTracking: true,
        handMeshEnabled: true,
        handMeshColor: '#00ff00',
        handMeshOpacity: 0.5,
        handPointSize: 5,
        handRayEnabled: true,
        handRayColor: '#00ff00',
        handRayWidth: 2,
        gestureSmoothing: 0.5,
        enableHaptics: true,
        hapticIntensity: 0.5,
        dragThreshold: 0.02,
        pinchThreshold: 0.7,
        rotationThreshold: 0.5,
        interactionRadius: 0.1,
        movementSpeed: 0.08,  // 8cm per frame at full stick deflection
        deadZone: 0.12,  // 12% stick movement required
        movementAxes: {
            horizontal: 2,  // Right joystick X
            vertical: 3    // Right joystick Y
        },
        enableLightEstimation: true,
        enablePlaneDetection: true,
        enableSceneUnderstanding: true,
        planeColor: '#00ff00',
        planeOpacity: 0.3,
        showPlaneOverlay: true,
        snapToFloor: true,
        planeDetectionDistance: 3.0,
        enablePassthroughPortal: true,
        passthroughOpacity: 0.8,
        passthroughBrightness: 1,
        passthroughContrast: 1,
        portalSize: 2,
        portalEdgeColor: '#00ff00',
        portalEdgeWidth: 0.02
    }
};