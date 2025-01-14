import { API_ENDPOINTS } from './constants';

// Helper function to build API URLs
export function buildApiUrl(path: string): string {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const port = '4000'; // Use nginx port for all external connections
    const base = `${protocol}//${host}:${port}`;
    return `${base}${path}`; // All paths are already prefixed with /api in constants.ts
}

// Helper function to build settings URL
export function buildSettingsUrl(category: string): string {
    return `${API_ENDPOINTS.SETTINGS_ROOT}/${category}`;
}

// Helper function to build graph URL
export function buildGraphUrl(type: 'data' | 'update' | 'paginated'): string {
    switch (type) {
        case 'paginated':
            return API_ENDPOINTS.GRAPH_PAGINATED;
        case 'update':
            return API_ENDPOINTS.GRAPH_UPDATE;
        default:
            return API_ENDPOINTS.GRAPH_DATA;
    }
}

// Helper function to build files URL
export function buildFilesUrl(path: string): string {
    return `${API_ENDPOINTS.FILES}/${path}`;
}

// Helper function to build WebSocket URL
export function buildWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = '4000'; // Use nginx port for all external connections
    const wsPath = '/wss';
    return `${protocol}//${host}:${port}${wsPath}`;
}

// Helper function to build settings item URL
export function buildSettingsItemUrl(category: string, setting: string): string {
    return API_ENDPOINTS.SETTINGS_ITEM(category, setting);
}

// Helper function to build visualization settings URL
export function buildVisualizationSettingsUrl(): string {
    return API_ENDPOINTS.VISUALIZATION_SETTINGS;
}

// Helper function to build WebSocket control URL
export function buildWebSocketControlUrl(): string {
    return API_ENDPOINTS.WEBSOCKET_CONTROL;
}

// Helper function to build WebSocket settings URL
export function buildWebSocketSettingsUrl(): string {
    return API_ENDPOINTS.WEBSOCKET_SETTINGS;
}
