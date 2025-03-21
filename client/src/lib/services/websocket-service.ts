import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';

const logger = createLogger('WebSocketService');

export interface WebSocketAdapter {
  send: (data: ArrayBuffer) => void;
  isReady: () => boolean;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
}

type MessageHandler = (message: WebSocketMessage) => void;
type BinaryMessageHandler = (data: ArrayBuffer) => void;
type ConnectionStatusHandler = (connected: boolean) => void;

class WebSocketService {
  private static instance: WebSocketService;
  private socket: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private binaryMessageHandlers: BinaryMessageHandler[] = [];
  private connectionStatusHandlers: ConnectionStatusHandler[] = [];
  private reconnectInterval: number = 2000;
  private maxReconnectAttempts: number = 10;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: number | null = null;
  private isConnected: boolean = false;
  private isServerReady: boolean = false;
  private url: string;

  private constructor() {
    // Default WebSocket URL
    this.url = this.determineWebSocketUrl();
  }

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private determineWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/wss`;
  }

  public async connect(): Promise<void> {
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
      return new Promise<void>((resolve, reject) => {
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
    } catch (error) {
      logger.error('Error establishing WebSocket connection:', createErrorMetadata(error));
      throw error;
    }
  }

  private handleOpen(event: Event): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    if (debugState.isEnabled()) {
      logger.info('WebSocket connection established');
    }
    this.notifyConnectionStatusHandlers(true);
  }

  private handleMessage(event: MessageEvent): void {
    // Check for binary data
    if (event.data instanceof ArrayBuffer) {
      this.handleBinaryMessage(event.data);
      return;
    }

    try {
      // Parse JSON message
      const message = JSON.parse(event.data) as WebSocketMessage;
      
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
        } catch (error) {
          logger.error('Error in message handler:', createErrorMetadata(error));
        }
      });
    } catch (error) {
      logger.error('Error parsing WebSocket message:', createErrorMetadata(error));
    }
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Received binary message: ${data.byteLength} bytes`);
    }

    // Notify all binary message handlers
    this.binaryMessageHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        logger.error('Error in binary message handler:', createErrorMetadata(error));
      }
    });
  }

  private handleClose(event: CloseEvent): void {
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

  private handleError(event: Event): void {
    logger.error('WebSocket error:', { event });
    // The close handler will be called after this, which will handle reconnection
  }

  private attemptReconnect(): void {
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
    } else {
      logger.error(`Maximum reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
    }
  }

  public sendMessage(type: string, data?: any): void {
    if (!this.isConnected || !this.socket) {
      logger.warn('Cannot send message: WebSocket not connected');
      return;
    }

    try {
      const message: WebSocketMessage = { type, data };
      this.socket.send(JSON.stringify(message));
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Sent message: ${type}`);
      }
    } catch (error) {
      logger.error('Error sending WebSocket message:', createErrorMetadata(error));
    }
  }

  public sendRawBinaryData(data: ArrayBuffer): void {
    if (!this.isConnected || !this.socket) {
      logger.warn('Cannot send binary data: WebSocket not connected');
      return;
    }

    try {
      this.socket.send(data);
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Sent binary data: ${data.byteLength} bytes`);
      }
    } catch (error) {
      logger.error('Error sending binary data:', createErrorMetadata(error));
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  public onBinaryMessage(handler: BinaryMessageHandler): () => void {
    this.binaryMessageHandlers.push(handler);
    return () => {
      this.binaryMessageHandlers = this.binaryMessageHandlers.filter(h => h !== handler);
    };
  }

  public onConnectionStatusChange(handler: ConnectionStatusHandler): () => void {
    this.connectionStatusHandlers.push(handler);
    // Immediately notify of current status
    handler(this.isConnected);
    return () => {
      this.connectionStatusHandlers = this.connectionStatusHandlers.filter(h => h !== handler);
    };
  }

  private notifyConnectionStatusHandlers(connected: boolean): void {
    this.connectionStatusHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        logger.error('Error in connection status handler:', createErrorMetadata(error));
      }
    });
  }

  public isReady(): boolean {
    return this.isConnected && this.isServerReady;
  }

  public close(): void {
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
      } catch (error) {
        logger.error('Error closing WebSocket:', createErrorMetadata(error));
      } finally {
        this.socket = null;
        this.isConnected = false;
        this.isServerReady = false;
        this.notifyConnectionStatusHandlers(false);
      }
    }
  }
}

export default WebSocketService;