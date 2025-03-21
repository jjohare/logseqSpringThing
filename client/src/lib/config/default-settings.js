export const defaultSettings = {
    visualization: {
        sceneBackground: 0x000000, // Black
        rendering: {
            shadows: true,
            antialias: true,
            pixelRatio: window.devicePixelRatio > 1 ? 1.5 : 1, // Balance quality and performance
            enableBloom: true,
            bloomStrength: 1.5,
            bloomThreshold: 0.4,
            bloomRadius: 0.85
        },
        camera: {
            fov: 75,
            near: 0.1,
            far: 2000,
            position: { x: 0, y: 10, z: 50 },
            lookAt: { x: 0, y: 0, z: 0 }
        },
        bloom: {
            enabled: true,
            strength: 1.5,
            threshold: 0.4,
            radius: 0.85
        },
        labels: {
            enabled: true,
            size: 0.5,
            color: '#ffffff',
            backgroundColor: '#00000080',
            showDistance: 50,
            fadeDistance: 100
        },
        icons: {
            enabled: true,
            size: 1.0,
            opacity: 0.8,
            color: '#ffffff'
        },
        metrics: {
            enabled: false,
            refreshRate: 1000,
            position: 'top-right'
        },
        nodes: {
            defaultSize: 1.0,
            minSize: 0.5,
            maxSize: 3.0,
            color: '#ff4500',
            highlightColor: '#ffff00',
            outlineWidth: 0.1,
            outlineColor: '#ffffff',
            selectedColor: '#00ff00'
        },
        edges: {
            width: 1.0,
            color: '#ffffff',
            highlightColor: '#ffff00',
            opacity: 0.8,
            showLabels: false,
            arrowSize: 0.5,
            dashSize: 3.0,
            gapSize: 1.0
        },
        physics: {
            enabled: true,
            gravity: 0.0,
            friction: 0.9,
            attraction: 0.5,
            repulsion: 1.0,
            damping: 0.8,
            springLength: 30,
            iterations: 50
        },
        hologram: {
            color: 0x00ffff,
            opacity: 0.7,
            ringOpacity: 0.7,
            sphereSizes: [40, 80],
            enableTriangleSphere: true,
            triangleSphereSize: 60,
            triangleSphereOpacity: 0.3,
            ringRotationSpeed: 0.5,
            globalRotationSpeed: 0.2
        },
        showStats: false,
        showAxes: false,
        showGrid: false
    },
    system: {
        websocket: {
            reconnectInterval: 2000,
            maxReconnectAttempts: 10
        },
        debug: {
            enabled: false,
            enableDataDebug: false,
            enableWebsocketDebug: false,
            logBinaryHeaders: false,
            logFullJson: false,
            logLevel: 'info',
            logFormat: 'text',
            // Legacy fields for backward compatibility
            showPerformance: false,
            showDataUpdates: false
        },
        apiEndpoint: '/api',
        persistSettings: true
    },
    auth: {
        enabled: true,
        provider: 'nostr',
        required: false
    },
    xr: {
        enabled: true,
        controllerModel: 'default',
        movementSpeed: 1.0,
        teleportEnabled: true,
        roomScale: true,
        showFloor: true,
        handInteraction: true,
        interactionDistance: 1.5,
        grabThreshold: 0.1,
        controllerRayColor: '#ffffff',
        controllerPointerSize: 0.01,
        hapticFeedback: true
    }
};
