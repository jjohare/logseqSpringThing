import { createLogger, createErrorMetadata, createMessageMetadata, createDataMetadata } from '../core/logger';
import { buildWsUrl } from '../core/api';
import { debugState } from '../core/debugState';
import { Vector3 } from 'three';
import { createVector3, zeroVector3, vector3ToObject, isValidVector3, clampVector3, vector3Equals } from '../utils/vectorUtils';
import pako from 'pako';

const logger = createLogger('WebSocketService');

// Helper for conditional debug logging
function debugLog(message: string, ...args: any[]) {
    if (debugState.isWebsocketDebugEnabled()) {
        logger.debug(message, ...args);
    }
}

// Compression settings
const COMPRESSION_THRESHOLD = 1024; // Only compress messages larger than 1KB

enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed'
}

// Interface for node updates from user interaction
interface NodeUpdate {
    id: string;          // Node ID (converted to u32 for binary protocol)
    position: Vector3;   // Current position (Three.js Vector3)
    velocity?: Vector3;  // Optional velocity (Three.js Vector3)
    metadata?: {
        name?: string;
        lastModified?: number;
        links?: string[];
        references?: string[];
        fileSize?: number;
        hyperlinkCount?: number;
    };
}

// Interface matching server's binary protocol format (28 bytes per node):
// - id: 4 bytes (u32)
// - position: 12 bytes (Vec3Data)
// - velocity: 12 bytes (Vec3Data)
interface BinaryNodeData {
    id: number;
    position: Vector3;   // Three.js Vector3
    velocity: Vector3;   // Three.js Vector3
}

type BinaryMessageCallback = (nodes: BinaryNodeData[]) => void;

export class WebSocketService {
    private static instance: WebSocketService | null = null;
    private ws: WebSocket | null = null;
    private binaryMessageCallback: BinaryMessageCallback | null = null;
    private reconnectTimeout: number | null = null;
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private reconnectAttempts: number = 0;
    private readonly _maxReconnectAttempts: number = 5;
    private readonly initialReconnectDelay: number = 5000; // 5 seconds
    private readonly maxReconnectDelay: number = 60000; // 60 seconds
    private url: string = '';
    private connectionStatusHandler: ((status: boolean) => void) | null = null;
    private readonly MAX_POSITION = 1000.0;
    private readonly MAX_VELOCITY = 10.0;

    // Added a method to validate vector3 values without clamping
    private validateVector3(vec: Vector3, max: number): boolean {
        if (!isValidVector3(vec)) {
            return false;
        }
        return Math.abs(vec.x) <= max && 
               Math.abs(vec.y) <= max && 
               Math.abs(vec.z) <= max;
    }

    private validateAndClampVector3(vec: Vector3, max: number): Vector3 {
        if (!isValidVector3(vec)) {
            // Return a valid vector at origin rather than zeroing out
            return zeroVector3();
        }
        
        // If the vector has NaN or infinite values, replace with zero
        const sanitizedVec = new Vector3(
            isNaN(vec.x) || !isFinite(vec.x) ? 0 : vec.x,
            isNaN(vec.y) || !isFinite(vec.y) ? 0 : vec.y,
            isNaN(vec.z) || !isFinite(vec.z) ? 0 : vec.z
        );
        
        return clampVector3(sanitizedVec, -max, max);
    }

    private constructor() {
        // Don't automatically connect - wait for explicit connect() call
    }

    public static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    public connect(): Promise<void> {
        if (this.connectionState !== ConnectionState.DISCONNECTED) {
            logger.warn('WebSocket already connected or connecting');
            // If already connecting, return a promise that resolves when connected
            if (this.connectionState === ConnectionState.CONNECTING) {
                return new Promise((resolve) => {
                    const checkConnection = () => {
                        if (this.connectionState === ConnectionState.CONNECTED) {
                            resolve();
                        } else {
                            setTimeout(checkConnection, 100);
                        }
                    };
                    checkConnection();
                });
            }
            return Promise.resolve();
        }
        return this.initializeWebSocket();
    }

