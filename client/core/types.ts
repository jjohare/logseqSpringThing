// Core types for the application
import { Vector3 as ThreeVector3 } from 'three';
import { debugState } from './debugState';
import { createLogger } from './logger';

const logger = createLogger('CoreTypes');

export interface Vector3 extends ThreeVector3 {
}

export interface NodeMetadata {
  name?: string;
  lastModified?: number;
  links?: string[];
  references?: string[];
  fileSize?: number;
  hyperlinkCount?: number;
}

export interface NodeData {
  position: Vector3;
  velocity: Vector3;
  metadata?: NodeMetadata;
}

export interface Node {
  id: string;
  label?: string;
  data: {
    position: Vector3;
    velocity: Vector3;
    metadata?: {
      name?: string;
      lastModified?: number;
      links?: string[];
      references?: string[];
      fileSize?: number;
      hyperlinkCount?: number;
    };
  };
  color?: string;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Edge {
  source: string;
  target: string;
  id: string;
  sourcePosition?: Position;
  targetPosition?: Position;
  type?: 'default' | 'hologram';
}

export interface PaginatedGraphData extends GraphData {
  totalPages: number;
  currentPage: number;
  totalItems: number;
  pageSize: number;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  metadata?: any;
}

// Platform types
export type Platform = 'desktop' | 'quest' | 'browser';

export interface PlatformCapabilities {
  xrSupported: boolean;
  webglSupported: boolean;
  websocketSupported: boolean;
  webxr: boolean;
  handTracking: boolean;
  planeDetection: boolean;
}

// Settings interfaces in camelCase
export interface AnimationSettings {
  enableMotionBlur: boolean;
  enableNodeAnimations: boolean;
  motionBlurStrength: number;
  selectionWaveEnabled: boolean;
  pulseEnabled: boolean;
  rippleEnabled: boolean;
  edgeAnimationEnabled: boolean;
  flowParticlesEnabled: boolean;
}

export interface ARSettings {
  dragThreshold: number;
  enableHandTracking: boolean;
  enableHaptics: boolean;
  enableLightEstimation: boolean;
  enablePassthroughPortal: boolean;
  enablePlaneDetection: boolean;
  enableSceneUnderstanding: boolean;
  gestureSsmoothing: number;
  handMeshColor: string;
  handMeshEnabled: boolean;
  handMeshOpacity: number;
  handPointSize: number;
  handRayColor: string;
  handRayEnabled: boolean;
  handRayWidth: number;
  hapticIntensity: number;
  passthroughBrightness: number;
  passthroughContrast: number;
  passthroughOpacity: number;
  pinchThreshold: number;
  planeColor: string;
  planeOpacity: number;
  portalEdgeColor: string;
  portalEdgeWidth: number;
  portalSize: number;
  roomScale: boolean;
  rotationThreshold: number;
  showPlaneOverlay: boolean;
  snapToFloor: boolean;
  interactionRadius: number;
}

export interface AudioSettings {
  enableAmbientSounds: boolean;
  enableInteractionSounds: boolean;
  enableSpatialAudio: boolean;
}

export interface BloomSettings {
  edgeBloomStrength: number;
  enabled: boolean;
  environmentBloomStrength: number;
  nodeBloomStrength: number;
  radius: number;
  strength: number;
}

export interface ClientDebugSettings {
  enableDataDebug: boolean;
  enableWebsocketDebug: boolean;
  enabled: boolean;
  logBinaryHeaders: boolean;
  logFullJson: boolean;
}

export interface EdgeSettings {
  arrowSize: number;
  baseWidth: number;
  color: string;
  enableArrows: boolean;
  opacity: number;
  widthRange: [number, number];
}

export interface HologramSettings {
  xrQuality: 'low' | 'medium' | 'high';
  desktopQuality: 'low' | 'medium' | 'high';
  ringCount: number;
  ringColor: string;
  ringOpacity: number;
  ringSizes: number[];
  ringRotationSpeed: number;
  enableBuckminster: boolean;
  buckminsterScale: number;
  buckminsterOpacity: number;
  enableGeodesic: boolean;
  geodesicScale: number;
  geodesicOpacity: number;
  enableTriangleSphere: boolean;
  triangleSphereScale: number;
  triangleSphereOpacity: number;
  globalRotationSpeed: number;
}

export interface LabelSettings {
  desktopFontSize: number;
  enableLabels: boolean;
  textColor: string;
  textOutlineColor: string;
  textOutlineWidth: number;
  textResolution: number;
  textPadding: number;
  billboardMode: 'camera' | 'up';
}

export interface NodeSettings {
  baseColor: string;
  baseSize: number;
  sizeRange: [number, number];
  enableMetadataShape: boolean;
  colorRangeAge: [string, string];
  colorRangeLinks: [string, string];
  metalness: number;
  roughness: number;
  opacity: number;
}

export interface NetworkSettings {
  bindAddress: string;
  domain: string;
  enableHttp2: boolean;
  enableRateLimiting: boolean;
  enableTls: boolean;
  maxRequestSize: number;
  minTlsVersion: string;
  port: number;
  rateLimitRequests: number;
  rateLimitWindow: number;
  tunnelId: string;
}

export interface DefaultSettings {
  apiClientTimeout: number;
  enableMetrics: boolean;
  enableRequestLogging: boolean;
  logFormat: string;
  logLevel: string;
  maxConcurrentRequests: number;
  maxPayloadSize: number;
  maxRetries: number;
  metricsPort: number;
  retryDelay: number;
}

export interface SecuritySettings {
  allowedOrigins: string[];
  auditLogPath: string;
  cookieHttponly: boolean;
  cookieSamesite: string;
  cookieSecure: boolean;
  csrfTokenTimeout: number;
  enableAuditLogging: boolean;
  enableRequestValidation: boolean;
  sessionTimeout: number;
}

export interface ServerDebugSettings {
  enabled: boolean;
  enableDataDebug: boolean;
  enableWebsocketDebug: boolean;
  logBinaryHeaders: boolean;
  logFullJson: boolean;
}

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
}

