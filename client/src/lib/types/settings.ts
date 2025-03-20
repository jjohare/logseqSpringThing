// Type definitions for application settings

// Allow using as an index key
export type SettingsPath = string;

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
  shadows?: boolean;
  antialias?: boolean;
  pixelRatio?: number;
  enableBloom?: boolean;
  bloomStrength?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
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
  color: string;
  backgroundColor?: string;
  showDistance?: number;
  fadeDistance?: number;
}

// Icon settings
export interface IconSettings {
  enabled: boolean;
  size: number;
  opacity: number;
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
  color: string;
  highlightColor: string;
  outlineWidth: number;
  outlineColor: string;
  selectedColor: string;
}

// Edge appearance settings
export interface EdgeSettings {
  width: number;
  color: string;
  highlightColor: string;
  opacity: number;
  showLabels: boolean;
  arrowSize: number;
  dashSize?: number;
  gapSize?: number;
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
  color: string | number;
  opacity?: number;
  ringOpacity?: number;
  sphereSizes?: number[] | string;
  enableTriangleSphere?: boolean;
  triangleSphereSize?: number;
  triangleSphereOpacity?: number;
  ringRotationSpeed?: number;
  globalRotationSpeed?: number;
}

// Visualization settings
export interface VisualizationSettings {
  sceneBackground?: number;
  rendering?: RenderingSettings;
  camera?: CameraSettings;
  bloom?: BloomSettings;
  labels?: LabelSettings;
  icons?: IconSettings;
  nodes?: NodeSettings;
  edges?: EdgeSettings;
  physics?: PhysicsSettings;
  hologram?: HologramSettings;
  metrics?: MetricsSettings;
  showStats?: boolean;
  showAxes?: boolean;
  showGrid?: boolean;
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
  showPerformance: boolean;
  showDataUpdates: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// System settings
export interface SystemSettings {
  websocket: WebSocketSettings;
  debug: DebugSettings;
  apiEndpoint?: string;
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
}

// Top-level settings object
export interface Settings {
  visualization?: VisualizationSettings;
  system?: SystemSettings;
  auth?: AuthSettings;
  xr?: XRSettings;
  [key: string]: any; // Allow additional custom settings
}