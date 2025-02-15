// Base settings interfaces
import { XRSettings } from './xr';

export interface Settings {
    visualization: {
        nodes: NodeSettings;
        edges: EdgeSettings;
        physics: PhysicsSettings;
        rendering: RenderingSettings;
        animations: AnimationSettings;
        labels: LabelSettings;
        bloom: BloomSettings;
        hologram: HologramSettings;
    };
    system: {
        websocket: WebSocketSettings;
        debug: DebugSettings;
    };
    xr: XRSettings;
}

export interface NodeSettings {
    quality: 'low' | 'medium' | 'high';
    enableInstancing: boolean;
    enableHologram: boolean;
    enableMetadataShape: boolean;
    enableMetadataVisualization: boolean;
    sizeRange: [number, number];
    baseColor: string;
    opacity: number;
    colorRangeAge: [string, string];
    colorRangeLinks: [string, string];
    metalness: number;
    roughness: number;
}

export interface EdgeSettings {
    color: string;
    opacity: number;
    arrowSize: number;
    baseWidth: number;
    enableArrows: boolean;
    widthRange: [number, number];
    quality: 'low' | 'medium' | 'high';
    // New shader-based edge settings
    enableFlowEffect: boolean;
    flowSpeed: number;
    flowIntensity: number;
    glowStrength: number;
    distanceIntensity: number;
    useGradient: boolean;
    gradientColors: [string, string];
}

export interface AnimationSettings {
    enableNodeAnimations: boolean;
    enableMotionBlur: boolean;
    motionBlurStrength: number;
    selectionWaveEnabled: boolean;
    pulseEnabled: boolean;
    pulseSpeed: number;
    pulseStrength: number;
    waveSpeed: number;
}

export interface LabelSettings {
    enableLabels: boolean;
    desktopFontSize: number;
    textColor: string;
    textOutlineColor: string;
    textOutlineWidth: number;
    textResolution: number;
    textPadding: number;
    billboardMode: 'camera' | 'vertical';
}

export interface BloomSettings {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
    edgeBloomStrength: number;
    nodeBloomStrength: number;
    environmentBloomStrength: number;
}

export interface HologramSettings {
    ringCount: number;
    sphereSizes: number[];  // Native world units (e.g. [40, 80, 120])
    ringRotationSpeed: number;
    globalRotationSpeed: number;
    ringColor: string;
    ringOpacity: number;
    enableBuckminster: boolean;
    buckminsterSize: number;  // Native world units (e.g. 120)
    buckminsterOpacity: number;
    enableGeodesic: boolean;
    geodesicSize: number;  // Native world units (e.g. 100)
    geodesicOpacity: number;
    enableTriangleSphere: boolean;
    triangleSphereSize: number;  // Native world units (e.g. 140)
    triangleSphereOpacity: number;
}

export interface PhysicsSettings {
    enabled: boolean;
    attractionStrength: number;
    repulsionStrength: number;
    springStrength: number;
    damping: number;
    iterations: number;
    maxVelocity: number;
    collisionRadius: number;
    enableBounds: boolean;
    boundsSize: number;
}

export interface RenderingSettings {
    ambientLightIntensity: number;
    directionalLightIntensity: number;
    environmentIntensity: number;
    backgroundColor: string;
    enableAmbientOcclusion: boolean;
    enableAntialiasing: boolean;
    enableShadows: boolean;
    shadowMapSize: number;
    shadowBias: number;
    context: 'ar' | 'desktop';
}

export interface WebSocketSettings {
    reconnectAttempts: number;
    reconnectDelay: number;
    binaryChunkSize: number;
    compressionEnabled: boolean;
    compressionThreshold: number;
    updateRate: number;
}

export interface DebugSettings {
    enabled: boolean;
    enableDataDebug: boolean;
    enableWebsocketDebug: boolean;
    logBinaryHeaders: boolean;
    logFullJson: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    logFormat: string;
}

// Helper type for settings paths
export type SettingsPath = string;

// Helper type for settings values
export type SettingsValue = string | number | boolean | number[] | object;