export interface RenderingSettings {
  ambientLightIntensity: number;
  backgroundColor: string;
  directionalLightIntensity: number;
  enableAmbientOcclusion: boolean;
  enableAntialiasing: boolean;
  enableShadows: boolean;
  environmentIntensity: number;
}

export interface WebSocketSettings {
  url: string;                   // WebSocket server URL
  heartbeatInterval: number;     // Ping interval in seconds (default: 30)
  heartbeatTimeout: number;      // Connection timeout in seconds (default: 60)
  reconnectAttempts: number;     // Max reconnection attempts (default: 3)
  reconnectDelay: number;        // Delay between reconnects in ms (default: 5000)
  binaryChunkSize: number;       // Size of binary chunks
  compressionEnabled: boolean;   // Enable/disable compression
  compressionThreshold: number;  // Compression threshold
  maxConnections: number;        // Maximum connections
  maxMessageSize: number;        // Maximum message size
  updateRate: number;           // Update rate in Hz
}

export interface Settings {
  animations: AnimationSettings;
  ar: ARSettings;
  audio: AudioSettings;
  bloom: BloomSettings;
  clientDebug: ClientDebugSettings;
  default: DefaultSettings;
  edges: EdgeSettings;
  hologram: HologramSettings;
  labels: LabelSettings;
  network: NetworkSettings;
  nodes: NodeSettings;
  physics: PhysicsSettings;
  rendering: RenderingSettings;
  security: SecuritySettings;
  serverDebug: ServerDebugSettings;
  websocket: WebSocketSettings;
}

export type SettingCategory = keyof Settings;
export type SettingKey<T extends SettingCategory> = keyof Settings[T];
export type SettingValue = string | number | boolean | number[] | string[];

// WebSocket message types
export type MessageType = 
  | 'binaryPositionUpdate'  // Real-time position/velocity data
  | 'ping'                  // Connection health check
  | 'pong'                 // Connection health response
  | 'connectionStatus'     // Connection status updates
  | 'enableBinaryUpdates'; // Enable/disable binary updates

// Base WebSocket message interface
export interface BaseWebSocketMessage {
  type: MessageType;
}

// Binary position update message (server -> client)
export interface BinaryPositionUpdateMessage extends BaseWebSocketMessage {
  type: 'binaryPositionUpdate';
  data: {
    nodes: Array<{
      data: {
        position: Vector3;
        velocity: Vector3;
      }
    }>
  };
}