    private async initializeWebSocket(): Promise<void> {
        if (this.connectionState !== ConnectionState.DISCONNECTED) {
            return;
        }

        try {
            this.url = buildWsUrl();
            
            if (!this.url) {
                throw new Error('No WebSocket URL available');
            }

            this.connectionState = ConnectionState.CONNECTING;
            return new Promise((resolve, reject) => {
                this.ws = new WebSocket(this.url);
                this.setupWebSocketHandlers();
                
                // Add one-time open handler to resolve the promise
                this.ws!.addEventListener('open', () => resolve(), { once: true });
                // Add one-time error handler to reject the promise
                this.ws!.addEventListener('error', (e) => reject(e), { once: true });
            });
        } catch (error) {
            logger.error('Failed to initialize WebSocket:', createErrorMetadata(error));
            this.handleReconnect();
            return Promise.reject(error);
        }
    }

    private getReconnectDelay(): number {
        // Exponential backoff with max delay
        const delay = Math.min(
            this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        // Add some jitter
        return delay + (Math.random() * 1000);
    }

    private setupWebSocketHandlers(): void {
        if (!this.ws) return;
        
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = (): void => {
            logger.info('WebSocket connected successfully to', createMessageMetadata(this.url));
            this.connectionState = ConnectionState.CONNECTED;
            this.reconnectAttempts = 0;

            if (this.connectionStatusHandler) {
                this.connectionStatusHandler(true);
                debugLog('Connection status handler notified: connected');
            }
            logger.info('WebSocket connected successfully, requesting initial position data');

            // Send request for position updates after connection
            debugLog('Requesting position updates');
            this.sendMessage({ type: 'request-initial-data' }); // Using kebab-case for API consistency
        };

        this.ws.onerror = (event: Event): void => {
            logger.error('WebSocket error:', createDataMetadata(event));
            if (this.ws?.readyState === WebSocket.CLOSED) {
                this.handleReconnect();
            }
        };

        this.ws.onclose = (event: CloseEvent): void => {
            logger.warn('WebSocket closed', createDataMetadata({
                code: event.code,
                reason: event.reason
            }));
            
            if (this.connectionStatusHandler) {
                this.connectionStatusHandler(false);
            }
            
            this.handleReconnect();
        };

        this.ws.onmessage = (event: MessageEvent) => {
            try {
                if (event.data instanceof ArrayBuffer) {
                    const byteSize = event.data.byteLength;
                    logger.info('Received binary position update', createDataMetadata({
                        byteSize,
                        expectedNodeCount: Math.floor(byteSize / 28)
                    }));
                    
                    this.handleBinaryMessage(event.data);
                } else if (typeof event.data === 'string') {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === 'connection_established' || message.type === 'updatesStarted') {
                            logger.info('WebSocket message received:', createDataMetadata({
                                type: message.type,
                                details: message
                            }));
                        } else {
                            logger.info('WebSocket message received:', createDataMetadata({
                                type: message.type,
                                message
                            }));
                        }
                    } catch (error) {
                        logger.error('Failed to parse WebSocket message:', createErrorMetadata(error));
                    }
                }
            } catch (error) {
                logger.error('Critical error in message handler:', createErrorMetadata(error));
            }
        };
    }

    private tryDecompress(buffer: ArrayBuffer): ArrayBuffer {
        try {
            const decompressed = pako.inflate(new Uint8Array(buffer));
            if (decompressed.length < 8 || decompressed.length % 4 !== 0) {
                return buffer;
            }
            return decompressed.buffer;
        } catch (error) {
            return buffer;
        }
    }

    private compressIfNeeded(buffer: ArrayBuffer): ArrayBuffer {
        if (buffer.byteLength > COMPRESSION_THRESHOLD) {
            try {
                const compressed = pako.deflate(new Uint8Array(buffer));
                return compressed.buffer;
            } catch (error) {
                logger.warn('Compression failed, using original data:', createErrorMetadata(error));
                return buffer;
            }
        }
        return buffer;
    }

    private handleBinaryMessage(buffer: ArrayBuffer): void {
        try {
            // Log raw buffer details before processing
            logger.info('Processing binary data', createDataMetadata({ rawSize: buffer.byteLength, isCompressed: buffer.byteLength > 0 && buffer.byteLength % 28 !== 0 }));
            if (debugState.isWebsocketDebugEnabled()) {
                debugLog('Processing binary message:', createDataMetadata({ size: buffer.byteLength }));
            }

            const decompressedBuffer = this.tryDecompress(buffer);
            if (debugState.isWebsocketDebugEnabled()) {
                debugLog('After decompression:', createDataMetadata({ size: decompressedBuffer.byteLength }));
            }
            
            // Each node update is 28 bytes (4 for id, 12 for position, 12 for velocity)
            if (!decompressedBuffer || decompressedBuffer.byteLength % 28 !== 0) {
                // Enhanced error logging for production debugging
                const errorDetails = {
                    bufferSize: buffer.byteLength,
                    decompressedSize: decompressedBuffer?.byteLength ?? 0,
                    remainder: (decompressedBuffer?.byteLength ?? 0) % 28,
                    expectedNodeCount: Math.floor((decompressedBuffer?.byteLength ?? 0) / 28),
                    url: this.url
                };
                logger.error('Invalid binary message size:', createDataMetadata(errorDetails));
                throw new Error(`Invalid buffer size: ${decompressedBuffer?.byteLength ?? 0} bytes (not a multiple of 28)`);
            }

            const dataView = new DataView(decompressedBuffer);
            const nodeCount = decompressedBuffer.byteLength / 28;
            
            // Enhanced logging for production debugging
            if (nodeCount > 0 && (debugState.isWebsocketDebugEnabled() || nodeCount < 5)) {
                const firstNodeId = dataView.getUint32(0, true);
                const firstNodeX = dataView.getFloat32(4, true);
                const firstNodeY = dataView.getFloat32(8, true);
                const firstNodeZ = dataView.getFloat32(12, true);
                logger.info('Binary update received:', createDataMetadata({
                    nodeCount: nodeCount > 0 ? nodeCount : 'empty buffer',
                    firstNode: { id: firstNodeId, x: firstNodeX, y: firstNodeY, z: firstNodeZ },
                    bufferSize: decompressedBuffer.byteLength
                }));
            }
            
            if (debugState.isWebsocketDebugEnabled()) {
                debugLog('Node count:', createDataMetadata({ count: nodeCount }));
            }
            let offset = 0;
            let invalidValuesFound = false;
            const nodes: BinaryNodeData[] = [];
            
            for (let i = 0; i < nodeCount; i++) {
                const id = dataView.getUint32(offset, true);
                offset += 4;

                const position = createVector3(
                    dataView.getFloat32(offset, true),      // x
                    dataView.getFloat32(offset + 4, true),  // y
                    dataView.getFloat32(offset + 8, true)   // z
                );
                offset += 12;

                const velocity = createVector3(
                    dataView.getFloat32(offset, true),      // x
                    dataView.getFloat32(offset + 4, true),  // y
                    dataView.getFloat32(offset + 8, true)   // z
                );
                offset += 12;
                
                // Validate and clamp position and velocity
                // Important: Be more lenient with position validation initially
                // Force-directed graph positioning can have larger values at first
                let sanitizedPosition: Vector3;
                if (this.validateVector3(position, this.MAX_POSITION * 10)) {
                    sanitizedPosition = position.clone(); // If within a generous range, keep original
                } else {
                    sanitizedPosition = this.validateAndClampVector3(position, this.MAX_POSITION);
                }
                const sanitizedVelocity = this.validateAndClampVector3(velocity, this.MAX_VELOCITY);
                
                // Check if values were invalid using vector3Equals
                if (!vector3Equals(position, sanitizedPosition) || !vector3Equals(velocity, sanitizedVelocity)) {
                    invalidValuesFound = true;
                    logger.warn('Invalid values detected in binary message:', createDataMetadata({
                        nodeId: id,
                        originalPosition: vector3ToObject(position),
                        sanitizedPosition: vector3ToObject(sanitizedPosition),
                        originalVelocity: vector3ToObject(velocity),
                        sanitizedVelocity: vector3ToObject(sanitizedVelocity)
                    }));
                }

                nodes.push({ id, position: sanitizedPosition, velocity: sanitizedVelocity });
            }

            if (invalidValuesFound) {
                logger.warn('Some nodes had invalid position/velocity values that were clamped');
            }

            // Add summary of processed nodes
            if (nodes.length > 0) {
                logger.info('Node position summary:', createDataMetadata({
                    count: nodes.length,
                    sample: nodes.slice(0, Math.min(3, nodes.length)).map(n => ({ id: n.id, pos: vector3ToObject(n.position) }))
                }));
            }

            if (nodes.length > 0 && this.binaryMessageCallback) {
                this.binaryMessageCallback(nodes);  // Send to NodeManagerFacade
            } else {
                if (debugState.isWebsocketDebugEnabled()) {
                    debugLog('No nodes to process or no callback registered', createDataMetadata({
                        nodesLength: nodes.length,
                        hasCallback: !!this.binaryMessageCallback
                    }));
                }
            }
        } catch (error) {
            logger.error('Failed to process binary message:', createErrorMetadata(error));
        }
    }

    private handleReconnect(): void {
        const wasConnected = this.connectionState === ConnectionState.CONNECTED;
        
        this.connectionState = ConnectionState.DISCONNECTED;
        this.binaryMessageCallback = null;
        
        if (this.reconnectTimeout !== null) {
            window.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.reconnectAttempts < this._maxReconnectAttempts &&
            (wasConnected || this.reconnectAttempts === 0)) {
            
            this.reconnectAttempts++;
            const delay = this.getReconnectDelay();
            
            this.connectionState = ConnectionState.RECONNECTING;
            
            this.reconnectTimeout = window.setTimeout(async () => {
                this.reconnectTimeout = null;
                try {
                    await this.connect();
                } catch (error) {
                    logger.error('Reconnection attempt failed:', createErrorMetadata(error));
                }
            }, delay);
        } else {
            this.handleReconnectFailure();
        }
    }

    private handleReconnectFailure(): void {
        this.connectionState = ConnectionState.FAILED;
        if (this.connectionStatusHandler) {
            this.connectionStatusHandler(false);
        }
    }

    public onBinaryMessage(callback: BinaryMessageCallback): void {
        this.binaryMessageCallback = callback;
    }

    public getConnectionStatus(): ConnectionState {
        return this.connectionState;
    }

    public sendMessage(message: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (error) {
                logger.error('Error sending message:', createErrorMetadata(error));
            }
        }
    }

    public sendNodeUpdates(updates: NodeUpdate[]): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.warn('WebSocket not connected, cannot send node updates');
            return;
        }

        // Limit to 2 nodes per update as per server requirements
        if (updates.length > 2) {
            logger.warn('Too many nodes in update, limiting to first 2');
            updates = updates.slice(0, 2);
        }

        const buffer = new ArrayBuffer(updates.length * 28);
        const dataView = new DataView(buffer);
        let offset = 0;

        updates.forEach(update => {
            const id = parseInt(update.id, 10);
            if (isNaN(id)) {
                logger.warn('Invalid node ID:', createMessageMetadata(update.id));
                return;
            }
            dataView.setUint32(offset, id, true);
            offset += 4;

            // Validate and clamp position
            const validPosition = this.validateAndClampVector3(update.position, this.MAX_POSITION);
            
            // Write position
            dataView.setFloat32(offset, validPosition.x, true);
            dataView.setFloat32(offset + 4, validPosition.y, true);
            dataView.setFloat32(offset + 8, validPosition.z, true);
            offset += 12;

            // Validate and clamp velocity (default to zero vector if not provided)
            const rawVelocity = update.velocity ?? zeroVector3();
            const validVelocity = this.validateAndClampVector3(rawVelocity, this.MAX_VELOCITY);
            
            // Write velocity
            dataView.setFloat32(offset, validVelocity.x, true);
            dataView.setFloat32(offset + 4, validVelocity.y, true);
            dataView.setFloat32(offset + 8, validVelocity.z, true);
            offset += 12;
        });

        const finalBuffer = this.compressIfNeeded(buffer);
        this.ws.send(finalBuffer);
    }

    public onConnectionStatusChange(handler: (status: boolean) => void): void {
        this.connectionStatusHandler = handler;
        if (this.connectionState === ConnectionState.CONNECTED && handler) {
            handler(true);
        }
    }

    public dispose(): void {
        if (this.reconnectTimeout !== null) {
            window.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.binaryMessageCallback = null;
        this.connectionStatusHandler = null;
        this.connectionState = ConnectionState.DISCONNECTED;
        WebSocketService.instance = null;
    }

    public close(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}