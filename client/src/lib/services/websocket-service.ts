import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
import { maybeDecompress, isZlibCompressed } from '../utils/binary-utils';

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
    // Check for binary data first
    if (event.data instanceof Blob) {
      // Convert Blob to ArrayBuffer
      event.data.arrayBuffer().then(buffer => {
        // Process the ArrayBuffer, with possible decompression
        this.processBinaryData(buffer);
      }).catch(error => {
        logger.error('Error converting Blob to ArrayBuffer:', createErrorMetadata(error));
      });
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      // Process the ArrayBuffer directly, with possible decompression
      this.processBinaryData(event.data);
      return;
    }

    // If not binary, try to parse as JSON
    try {
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

  // New method to handle binary data with decompression
  private processBinaryData(data: ArrayBuffer): void {
    if (!data) {
      logger.warn('Received empty binary data');
      return;
    }

    // Check if data is compressed
    const isCompressed = isZlibCompressed(data);
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Received binary data: ${data.byteLength} bytes (${isCompressed ? 'compressed' : 'uncompressed'})`);
      
      // Log first few bytes for debugging header detection
      const viewData = new Uint8Array(data);
      const hexBytes = [];
      const maxBytesToShow = Math.min(8, data.byteLength);
      
      for (let i = 0; i < maxBytesToShow; i++) {
        hexBytes.push(viewData[i].toString(16).padStart(2, '0'));
      }
      logger.debug(`Data header bytes: ${hexBytes.join(' ')}`);
    }

    if (isCompressed) {
      // Decompress the data asynchronously
      maybeDecompress(data)
        .then(decompressedData => {
          // Process the decompressed data
          if (debugState.isDataDebugEnabled()) {
            logger.debug(`Successfully decompressed data: ${data.byteLength} bytes → ${decompressedData.byteLength} bytes`);
          }
          this.handleBinaryMessage(decompressedData);
        })
        .catch(error => {
          logger.error('Failed to decompress binary data:', createErrorMetadata(error));
          
          // Log more details about the data that failed to decompress
          if (debugState.isEnabled()) {
            try {
              const viewData = new Uint8Array(data);
              const hexBytes = [];
              const maxBytesToShow = Math.min(32, data.byteLength);
              
              for (let i = 0; i < maxBytesToShow; i++) {
                hexBytes.push(viewData[i].toString(16).padStart(2, '0'));
              }
              
              logger.debug(`Failed decompression of data with header: ${hexBytes.join(' ')}`);
              
              // Check if it matches known zlib headers
              if (viewData[0] === 0x78) {
                logger.debug(`Data has zlib marker (0x78) but failed decompression with second byte: 0x${viewData[1].toString(16)}`);
              }
            } catch (e) {
              logger.debug('Could not analyze binary data that failed decompression');
            }
          }
          
          // Try processing the raw data as fallback
          logger.warn('Falling back to processing raw (compressed) data');
          this.handleBinaryMessage(data);
        });
    } else {
      // Data is not compressed, process directly
      this.handleBinaryMessage(data);
    }
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    if (!data) {
      logger.warn('Received empty binary message');
      return;
    }
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Processing binary message: ${data.byteLength} bytes`);
      
      // Add detailed logging for suspicious data sizes
      if (data.byteLength < 26) { // Less than one node's worth of data
        logger.warn(`Binary message size (${data.byteLength} bytes) too small for a complete node update`);
      } else if (data.byteLength % 4 !== 0) { // Not aligned to 4-byte boundary (float32)
        logger.warn(`Binary message size (${data.byteLength} bytes) not aligned to 4-byte boundary`);
      }
    }

    // Create a safe copy of the data to prevent modifications
    const safeCopy = data.slice(0);

    // Notify all binary message handlers
    this.binaryMessageHandlers.forEach(handler => {
      try {
        handler(safeCopy);
      } catch (error) {
        logger.error('Error in binary message handler:', createErrorMetadata(error));
        
        // Add detailed error diagnostics
        if (debugState.isEnabled()) {
          try {
            // Display some of the binary data for debugging
            const view = new DataView(data);
            const bytesPreview = [];
            const maxBytes = Math.min(32, data.byteLength);
            
            for (let i = 0; i < maxBytes; i++) {
              bytesPreview.push(view.getUint8(i).toString(16).padStart(2, '0'));
            }
            
            logger.debug(`Binary data preview (${maxBytes} of ${data.byteLength} bytes): ${bytesPreview.join(' ')}`);
          } catch (e) {
            logger.debug('Failed to generate binary data preview:', e);
          }
        }
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