// Connection health messages
export interface PingMessage extends BaseWebSocketMessage {
  type: 'ping';
  timestamp: number;
}

export interface PongMessage extends BaseWebSocketMessage {
  type: 'pong';
  timestamp: number;
}

export type WebSocketMessage =
  | BinaryPositionUpdateMessage
  | PingMessage
  | PongMessage;

// WebSocket error types
export enum WebSocketErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',       // Failed to establish connection
  CONNECTION_LOST = 'CONNECTION_LOST',         // Connection was lost
  TIMEOUT = 'TIMEOUT',                        // Connection timed out
  BINARY_FORMAT_ERROR = 'BINARY_FORMAT_ERROR', // Invalid binary data format
}

export interface WebSocketError {
  type: WebSocketErrorType;
  message: string;
  code?: number;
  details?: any;
}

// Logger interface
export interface Logger {
  log: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
}

// Helper functions
interface RawNode {
  id: string;
  metadata_id?: string;  // Added to match the server's data structure
  data: {
    position: Vector3;
    metadata?: NodeMetadata;
  };
  color?: string;
}

interface RawEdge {
  source: string;
  target: string;
  weight?: number;
  id?: string;
}

interface RawGraphData {
  nodes: RawNode[];
  edges: RawEdge[];
  metadata?: any;
  totalPages?: number;
  currentPage?: number;
  totalItems?: number;
  pageSize?: number;
}

export function transformGraphData(data: RawGraphData): GraphData {
  const nodes = data.nodes.map((node: RawNode) => transformNodeData(node));
  const nodePositions = new Map(nodes.map((node: Node) => [
    node.id,
    node.data.position 
  ]));

  // Enhanced edge processing with logging for troubleshooting
  const edges = data.edges.map((edge: RawEdge) => {
    // Check if node positions exist for the source and target
    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);
    
    // For debugging missing edges
    if (!sourcePos || !targetPos) {
      if (debugState.isNodeDebugEnabled()) {
        logger.warn(`Edge processing: Missing position for ${!sourcePos ? 'source' : 'target'} node ID ${!sourcePos ? edge.source : edge.target}`);
      }
    }
    
    return {
      ...edge,
      // Create temporary zero vector if position is missing to ensure edges are created
      // These will be updated later with actual node positions
      sourcePosition: sourcePos || new ThreeVector3(0, 0, 0),
      targetPosition: targetPos || new ThreeVector3(0, 0, 0),
      id: edge.id || `${edge.source}_${edge.target}`
    };
  });

  return {
    nodes,
    edges,
    metadata: data.metadata
  };
}

export function transformNodeData(node: any): Node {
  // Make sure we have appropriate metadata
  const metadata = {
    // Use multiple fallbacks for name with preference order:
    // 1. Existing metadata name
    // 2. Label (from server)
    // 3. metadata_id (filename)
    // 4. Numeric ID as last resort
    name: node.data.metadata?.name || 
          node.label || 
          node.metadata_id || 
          node.id,
    lastModified: parseInt(node.data.metadata?.lastModified) || Date.now(),
    links: node.data.metadata?.links || [],
    references: node.data.metadata?.references || [],
    fileSize: node.metadata?.fileSize || 
              parseInt(node.data.metadata?.fileSize) || 
              1000, // Default file size of 1KB
    hyperlinkCount: node.metadata?.hyperlinkCount || 
                    parseInt(node.data.metadata?.hyperlinkCount) || 0
  };
  
  // For debugging
  if (debugState.isNodeDebugEnabled() && node.metadata_id) {
    logger.debug(`Transforming node with metadata_id: ${node.metadata_id}, label: ${node.label}, id: ${node.id}`);
  }
  
  return {
    id: node.id,
    label: node.label || node.metadata_id, // Preserve server-side label, fallback to metadata_id
    data: {
      position: node.data.position instanceof ThreeVector3 ? node.data.position : new ThreeVector3(
        node.data.position.x,
        node.data.position.y,
        node.data.position.z
      ),
      velocity: node.data.velocity instanceof ThreeVector3 ? node.data.velocity : new ThreeVector3(0, 0, 0),
      metadata
    },
    color: node.color
  };
}
