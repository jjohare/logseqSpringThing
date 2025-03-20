// WebSocket types for graph synchronization

export enum ConnectionState {
    DISCONNECTED = 'DISCONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    RECONNECTING = 'RECONNECTING'
}

export enum MessageType {
    PING = 'ping',                          // Connection health check
    PONG = 'pong'                           // Connection health response
}

// Connection health messages
export interface PingMessage {
    type: MessageType.PING;
    timestamp: number;
}

export interface PongMessage {
    type: MessageType.PONG;
    timestamp: number;
}

export type WebSocketMessage = PingMessage | PongMessage;

// WebSocket settings loaded via REST API
export interface WebSocketSettings {
    url: string;                  // WebSocket URL
    reconnectAttempts: number;     // Max reconnection attempts (default: 3)
    reconnectDelay: number;        // Delay between reconnects in ms (default: 5000)
    updateRate: number;            // Update rate in Hz
}
