import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
const logger = createLogger('WebSocketService');
class WebSocketService {
    constructor() {
        this.socket = null;
        this.messageHandlers = [];
        this.binaryMessageHandlers = [];
        this.connectionStatusHandlers = [];
        this.reconnectInterval = 2000;
        this.maxReconnectAttempts = 10;
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        this.isConnected = false;
        this.isServerReady = false;
        // Default WebSocket URL
        this.url = this.determineWebSocketUrl();
    }
    static getInstance() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }
    determineWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }
    async connect() {
        // Don't try to connect if already connecting or connected
        if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
            return;
        }
        try {
            if (debugState.isEnabled()) {
                logger.info(`Connecting to WebSocket at ${this.url}`);
            }
            // Create a new WebSocket connection
            this.socket = new WebSocket(this.url);
            // Handle WebSocket events
            this.socket.onopen = this.handleOpen.bind(this);
            this.socket.onmessage = this.handleMessage.bind(this);
            this.socket.onclose = this.handleClose.bind(this);
            this.socket.onerror = this.handleError.bind(this);
            // Create a promise that resolves when the connection opens or rejects on error
            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error('Socket initialization failed'));
                    return;
                }
                // Resolve when the socket successfully opens
                this.socket.addEventListener('open', () => resolve(), { once: true });
                // Reject if there's an error before the socket opens
                this.socket.addEventListener('error', (event) => {
                    // Only reject if the socket hasn't opened yet
                    if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                        reject(new Error('WebSocket connection failed'));
                    }
                }, { once: true });
            });
        }
        catch (error) {
            logger.error('Error establishing WebSocket connection:', createErrorMetadata(error));
            throw error;
        }
    }
    handleOpen(event) {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (debugState.isEnabled()) {
            logger.info('WebSocket connection established');
        }
        this.notifyConnectionStatusHandlers(true);
    }
    handleMessage(event) {
        // Check for binary data
        if (event.data instanceof ArrayBuffer) {
            this.handleBinaryMessage(event.data);
            return;
        }
        try {
            // Parse JSON message
            const message = JSON.parse(event.data);
            if (debugState.isDataDebugEnabled()) {
                logger.debug(`Received WebSocket message: ${message.type}`);
            }
            // Special handling for connection_established message
            if (message.type === 'connection_established') {
                this.isServerReady = true;
                if (debugState.isEnabled()) {
                    logger.info('Server connection established and ready');
                }
            }
            // Notify all message handlers
            this.messageHandlers.forEach(handler => {
                try {
                    handler(message);
                }
                catch (error) {
                    logger.error('Error in message handler:', createErrorMetadata(error));
                }
            });
        }
        catch (error) {
            logger.error('Error parsing WebSocket message:', createErrorMetadata(error));
        }
    }
    handleBinaryMessage(data) {
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Received binary message: ${data.byteLength} bytes`);
        }
        // Notify all binary message handlers
        this.binaryMessageHandlers.forEach(handler => {
            try {
                handler(data);
            }
            catch (error) {
                logger.error('Error in binary message handler:', createErrorMetadata(error));
            }
        });
    }
    handleClose(event) {
        this.isConnected = false;
        this.isServerReady = false;
        if (debugState.isEnabled()) {
            logger.info(`WebSocket connection closed: ${event.code} ${event.reason}`);
        }
        this.notifyConnectionStatusHandlers(false);
        // Attempt to reconnect if it wasn't a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
            this.attemptReconnect();
        }
    }
    handleError(event) {
        logger.error('WebSocket error:', { event });
        // The close handler will be called after this, which will handle reconnection
    }
    attemptReconnect() {
        // Clear any existing reconnect timeout
        if (this.reconnectTimeout) {
            window.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
            if (debugState.isEnabled()) {
                logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            }
            this.reconnectTimeout = window.setTimeout(() => {
                this.connect().catch(error => {
                    logger.error('Reconnect attempt failed:', createErrorMetadata(error));
                });
            }, delay);
        }
        else {
            logger.error(`Maximum reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
        }
    }
    sendMessage(type, data) {
        if (!this.isConnected || !this.socket) {
            logger.warn('Cannot send message: WebSocket not connected');
            return;
        }
        try {
            const message = { type, data };
            this.socket.send(JSON.stringify(message));
            if (debugState.isDataDebugEnabled()) {
                logger.debug(`Sent message: ${type}`);
            }
        }
        catch (error) {
            logger.error('Error sending WebSocket message:', createErrorMetadata(error));
        }
    }
    sendRawBinaryData(data) {
        if (!this.isConnected || !this.socket) {
            logger.warn('Cannot send binary data: WebSocket not connected');
            return;
        }
        try {
            this.socket.send(data);
            if (debugState.isDataDebugEnabled()) {
                logger.debug(`Sent binary data: ${data.byteLength} bytes`);
            }
        }
        catch (error) {
            logger.error('Error sending binary data:', createErrorMetadata(error));
        }
    }
    onMessage(handler) {
        this.messageHandlers.push(handler);
        return () => {
            this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        };
    }
    onBinaryMessage(handler) {
        this.binaryMessageHandlers.push(handler);
        return () => {
            this.binaryMessageHandlers = this.binaryMessageHandlers.filter(h => h !== handler);
        };
    }
    onConnectionStatusChange(handler) {
        this.connectionStatusHandlers.push(handler);
        // Immediately notify of current status
        handler(this.isConnected);
        return () => {
            this.connectionStatusHandlers = this.connectionStatusHandlers.filter(h => h !== handler);
        };
    }
    notifyConnectionStatusHandlers(connected) {
        this.connectionStatusHandlers.forEach(handler => {
            try {
                handler(connected);
            }
            catch (error) {
                logger.error('Error in connection status handler:', createErrorMetadata(error));
            }
        });
    }
    isReady() {
        return this.isConnected && this.isServerReady;
    }
    close() {
        if (this.socket) {
            // Clear reconnection timeout
            if (this.reconnectTimeout) {
                window.clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            try {
                // Close the socket with a normal closure
                this.socket.close(1000, 'Normal closure');
                if (debugState.isEnabled()) {
                    logger.info('WebSocket connection closed by client');
                }
            }
            catch (error) {
                logger.error('Error closing WebSocket:', createErrorMetadata(error));
            }
            finally {
                this.socket = null;
                this.isConnected = false;
                this.isServerReady = false;
                this.notifyConnectionStatusHandlers(false);
            }
        }
    }
}
export default WebSocketService;
