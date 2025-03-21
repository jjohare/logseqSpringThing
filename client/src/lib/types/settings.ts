// Type definitions for application settings

/**
 * Type-safe path for accessing settings
 * Examples: 
 * - "visualization.nodes.color"
 * - "system.debug.enabled"
 */
export type SettingsPath = string;

/**
 * Get the type at a specific path of an object type
 * This provides type safety when accessing nested properties
 */
export type PathValue<T, P extends string> = 
  P extends keyof T ? T[P] :
  P extends `${infer K}.${infer R}` ? 
    K extends keyof T ? 
      PathValue<T[K], R> : 
      never : 
    never;

/**
 * Creates a dot-notation path string from a nested property access
 * This provides type safety when creating paths
 */
export type DotNotation<T, P extends string = ''> = {
  [K in keyof T & string]: 
    P extends '' ? 
      DotNotation<T[K], K> : 
      DotNotation<T[K], `${P}.${K}`> 
} & {
  _path: P
};

// Type for color values in settings
export type ColorValue = string;

// Camera settings
export interface CameraSettings {
  fov?: number;
  near?: number;
  far?: number;
  position?: {
    x: number;
    y: number;
    z: number;
  };
  lookAt?: {
    x: number;
    y: number;
    z: number;
  };
}

// Rendering settings
export interface RenderingSettings {
  shadows: boolean;
  antialias: boolean;
  pixelRatio: number;
  enableBloom: boolean;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
}

// Bloom effect settings
export interface BloomSettings {
  enabled: boolean;
  strength: number;
  threshold: number;
  radius: number;
}

// Label/text settings
export interface LabelSettings {
  enabled: boolean;
  size: number;
  color: ColorValue;
  backgroundColor: ColorValue;
  showDistance: number;
  fadeDistance: number;
}

// Icon settings
export interface IconSettings {
  enabled: boolean;
  size: number;
  opacity: number;
  color: ColorValue;
}

// Metrics display settings
export interface MetricsSettings {
  enabled: boolean;
  refreshRate: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

// Node appearance settings
export interface NodeSettings {
  defaultSize: number;
  minSize: number;
  maxSize: number;
  color: ColorValue;
  highlightColor: ColorValue;
  outlineWidth: number;
  outlineColor: ColorValue;
  selectedColor: ColorValue;
}

// Edge appearance settings
export interface EdgeSettings {
  width: number;
  color: string;
  highlightColor: string;
  opacity: number;
  showLabels: boolean;
  arrowSize: number;
  dashSize: number;
  gapSize: number;
}

// Physics simulation settings
export interface PhysicsSettings {
  enabled: boolean;
  gravity: number;
  friction: number;
  attraction: number;
  repulsion: number;
  damping: number;
  springLength: number;
  iterations: number;
}

// Hologram effect settings
export interface HologramSettings {
  color: ColorValue | number;
  opacity: number;
  ringOpacity: number;
  sphereSizes: number[] | string;
  enableTriangleSphere: boolean;
  triangleSphereSize: number;
  triangleSphereOpacity: number;
  ringRotationSpeed: number;
  globalRotationSpeed: number;
}

// Visualization settings
export interface VisualizationSettings {
  sceneBackground: number;
  rendering: RenderingSettings;
  camera: CameraSettings;
  bloom: BloomSettings;
  labels: LabelSettings;
  icons: IconSettings;
  nodes: NodeSettings;
  edges: EdgeSettings;
  physics: PhysicsSettings;
  hologram: HologramSettings;
  metrics: MetricsSettings;
  showStats: boolean;
  showAxes: boolean;
  showGrid: boolean;
}

// WebSocket settings
export interface WebSocketSettings {
  url?: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  protocol?: string;
}

// Debug settings
export interface DebugSettings {
  enabled: boolean;
  enableDataDebug: boolean;
  enableWebsocketDebug: boolean;
  logBinaryHeaders: boolean;
  logFullJson: boolean;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'json' | 'text';
  
  // Legacy fields for backward compatibility
  showPerformance?: boolean;
  showDataUpdates?: boolean;
}

// System settings
export interface SystemSettings {
  websocket: WebSocketSettings;
  debug: DebugSettings;
  apiEndpoint: string;
  persistSettings: boolean;
}

// Authentication settings
export interface AuthSettings {
  enabled: boolean;
  provider: 'nostr' | 'none';
  required: boolean;
}

// XR (VR/AR) settings
export interface XRSettings {
  enabled: boolean;
  controllerModel: 'default' | 'hands' | 'both';
  movementSpeed: number;
  teleportEnabled: boolean;
  roomScale: boolean;
  showFloor: boolean;
  handInteraction: boolean;
  interactionDistance: number;
  grabThreshold: number;
  controllerRayColor: ColorValue;
  controllerPointerSize: number;
  hapticFeedback: boolean;
}

// Top-level settings object
export interface Settings {
  visualization: VisualizationSettings;
  system: SystemSettings;
  auth: AuthSettings;
  xr: XRSettings;
  [key: string]: any; // Allow additional custom settings
}