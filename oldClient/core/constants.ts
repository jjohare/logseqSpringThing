/**
 * Application constants
 */

// Environment detection
export const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

// API configuration
export const API_BASE = '';  // Base URL is constructed in buildApiUrl

// API paths
export const API_PATHS = {
    SETTINGS: 'user-settings',
    WEBSOCKET: 'websocket',
    GRAPH: 'graph',
    FILES: 'files'
} as const;

// API endpoints
export const API_ENDPOINTS = {
    // Graph endpoints
    GRAPH_DATA: '/api/graph/data',
    GRAPH_UPDATE: '/api/graph/update',
    GRAPH_PAGINATED: '/api/graph/data/paginated',
    
    // Settings endpoints
    SETTINGS_ROOT: '/api/user-settings',
    VISUALIZATION_SETTINGS: '/api/user-settings/visualization',
    WEBSOCKET_SETTINGS: '/api/settings/websocket',
    
    // WebSocket endpoints
    WEBSOCKET_CONTROL: '/api/websocket/control',
    
    // File endpoints
    FILES: '/api/files',
    
    // Auth endpoints
    AUTH_NOSTR: '/api/auth/nostr',
    AUTH_NOSTR_VERIFY: '/api/auth/nostr/verify',
    AUTH_NOSTR_LOGOUT: '/api/auth/nostr/logout'
} as const;

export type ApiEndpoints = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];

// Settings categories matching server's snake_case
export const SETTINGS_CATEGORIES = {
    // Visualization settings
    NODES: 'nodes',
    EDGES: 'edges',
    PHYSICS: 'physics',
    RENDERING: 'rendering',
    ANIMATIONS: 'animations',
    LABELS: 'labels',
    BLOOM: 'bloom',
    HOLOGRAM: 'hologram',
    XR: 'xr',
    
    // System settings
    NETWORK: 'network',
    WEBSOCKET: 'websocket',
    DEBUG: 'debug',
} as const;

// WebSocket configuration
export const WS_MESSAGE_QUEUE_SIZE = 1000;

// Binary protocol configuration
export const FLOATS_PER_NODE = 6;  // x, y, z, vx, vy, vz
export const VERSION_OFFSET = 0;    // No version header
export const BINARY_CHUNK_SIZE = 1000; // Number of nodes to process in one chunk
export const NODE_POSITION_SIZE = 24;  // 6 floats * 4 bytes (position + velocity)

// Performance configuration
export const THROTTLE_INTERVAL = 16; // ~60fps
export const EDGE_UPDATE_BATCH_INTERVAL = 16; // Batch edge updates at ~60fps

// Visualization constants
export const NODE_SIZE = 0.5;
export const NODE_SEGMENTS = 16;
export const EDGE_RADIUS = 0.25;
export const EDGE_SEGMENTS = 8;

// Font configuration
export const FONT_URL = '/fonts/Roboto-Regular.woff2';

// Colors
export const NODE_COLOR = 0x4CAF50;  // Material Design Green
export const NODE_HIGHLIGHT_COLOR = 0xff4444;  // Material Design Red
export const EDGE_COLOR = 0xE0E0E0;  // Material Design Grey 300
export const BACKGROUND_COLOR = 0x212121;  // Material Design Grey 900
export const LABEL_COLOR = 0xFFFFFF;  // White

// Debug configuration
export const DEBUG = {
    NETWORK_PANEL: {
        MAX_MESSAGES: 50,
        ENABLED: IS_DEVELOPMENT
    }
};
