import { createLogger, createErrorMetadata, createMessageMetadata, createDataMetadata } from '../core/logger';
import { buildWsUrl } from '../core/api';
import { debugState } from '../core/debugState';
import { Vector3 } from 'three';
import pako from 'pako';
import { UpdateThrottler, validateAndFixVector3 } from '../core/utils';

const logger = createLogger('WebSocketService');

// Throttle for debug logging to prevent excessive logs
let lastDebugLogTime = 0;
const DEBUG_LOG_THROTTLE_MS = 1000; // Only log once per second

// Position update deadband threshold (only update if position changes by this amount)
const POSITION_DEADBAND = 0.15; // Units in world space (0.15 = 15cm) - Increased from 0.05

// Helper for conditional debug logging
function debugLog(message: string, ...args: any[]) {
    if (debugState.isWebsocketDebugEnabled()) {
        const now = Date.now();
        if (now - lastDebugLogTime > DEBUG_LOG_THROTTLE_MS) {
            lastDebugLogTime = now;
            logger.debug(message, ...args);
        }
    }
}

// Compression settings
const COMPRESSION_THRESHOLD = 1024; // Only compress messages larger than 1KB

// Binary format constants
const BYTES_PER_NODE = 26; // 2 (ID) + 12 (position) + 12 (velocity)

// Maximum value for u16 node IDs
const MAX_U16_VALUE = 65535;

enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed'
}

// Interface for node updates from user interaction
interface NodeUpdate {
    id: string;          // Node ID (string in metadata, but must be converted to u16 index for binary protocol)
    position: Vector3;   // Current position (Three.js Vector3 object)
    velocity?: Vector3;  // Optional velocity (Three.js Vector3 object)
    metadata?: {
        name?: string;
        lastModified?: number;
        links?: string[];
        references?: string[];
        fileSize?: number;
        hyperlinkCount?: number;
    };
}

// Interface matching server's binary protocol format (26 bytes per node):
// - id: 2 bytes (u16)
// - position: 12 bytes (3xf32)
// - velocity: 12 bytes (3xf32)
interface BinaryNodeData {
    id: number;
    position: Vector3;   // Three.js Vector3 object
    velocity: Vector3;   // Three.js Vector3 object
}

type BinaryMessageCallback = (nodes: BinaryNodeData[]) => void;

export class WebSocketService {
    private static instance: WebSocketService | null = null;
    private ws: WebSocket | null = null;
    private binaryMessageCallback: BinaryMessageCallback | null = null;
    private reconnectTimeout: number | null = null;
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private reconnectAttempts: number = 0;
    // Add a readiness flag to track when the connection is fully established
    private isReadyFlag: boolean = false;
    private readonly _maxReconnectAttempts: number = 5;
    // Keep track of node ID to numeric index mapping for binary protocol
    private nodeNameToIndexMap: Map<string, number> = new Map();
    private nextNodeIndex: number = 0;
    private readonly initialReconnectDelay: number = 1000; // 1 second (reduced from 5000)
    private readonly maxReconnectDelay: number = 30000; // 30 seconds (reduced from 60s)
    private url: string = buildWsUrl(); // Initialize URL immediately
    private initialDataReceived: boolean = false;
    private connectionStatusHandler: ((status: boolean) => void) | null = null;

    // Add a debounce mechanism for node updates
    private loadingStatusHandler: ((isLoading: boolean, message?: string) => void) | null = null;
    private heartbeatInterval: number | null = null;
    private isLoading: boolean = false;
    private nodeUpdateQueue: NodeUpdate[] = [];
    private nodeUpdateTimer: number | null = null;
    private readonly NODE_UPDATE_DEBOUNCE_MS = 50; // 50ms debounce for node updates
    
    // New fields for improved throttling
    private updateThrottler = new UpdateThrottler(150); // ~6-7fps (was: 50ms = ~20fps) to reduce updates
    private lastNodePositions: Map<number, Vector3> = new Map(); // Keep track of last sent positions
    private pendingNodeUpdates: BinaryNodeData[] = [];

