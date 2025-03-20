// Type definitions for settings

export type SettingsPath = string | '';

// Node settings
export interface NodeSettings {
  baseColor: string;
  metalness: number;
  opacity: number;
  roughness: number;
  sizeRange: [number, number];
  quality: 'low' | 'medium' | 'high';
  enableInstancing: boolean;
  enableHologram: boolean;
  enableMetadataShape: boolean;
  enableMetadataVisualization: boolean;
}

// Edge settings
export interface EdgeSettings {
  arrowSize: number;
  baseWidth: number;
  color: string;
  enableArrows: boolean;
  opacity: number;
  widthRange: [number, number];
  quality: 'low' | 'medium' | 'high';
  enableFlowEffect: boolean;
  flowSpeed: number;
  flowIntensity: number;
  glowStrength: number;
  distanceIntensity: number;
  useGradient: boolean;
  gradientColors: [string, string];
}

// Physics settings
export interface PhysicsSettings {
  attractionStrength: number;
  boundsSize: number;
  collisionRadius: number;
  damping: number;
  enableBounds: boolean;
  enabled: boolean;
  iterations: number;
  maxVelocity: number;
  repulsionStrength: number;
  springStrength: number;
  repulsionDistance: number;
  massScale: number;
  boundaryDamping: number;
}

// Rendering settings
export interface RenderingSettings {
  ambientLightIntensity: number;
  backgroundColor: string;
  directionalLightIntensity: number;
  enableAmbientOcclusion: boolean;
  enableAntialiasing: boolean;
  enableShadows: boolean;
  environmentIntensity: number;
  shadowMapSize: string;
  shadowBias: number;
  context: 'desktop' | 'ar';
}

// Animation settings
export interface AnimationSettings {
  enableMotionBlur: boolean;
  enableNodeAnimations: boolean;
  motionBlurStrength: number;
  selectionWaveEnabled: boolean;
  pulseEnabled: boolean;
  pulseSpeed: number;
  pulseStrength: number;
  waveSpeed: number;
}

// Label settings
export interface LabelSettings {
  desktopFontSize: number;
  enableLabels: boolean;
  textColor: string;
  textOutlineColor: string;
  textOutlineWidth: number;
  textResolution: number;
  textPadding: number;
  billboardMode: 'camera' | 'vertical';
}

// Bloom settings
export interface BloomSettings {
  edgeBloomStrength: number;
  enabled: boolean;
  environmentBloomStrength: number;
  nodeBloomStrength: number;
  radius: number;
  strength: number;
  threshold: number;
}

// Hologram settings
export interface HologramSettings {
  ringCount: number;
  ringColor: string;
  ringOpacity: number;
  sphereSizes: [number, number];
  ringRotationSpeed: number;
  enableBuckminster: boolean;
  buckminsterSize: number;
  buckminsterOpacity: number;
  enableGeodesic: boolean;
  geodesicSize: number;
  geodesicOpacity: number;
  enableTriangleSphere: boolean;
  triangleSphereSize: number;
  triangleSphereOpacity: number;
  globalRotationSpeed: number;
}

// WebSocket settings
export interface WebSocketSettings {
  reconnectAttempts: number;
  reconnectDelay: number;
  binaryChunkSize: number;
  compressionEnabled: boolean;
  compressionThreshold: number;
  updateRate: number;
}

// Debug settings
export interface DebugSettings {
  enabled: boolean;
  enableDataDebug: boolean;
  enableWebsocketDebug: boolean;
  logBinaryHeaders: boolean;
  logFullJson: boolean;
  enablePhysicsDebug: boolean;
  enableNodeDebug: boolean;
  enableShaderDebug: boolean;
  enableMatrixDebug: boolean;
  enablePerformanceDebug: boolean;
}

// XR settings
export interface XRSettings {
  enabled: boolean;
  handTracking: boolean;
  controllerModel: string;
  renderScale: number;
  interactionDistance: number;
  locomotionMethod: 'teleport' | 'continuous';
  teleportRayColor: string;
  enableHaptics: boolean;
  displayMode: 'stereo' | 'mono';
}

// Visualization settings
export interface VisualizationSettings {
  nodes: NodeSettings;
  edges: EdgeSettings;
  physics: PhysicsSettings;
  rendering: RenderingSettings;
  animations: AnimationSettings;
  labels: LabelSettings;
  bloom: BloomSettings;
  hologram: HologramSettings;
}

// System settings
export interface SystemSettings {
  websocket: WebSocketSettings;
  debug: DebugSettings;
}

// Main settings interface
export interface Settings {
  visualization: VisualizationSettings;
  system: SystemSettings;
  xr: XRSettings;
}