    /**
     * Check if the WebSocket service is fully ready to handle binary updates.
     * This requires both the connection to be established and the server to have
     * sent a connection_established message.
     * @returns boolean - true if the WebSocket is ready for binary updates
     */
    public isReady(): boolean {
        return this.connectionState === ConnectionState.CONNECTED && this.isReadyFlag;
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
            // Only log this at debug level instead of warn to reduce log spam
            if (this.connectionState === ConnectionState.CONNECTED) {
                logger.info('WebSocket already connected');
                return Promise.resolve();
            }
            
            logger.info(`WebSocket in ${this.connectionState} state, attempting to reconnect...`);
            
            // If in FAILED state, reset and try again
            if (this.connectionState === ConnectionState.FAILED) {
                this.connectionState = ConnectionState.DISCONNECTED;
                this.reconnectAttempts = 0;
                return this.initializeWebSocket();
            }
            
            // If already connecting, return a promise that resolves when connected
            if (this.connectionState === ConnectionState.CONNECTING) {
                return new Promise((resolve) => {
                    let timeoutCounter = 0;
                    const checkConnection = () => {
                        if (this.connectionState === ConnectionState.CONNECTED) {
                            resolve();
                        } else if (timeoutCounter++ < 100) { // Limit to 10 seconds (100 * 100ms)
                            setTimeout(checkConnection, 100);
                        } else {
                            logger.error('Timed out waiting for connection to establish');
                            resolve(); // Resolve anyway to prevent hanging
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
            
            if (!this.url) {
                throw new Error('No WebSocket URL available');
            }

            this.connectionState = ConnectionState.CONNECTING;
            // Reset the readiness flag when starting a new connection
            this.isReadyFlag = false;
            
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
        return delay + (Math.random() * 500); // Reduced jitter from 1000ms to 500ms
    }

    private setupWebSocketHandlers(): void {
        if (!this.ws) return;
        
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = (): void => {
            // WebSocket is connected but not yet ready for binary updates
            // We need to wait for the 'connection_established' message from the server
            this.isReadyFlag = false;
            
            logger.info('WebSocket connected successfully to', createMessageMetadata(this.url));
            this.connectionState = ConnectionState.CONNECTED;
            this.reconnectAttempts = 0;

            if (this.connectionStatusHandler) {
                this.connectionStatusHandler(true);
                debugLog('Connection status handler notified: connected');
            }
            
            // Set up a heartbeat to keep the connection alive
            this.setupHeartbeat();
            
            // Add delay before sending first message to ensure connection is stable
            setTimeout(() => {
                logger.info('WebSocket connected successfully, requesting initial position data');

                // Send request for position updates after connection
                this.initialDataReceived = false;
                logger.info('Requesting initial data from server...');
                
                this.sendMessage({ type: 'requestInitialData' }); // Matching the server's camelCase type

                // Randomization is disabled by default until client is ready
                logger.info('WebSocket connection established. Randomization disabled by default.');
            }, 500); // 500ms delay to ensure connection is stable
        };

        this.ws.onerror = (event: Event): void => {
            logger.error('WebSocket error:', createDataMetadata(event));
            // Don't call handleReconnect here, let onclose handle it
            // This prevents duplicate reconnection attempts when both error and close events fire
        };

        this.ws.onclose = (event: CloseEvent): void => {
            logger.warn('WebSocket closed', createDataMetadata({
                code: event.code,
                reason: event.reason || "No reason provided",
                initialDataReceived: this.initialDataReceived,
                wasConnected: this.connectionState === ConnectionState.CONNECTED,
                url: this.url
            }));
            
            // Reset the readiness flag when the connection closes
            this.isReadyFlag = false;
            
            // Clear heartbeat on connection close
            this.clearHeartbeat();
            
            if (this.connectionStatusHandler) {
                this.connectionStatusHandler(false);
            }
            
            this.handleReconnect();
        };

        this.ws.onmessage = (event: MessageEvent) => {
            try {
                if (event.data instanceof ArrayBuffer) {
                    this.handleBinaryMessage(event.data);
                } else if (typeof event.data === 'string') {
                    try {
                        const message = JSON.parse(event.data);
                        
                        // Handle loading state messages
                        if (message.type === 'loading') {
                            this.isLoading = true;
                            logger.info('WebSocket loading state:', createDataMetadata({
                                message: message.message
                            }));
                            // Notify loading handler if registered
                            if (this.loadingStatusHandler) {
                                logger.info('Showing loading indicator: ' + message.message);
                                this.loadingStatusHandler(true, message.message);
                            }
                        } else if (message.type === 'updatesStarted') {
                            // Clear loading state when updates start
                            this.isLoading = false;
                            this.initialDataReceived = true;
                            logger.info('WebSocket updates started:', createDataMetadata({
                                timestamp: message.timestamp
                            }));
                            // Notify loading handler if registered
                            if (this.loadingStatusHandler) {
                                this.loadingStatusHandler(false);
                            }
                        } else if (message.type === 'connection_established') {
                            // Set the readiness flag when we receive the connection_established message
                            this.isReadyFlag = true;
                            logger.info('WebSocket connection fully established and ready for binary updates');
                            logger.info('WebSocket message received:', createDataMetadata({
                                type: message.type,
                                timestamp: message.timestamp || Date.now(),
                                ready: true
                            }));
                        } else if (debugState.isWebsocketDebugEnabled()) {
                            logger.debug('WebSocket message received:', message);
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

    // Setup a heartbeat to keep the WebSocket connection alive
    private setupHeartbeat(): void {
        this.clearHeartbeat(); // Clear any existing heartbeat
        this.heartbeatInterval = window.setInterval(() => {
            // Send a simple ping message to keep the connection alive
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.sendMessage({ type: 'ping', timestamp: Date.now() });
                    if (debugState.isWebsocketDebugEnabled()) {
                        logger.debug('Heartbeat ping sent');
                    }
                } catch (err) {
                    logger.error('Failed to send heartbeat ping:', createErrorMetadata(err));
                }
            } else if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
                // If socket is closed but heartbeat still running, attempt reconnect
                logger.warn('Heartbeat detected closed socket, attempting reconnect');
                this.handleReconnect();
            }
        }, 10000); // Send ping every 10 seconds (changed from 15s to match server)
    }
    
    // Clear heartbeat interval
    private clearHeartbeat(): void {
        if (this.heartbeatInterval !== null) {
            window.clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
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
            if (buffer.byteLength === 0) {
                logger.warn('Received empty binary message, ignoring (0 bytes)');
                return;
            }
            
            const decompressedBuffer = this.tryDecompress(buffer);
            
            // Check if buffer is empty or too small after decompression
            if (!decompressedBuffer || decompressedBuffer.byteLength === 0) {
                logger.error('Empty binary message after decompression');
                return;
            }
            
            // Check if there's enough data for at least one node
            if (decompressedBuffer.byteLength < BYTES_PER_NODE) {
                logger.error(`Failed to decode binary message: Data too small to contain any nodes (${decompressedBuffer.byteLength} bytes, need at least ${BYTES_PER_NODE})`);
                return;
            }
            
            // Calculate how many complete nodes we can read
            const nodeCount = Math.floor(decompressedBuffer.byteLength / BYTES_PER_NODE);
            const dataView = new DataView(decompressedBuffer);
            const nodes: BinaryNodeData[] = [];
            
            let offset = 0;
            // Process each complete node in the buffer
            for (let i = 0; i < nodeCount; i++) {
                const id = dataView.getUint16(offset, true);
                offset += 2;
                
                // Skip invalid IDs
                if (id === 0 || id === 65535 || id > MAX_U16_VALUE) {
                    offset += 24; // Skip the rest of this node data
                    continue;
                }
                
                const position = new Vector3(
                    dataView.getFloat32(offset, true),     // x
                    dataView.getFloat32(offset + 4, true), // y
                    dataView.getFloat32(offset + 8, true)  // z
                );
                offset += 12;
                
                const velocity = new Vector3(
                    dataView.getFloat32(offset, true),      // x
                    dataView.getFloat32(offset + 4, true),  // y
                    dataView.getFloat32(offset + 8, true)   // z
                );
                offset += 12;
                
                // Apply position filtering
                const lastPosition = this.lastNodePositions.get(id);
                if (lastPosition) {
                    // Calculate squared distance to avoid unnecessary sqrt
                    const dx = position.x - lastPosition.x;
                    const dy = position.y - lastPosition.y;
                    const dz = position.z - lastPosition.z;
                    const distanceSquared = dx*dx + dy*dy + dz*dz;
                
                    // Skip if change is too small
                    if (distanceSquared <= (POSITION_DEADBAND * POSITION_DEADBAND)) {
                        continue;
                    } 
                }

                // Store position for future comparison
                this.lastNodePositions.set(id, position.clone());

                // Add node to processed list
                nodes.push({ id, position, velocity });
            }

            // Add nodes to pending updates
            if (nodes.length > 0) {
                this.pendingNodeUpdates.push(...nodes);

                // Process updates with throttling
                if (this.updateThrottler.shouldUpdate()) {
                    this.processPendingNodeUpdates();
                } else {
                    if (this.nodeUpdateTimer === null) {
                        this.nodeUpdateTimer = window.setTimeout(() => {
                            this.processPendingNodeUpdates();
                            this.nodeUpdateTimer = null;
                        }, this.updateThrottler.getTimeUntilNextUpdate());
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to process binary message:', createErrorMetadata(error));
        }
    }
    
    /**
     * Process all pending node updates at the throttled rate
     */
    private processPendingNodeUpdates(): void {
        if (this.pendingNodeUpdates.length > 0 && this.binaryMessageCallback) {
            // Process all pending updates at once
            try {
                this.binaryMessageCallback(this.pendingNodeUpdates);
                
                // Log processing stats
                if (debugState.isWebsocketDebugEnabled()) {
                    logger.debug('Processed node updates:', createDataMetadata({
                        count: this.pendingNodeUpdates.length,
                        throttleRate: this.updateThrottler.getRate()
                    }));
                }
                
                // Clear pending updates
                this.pendingNodeUpdates = [];
            } catch (error: any) {
                logger.error('Error processing node updates:', createErrorMetadata(error));
            }
        }
    }

    private handleReconnect(): void {
        const wasConnected = this.connectionState === ConnectionState.CONNECTED;
        
        // Store current state for logging
        const prevState = this.connectionState;
        this.binaryMessageCallback = null;
        this.connectionState = ConnectionState.DISCONNECTED;
        // Reset the readiness flag
        this.isReadyFlag = false;
        
        logger.info(`WebSocket reconnect triggered (previous state: ${prevState})`);
        
        if (this.reconnectTimeout !== null) {
            window.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.reconnectAttempts < this._maxReconnectAttempts &&
            (wasConnected || this.reconnectAttempts === 0)) {
            
            this.reconnectAttempts++;
            const delay = this.getReconnectDelay();
            
            this.connectionState = ConnectionState.RECONNECTING;
            logger.info(`WebSocket reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts} of ${this._maxReconnectAttempts})`);
            
            // Use setTimeout instead of window.setTimeout for more consistent behavior
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
        // Ensure readiness flag is reset
        this.isReadyFlag = false;
        
        logger.error('WebSocket reconnection failed after maximum attempts', createDataMetadata({
            attempts: this.reconnectAttempts,
            maxAttempts: this._maxReconnectAttempts,
            url: this.url
        }));
        
        // Update binary protocol status to failed
        debugState.setBinaryProtocolStatus('failed');
        
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

    // Enhanced message sending with better error handling
    public sendMessage(message: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const serializedMessage = JSON.stringify(message);
            try {
                this.ws.send(serializedMessage);
                
                // Only log ping messages in debug mode to avoid excessive logging
                if (message.type !== 'ping' || debugState.isWebsocketDebugEnabled()) {
                    debugLog(`Sent message type: ${message.type}`);
                }
            } catch (error) {
                logger.error('Error sending message:', createErrorMetadata({
                    error: error instanceof Error ? error.message : String(error),
                    messageType: message.type,
                    connectionState: this.connectionState,
                    wsReadyState: this.ws.readyState
                }));
            }
        }
    }

    /**
     * Enable or disable server-side node position randomization
     * This should only be called after the initial data loading is complete
     * @param enabled Whether randomization should be enabled
     */
    public enableRandomization(enabled: boolean): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if (enabled) {
                logger.warn('WebSocket not connected, attempting to reconnect before enabling randomization');
                // Try to reconnect
                this.connect().then(() => {
                    // If connection succeeded, try again
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        logger.info(`${enabled ? 'Enabling' : 'Disabling'} server-side position randomization after reconnection`);
                        this.sendMessage({ type: 'enableRandomization', enabled });
                    }
                }).catch(e => {
                    logger.error('Failed to reconnect for randomization:', createErrorMetadata(e));
                });
            } else {
                logger.warn('WebSocket not connected, cannot disable randomization');
            }
            return;
        }

        logger.info(`${enabled ? 'Enabling' : 'Disabling'} server-side position randomization`);
        this.sendMessage({ type: 'enableRandomization', enabled });
    }
    
    
    public sendNodeUpdates(updates: NodeUpdate[]): void {
        // Add detailed logging to see if updates are being sent
        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug(`WebSocketService.sendNodeUpdates called with ${updates.length} updates:`, updates);
        }

        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug(`Sending ${updates.length} node updates. Binary updates enabled: ${debugState.isBinaryProtocolEnabled()}`);
        }
        
        // Update binary protocol status based on connection state
        if (debugState.getBinaryProtocolStatus() === 'inactive') {
            debugState.setBinaryProtocolStatus('pending');
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.warn('WebSocket not connected, attempting to reconnect before sending updates');
            debugState.setBinaryProtocolStatus('pending');
            
            // Try to reconnect and then send updates 
            this.connect().then(() => {
                // Check if connection succeeded
                if (this.ws?.readyState === WebSocket.OPEN) {
                    logger.info('Reconnected successfully, now sending queued node updates');
                    debugState.setBinaryProtocolStatus('active');
                    this.nodeUpdateQueue.push(...updates);
                    this.processNodeUpdateQueue();
                } else {
                    logger.warn('WebSocket still not connected after reconnect attempt');
                    debugState.setBinaryProtocolStatus('failed');
                }
            }).catch(e => {
                logger.error('Failed to reconnect for node updates:', createErrorMetadata(e));
                debugState.setBinaryProtocolStatus('error');
            });
            return;
        }

        // Pre-validate node IDs before adding to queue
        const validatedUpdates = updates.filter(update => {
            const id = parseInt(update.id, 10);

            // Ensure ID is within u16 range (0-65535)
            if (id > MAX_U16_VALUE) {
                logger.warn(`Node ID ${id} exceeds maximum u16 value (${MAX_U16_VALUE}), cannot send update`);
                return false;
            }
            
            // Check for NaN or non-numeric IDs
            if (isNaN(id) || id < 0 || !Number.isInteger(id)) {
                // This is likely a metadata name being incorrectly used as a node ID
                if (debugState.isWebsocketDebugEnabled()) {
                    logger.debug('Non-numeric node ID detected, will map to numeric index:', createDataMetadata({
                        id: update.id,
                        valueType: typeof update.id,
                        length: typeof update.id === 'string' ? update.id.length : 0
                    }));
                }
                // Don't filter out non-numeric IDs - they will be mapped below
                return false;
            }
            return true;
        });
        
        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug(`Validated ${validatedUpdates.length}/${updates.length} node updates as numeric IDs`);
        }

        if (validatedUpdates.length === 0 && updates.length > 0) {
            // If we have non-numeric node IDs (metadata names), convert them to numeric indices
            const indexedUpdates = updates.filter(update => {
                if (!this.nodeNameToIndexMap.has(update.id)) {
                    // Ensure we don't exceed u16 max value
                    if (this.nextNodeIndex > MAX_U16_VALUE) {
                        logger.warn(`Cannot map more node IDs, reached maximum u16 value (${MAX_U16_VALUE})`);
                        return false;
                    }
                    
                    // Generate a valid u16 index
                    const nodeIndex = this.nextNodeIndex++;
                    this.nodeNameToIndexMap.set(update.id, nodeIndex);
                    logger.info(`Mapped metadata name "${update.id}" to numeric index ${nodeIndex} for binary protocol`);
                }
                
                // Check if this is a randomization operation (large position changes)
                // If so, bypass the deadband filtering
                const nodeId = this.nodeNameToIndexMap.get(update.id)!;
                const lastPosition = this.lastNodePositions.get(nodeId);
                
                if (lastPosition) {
                    // Calculate squared distance manually
                    const dx = update.position.x - lastPosition.x;
                    const dy = update.position.y - lastPosition.y;
                    const dz = update.position.z - lastPosition.z;
                    const distanceSquared = dx*dx + dy*dy + dz*dz;
                    
                    // Check if this is a significant position change (likely from randomization)
                    const isSignificantChange = distanceSquared > 1.0; // 1.0 is a larger threshold to detect randomization
                    
                    // Only apply deadband filtering for small movements, not for randomization
                    if (!isSignificantChange && distanceSquared < (POSITION_DEADBAND * POSITION_DEADBAND)) {
                        if (debugState.isWebsocketDebugEnabled() && Math.random() < 0.01) {
                            logger.debug(`Filtered client update for node ${update.id} - position change too small`);
                        }
                        return false; // Filter out this update
                    }
                    
                    if (isSignificantChange && debugState.isWebsocketDebugEnabled()) {
                        logger.debug(`Detected significant position change for node ${update.id} - likely randomization`);
                    }
                }
                
                // Use the numeric index for the binary protocol
                // Keep this update and transform it
                return true;
            }).map(update => {
                const numericId = this.nodeNameToIndexMap.get(update.id)!;
                return { ...update, id: numericId.toString() }; 
            });
                
            // Add the indexed updates to the queue
            this.nodeUpdateQueue.push(...indexedUpdates);
        } else if (validatedUpdates.length > 0) {
            // Add already-numeric updates to the queue
            this.nodeUpdateQueue.push(...validatedUpdates);
        } else {
            return; // No updates to process
        }
        
        
        // Debounce updates to prevent flooding the server
        if (this.nodeUpdateTimer === null) {
            this.nodeUpdateTimer = window.setTimeout(() => {
                this.processNodeUpdateQueue();
                this.nodeUpdateTimer = null;
            }, this.NODE_UPDATE_DEBOUNCE_MS);
        }
    }
    
    private processNodeUpdateQueue(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.nodeUpdateQueue.length === 0) {
            if (this.nodeUpdateQueue.length > 0) {
                logger.warn(`Discarding ${this.nodeUpdateQueue.length} updates because WebSocket is not open (state: ${this.ws?.readyState})`);
                debugState.setBinaryProtocolStatus('error');
            }
            this.nodeUpdateQueue = [];
            return;
        }
        
        // Update binary protocol status to active since we're about to send updates
        if (debugState.getBinaryProtocolStatus() === 'pending') {
            debugState.setBinaryProtocolStatus('active');
        }
        
        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug(`Processing node update queue with ${this.nodeUpdateQueue.length} updates`);
        }
        
        // Get the most recent updates for each node ID (to avoid sending outdated positions)
        const latestUpdates = new Map<string, NodeUpdate>();
        
        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug('Node update queue contents:', this.nodeUpdateQueue);
        }
        
        for (const update of this.nodeUpdateQueue) {
            latestUpdates.set(update.id, update);
        }
        
        // Convert to array - allow more nodes per update for randomization operations
        let updates = Array.from(latestUpdates.values());
        const originalCount = updates.length;
        
        // For randomization, we want to send more nodes at once
        // Check if this is likely a randomization operation (many nodes at once)
        const isLikelyRandomization = updates.length > 5;
        const maxNodesPerUpdate = isLikelyRandomization ? 10 : 2;
        
        if (updates.length > maxNodesPerUpdate) {
            if (debugState.isWebsocketDebugEnabled()) {
                logger.debug(`Many nodes in update (${updates.length}), limiting to ${maxNodesPerUpdate} nodes per batch`);
            }
            updates = updates.slice(0, maxNodesPerUpdate);
        }
        
        // Clear the queue
        this.nodeUpdateQueue = [];
        
        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug(`Processing ${updates.length}/${originalCount} node updates`);
            if (updates.length > 0) {
                logger.debug('Sample node update:', updates[0]);
            }
        }

        // Calculate buffer size based on node count (26 bytes per node)
        const bufferSize = updates.length * BYTES_PER_NODE;
        const buffer = new ArrayBuffer(bufferSize);
        const dataView = new DataView(buffer);
        
        // Start writing node data from the beginning
        let offset = 0;

        updates.forEach(update => {
            const id = parseInt(update.id, 10); 
            if (isNaN(id)) {
                logger.warn('Invalid node ID in queue:', createDataMetadata({ 
                    nodeId: update.id,
                    type: typeof update.id,
                    length: typeof update.id === 'string' ? update.id.length : 0,
                    isPossibleMetadataName: typeof update.id === 'string' && 
                                          update.id.length > 10 && !/^\d+$/.test(update.id)
                }));
                return; // Skip this update
            }
            // Write node ID as u16 
            dataView.setUint16(offset, id, true);
            offset += 2;

            // Validate position using our new utility function
            const position = validateAndFixVector3(update.position, 1000);
            
            // Write position
            dataView.setFloat32(offset, position.x, true);
            dataView.setFloat32(offset + 4, position.y, true);
            dataView.setFloat32(offset + 8, position.z, true);
            offset += 12;

            // Validate and clamp velocity (default to zero vector if not provided)
            const rawVelocity = update.velocity ?? new Vector3(0, 0, 0);
            const velocity = validateAndFixVector3(rawVelocity, 0.05);
            
            // Write velocity
            dataView.setFloat32(offset, velocity.x, true);
            dataView.setFloat32(offset + 4, velocity.y, true);
            dataView.setFloat32(offset + 8, velocity.z, true);
            offset += 12;
        });

        const finalBuffer = this.compressIfNeeded(buffer);
        this.ws.send(finalBuffer);
        
        if (debugState.isWebsocketDebugEnabled()) {
            logger.debug(`Sent binary message with ${updates.length} nodes (${finalBuffer.byteLength} bytes)`);
        }
    }

    public onConnectionStatusChange(handler: (status: boolean) => void): void {
        this.connectionStatusHandler = handler;
        if (this.connectionState === ConnectionState.CONNECTED && handler) {
            handler(true);
        }
    }

    /**
     * Register a handler for loading status changes
     * @param handler Callback function that receives loading state and optional message
     */
    public onLoadingStatusChange(handler: (isLoading: boolean, message?: string) => void): void {
        this.loadingStatusHandler = handler;
        
        // Immediately notify with current state if already loading
        if (this.isLoading && handler) {
            handler(true);
        }
    }

    /**
     * Reset the readiness state. This should be called when reinitializing the connection.
     */
    public resetReadyState(): void {
        this.isReadyFlag = false;
        logger.info('WebSocket readiness state reset');
    }

    public dispose(): void {
        if (this.reconnectTimeout !== null) {
            window.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
            logger.debug('Cleared reconnect timeout during disposal');
        }
        
        if (this.nodeUpdateTimer !== null) {
            window.clearTimeout(this.nodeUpdateTimer);
            this.nodeUpdateTimer = null;
            this.nodeUpdateQueue = [];
            logger.debug('Cleared node update timer during disposal');
        }
        
        if (this.heartbeatInterval !== null) {
            window.clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            logger.debug('Cleared heartbeat interval during disposal');
        }

        // Clear position tracking data to prevent memory leaks
        this.lastNodePositions.clear();
        this.pendingNodeUpdates = [];
        
        // Reset readiness flag
        this.isReadyFlag = false;
        
        if (this.ws) {
            logger.info('Closing WebSocket connection during disposal');
            this.ws.close();
            this.ws = null;
        }

        logger.info('WebSocket service disposal complete');
        
        this.binaryMessageCallback = null;
        this.connectionStatusHandler = null;
        this.connectionState = ConnectionState.DISCONNECTED;
        WebSocketService.instance = null;
    }

    public close(): void {
        // Reset readiness flag when closing
        this.isReadyFlag = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    
    /**
     * Send raw binary data through the WebSocket connection
     * This method is used by the GraphDataManager adapter
     * @param data The ArrayBuffer to send
     * @returns boolean indicating if the data was sent successfully
     */
    public sendRawBinaryData(data: ArrayBuffer): boolean {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.warn('WebSocket not connected, cannot send raw binary data');
            return false;
        }
        
        try {
            const finalData = this.compressIfNeeded(data);
            this.ws.send(finalData);
            return true;
        } catch (error) {
            logger.error('Error sending raw binary data:', createErrorMetadata(error));
            return false;
        }
    }
}