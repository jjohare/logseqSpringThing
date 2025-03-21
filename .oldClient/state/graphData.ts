import { transformGraphData, Node, Edge, GraphData } from '../core/types';
import { createLogger } from '../core/utils';
import { Vector3 } from 'three';
import { API_ENDPOINTS } from '../core/constants';
import { debugState } from '../core/debugState';

import { WebSocketService as WebSocketServiceClass } from '../websocket/websocketService';
const logger = createLogger('GraphDataManager');

// Constants
const FLOATS_PER_NODE = 6;     // x, y, z, vx, vy, vz

// Throttling for debug logs
let lastDebugLogTime = 0;
const DEBUG_LOG_THROTTLE_MS = 2000; // Only log once every 2 seconds
const POSITION_UPDATE_THROTTLE_MS = 100; // Throttle position updates to 10 times per second
let lastPositionUpdateTime = 0;

// Helper for throttled debug logging
function throttledDebugLog(message: string, data?: any): void {
  if (!debugState.isDataDebugEnabled()) return;
  
  const now = Date.now();
  if (now - lastDebugLogTime > DEBUG_LOG_THROTTLE_MS) {
    lastDebugLogTime = now;
    logger.debug(message, data);
  }
}

// Interface for the internal WebSocket service used by this class
// Updated to include isReady method
type InternalWebSocketService = { 
  send(data: ArrayBuffer): void;
  isReady?(): boolean;
};

// Extend Edge interface to include id
interface EdgeWithId extends Edge {
  id: string;
}

// Update NodePosition type to use THREE.Vector3
type NodePosition = Vector3;

// Interface for pending edges that need to be processed after node loading
interface PendingEdge {
  edge: Edge;
  retryCount: number;
}

export class GraphDataManager {
  private static instance: GraphDataManager;
  private nodes: Map<string, Node>;
  private edges: Map<string, EdgeWithId>;
  private wsService!: InternalWebSocketService;  // Use definite assignment assertion
  private nodeIdToMetadataId: Map<string, string> = new Map();
  private pendingEdges: PendingEdge[] = [];
  private graphDataComplete: boolean = false;
  private metadata: Record<string, any>;
  private updateListeners: Set<(data: GraphData) => void>;
  private positionUpdateListeners: Set<(positions: Float32Array) => void>;
  private binaryUpdatesEnabled: boolean = false;
  private positionUpdateBuffer: Map<string, NodePosition> = new Map();
  private updateBufferTimeout: number | null = null;
  private static readonly BUFFER_FLUSH_INTERVAL = 16; // ~60fps
  private constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.metadata = {};
    this.updateListeners = new Set();
    this.positionUpdateListeners = new Set();
    // Initialize with a no-op websocket service
    this.wsService = {
      send: () => logger.warn('WebSocket service not configured'),
      isReady: () => false
    };
    // Don't enable binary updates by default
    this.binaryUpdatesEnabled = false;
  }

  /**
   * Configure the WebSocket service for binary updates
   */
  public setWebSocketService(service: InternalWebSocketService): void {
    this.wsService = service;
    logger.info('WebSocket service configured');
    
    // If binary updates were enabled before the service was configured,
    // check if service is ready before sending initial update
    if (this.binaryUpdatesEnabled) {
      try {
        // Check if the WebSocket service is ready using the isReady method if available
        const isReady = typeof this.wsService.isReady === 'function' && this.wsService.isReady();
        
        if (isReady) {
          this.updatePositions(new Float32Array());
          logger.info('Sent initial empty update after WebSocket service configuration');
        } else {
          logger.info('WebSocket service configured but not ready yet. Will send update when ready.');
          this.retryWebSocketConfiguration();
        }
      } catch (error) {
        logger.error('Failed to send initial update after WebSocket service configuration:', error);
      }
    }
  }

  static getInstance(): GraphDataManager {
    if (!GraphDataManager.instance) {
      GraphDataManager.instance = new GraphDataManager();
    }
    return GraphDataManager.instance;
  }

  public async fetchInitialData(): Promise<void> {
    try {
      // Start with first page
      throttledDebugLog('Fetching initial graph data page');
      const pageSize = 100; // Consistent page size
      await this.fetchPaginatedData(1, pageSize);
      
      throttledDebugLog(`Initial graph data page loaded. Current nodes: ${this.nodes.size}, edges: ${this.edges.size}`);
      
      // Force a notification to the UI after first page is loaded
      // This ensures we show something to the user quickly
      this.notifyUpdateListeners();
      
      // Initialize graphDataComplete as false when starting to fetch data
      this.graphDataComplete = false;
      
      // Get total pages from metadata
      const totalPages = this.metadata.pagination?.totalPages || 1;
      const totalItems = this.metadata.pagination?.totalItems || 0;
      
      if (totalPages > 1) {
        throttledDebugLog(`Loading remaining ${totalPages - 1} pages in background. Total items: ${totalItems}, Current items: ${this.nodes.size}`);
        // Load remaining pages in background with improved error handling
        this.loadRemainingPagesWithRetry(totalPages, 100);
      }
    } catch (error) {
      logger.error('Failed to fetch initial graph data:', error);
      throw error;
    }
  }

  /**
   * Load remaining pages with retry mechanism
   * This runs in the background and doesn't block the initial rendering
   */
  private async loadRemainingPagesWithRetry(totalPages: number, pageSize: number): Promise<void> {
    // Start from page 2 since page 1 is already loaded
    for (let page = 2; page <= totalPages; page++) {
      let retries = 0;
      const maxRetries = 3;
      let success = false;
      
      while (!success && retries < maxRetries) {
        try {
          await this.fetchPaginatedData(page, pageSize);
          success = true;
          throttledDebugLog(`Loaded page ${page}/${totalPages} successfully`);
        } catch (error) {
          retries++;
          const delay = Math.min(1000 * Math.pow(2, retries), 10000); // Exponential backoff with max 10s
          
          logger.warn(`Failed to load page ${page}/${totalPages}, attempt ${retries}/${maxRetries}. Retrying in ${delay}ms...`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      if (!success) {
        logger.error(`Failed to load page ${page}/${totalPages} after ${maxRetries} attempts`);
      }
      
      // Notify listeners after each page, even if it failed
      this.notifyUpdateListeners();

          
      // Small delay between pages to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 200));
      
      throttledDebugLog(`Page ${page} loaded. Total nodes now: ${this.nodes.size}`);
    }
    
    // All pages are now loaded, enable randomization
    try {
      const websocketService = WebSocketServiceClass.getInstance();
      // Signal that all graph data has been loaded
      this.graphDataComplete = true;
      this.processPendingEdges(); // Process any pending edges now that all nodes are loaded
      logger.info(`Finished loading all ${totalPages} pages. Enabling server-side randomization.`);
      websocketService.enableRandomization(true);
    } catch (error) {
      logger.warn('Failed to enable randomization after loading all pages:', error);
    }
    logger.info(`Finished loading all ${totalPages} pages. Total nodes: ${this.nodes.size}, edges: ${this.edges.size}`);
  }

  public async fetchPaginatedData(page: number = 1, pageSize: number = 100): Promise<void> {
    try {
      throttledDebugLog(`Fetching page ${page} with size ${pageSize}. Current nodes: ${this.nodes.size}`);
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const url = `${API_ENDPOINTS.GRAPH_PAGINATED}?page=${page}&pageSize=${pageSize}`;
      throttledDebugLog(`Fetching paginated URL: ${url}`);
      
      const response = await fetch(
        url,
        {
          method: 'GET', 
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        }
      );
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch paginated data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      throttledDebugLog(`Received data for page ${page}:`, { nodes: data.nodes?.length, edges: data.edges?.length, totalItems: data.totalItems });
      
      this.updateGraphData(data);
      throttledDebugLog(`Paginated data loaded for page ${page}. Total nodes now: ${this.nodes.size}, edges: ${this.edges.size}`);
    } catch (error) {
      // If we got a 404, it might mean we've reached the end of the pagination
      const errorMessage = error instanceof Error ? error.message : 
                          (typeof error === 'string' ? error : 'Unknown error');
      if (errorMessage.includes('404')) {
        logger.warn(`Reached end of pagination at page ${page}, got 404. This might be expected.`);
        return;
      }
      logger.error(`Failed to fetch paginated data for page ${page}:`, error);
      throw error;
    }
  }

  /**
   * Enable binary position updates via WebSocket
   */
  public enableBinaryUpdates(): void {
    // Enable binary updates flag - actual WebSocket connection is handled by WebSocketService
    this.setBinaryUpdatesEnabled(true);
    logger.info('Binary updates enabled');
    
    // Check if WebSocket service is ready using new isReady method
    if (typeof this.wsService.isReady === 'function' && this.wsService.isReady()) {
      logger.info('WebSocket service is ready for binary updates');
      debugState.setBinaryProtocolStatus('active');
    } else {
      logger.warn('Binary updates enabled but WebSocket service not yet ready. Starting retry mechanism...');
      debugState.setBinaryProtocolStatus('pending');
      this.retryWebSocketConfiguration();
    }
  }

  /**
   * Enable or disable binary position updates
   */
  public setBinaryUpdatesEnabled(enabled: boolean): void {
    if (this.binaryUpdatesEnabled === enabled) return;
    
    this.binaryUpdatesEnabled = enabled;
    logger.info(`Binary updates ${enabled ? 'enabled' : 'disabled'}`);
    
    if (enabled) {
      // Check if WebSocket service is configured AND ready before sending update
      const isDefaultService = this.wsService.send.toString().includes('WebSocket service not configured');
      const isReady = typeof this.wsService.isReady === 'function' && this.wsService.isReady();
      
      if (!isDefaultService && isReady) {
        // Service is configured and ready, send initial update
        logger.info('WebSocket service is configured and ready, sending initial binary update');
        this.updatePositions(new Float32Array());
        debugState.setBinaryProtocolStatus('active');
      } else {
        if (isDefaultService) {
          logger.warn('Binary updates enabled but WebSocket service not yet configured. Will send update when service is available.');
        } else {
          logger.warn('Binary updates enabled but WebSocket service not yet ready. Will send update when service is ready.');
        }
        debugState.setBinaryProtocolStatus('pending');
        // Set up a retry mechanism to check for WebSocket service availability and readiness
        this.retryWebSocketConfiguration();
      }
    }
  }
  
  /**
   * Retry WebSocket configuration until it's available and ready
   * This helps ensure we don't miss updates when the WebSocket service
   * is configured after binary updates are enabled
   */
  private retryWebSocketConfiguration(): void {
    // Only set up retry if not already running
    if (this._retryTimeout) {
      logger.debug('Retry mechanism already running, not starting a new one');
      return;
    }
    
    logger.info('Starting WebSocket readiness check retry mechanism');
    debugState.setBinaryProtocolStatus('pending');
    
    // Define maximum retry attempts
    let retryCount = 0;
    const MAX_RETRIES = 30; // 30 seconds max
    
    const checkAndRetry = async () => {
      retryCount++;
      
      // Check if WebSocket service is now configured and ready
      const isDefaultService = this.wsService.send.toString().includes('WebSocket service not configured');
      const isReady = typeof this.wsService.isReady === 'function' && this.wsService.isReady();
      
      if (!isDefaultService && isReady) {
        // WebSocket service is now configured and ready, send initial update
        logger.info('WebSocket service now available and ready, sending initial update');
        this.updatePositions(new Float32Array());
        this._retryTimeout = null;
        debugState.setBinaryProtocolStatus('active');
      } else {
        // Still not configured or not ready, retry after delay if under max retries
        if (retryCount < MAX_RETRIES) {
          if (isDefaultService) {
            logger.debug(`WebSocket service still not configured (attempt ${retryCount}/${MAX_RETRIES})`);
          } else if (!isReady) {
            logger.debug(`WebSocket service configured but not ready (attempt ${retryCount}/${MAX_RETRIES})`);
          }
          this._retryTimeout = setTimeout(checkAndRetry, 1000) as any;
        } else {
          logger.warn(`WebSocket readiness retry failed after ${MAX_RETRIES} attempts`);
          this._retryTimeout = null;
          debugState.setBinaryProtocolStatus('failed');
        }
      }
    };
    
    // Start the retry process
    this._retryTimeout = setTimeout(checkAndRetry, 1000) as any;
  }
  
  private _retryTimeout: any = null;

  /**
   * Update node positions via binary protocol
   */
  private updatePositions(positions: Float32Array): void {
    if (!this.binaryUpdatesEnabled) {
      logger.warn('Attempted to update positions while binary updates are disabled');
      return;
    }
    
    try {
      // Check if WebSocket service is properly configured and ready
      const isDefaultService = this.wsService.send.toString().includes('WebSocket service not configured');
      const isReady = typeof this.wsService.isReady === 'function' && this.wsService.isReady();
      
      if (isDefaultService) {
        logger.warn('Cannot send position update: WebSocket service not configured');
        this.retryWebSocketConfiguration();
        return;
      }
      
      if (!isReady) {
        logger.warn('Cannot send position update: WebSocket service not ready');
        this.retryWebSocketConfiguration();
        return;
      }
      
      // Update binary protocol status in debug state
      debugState.setBinaryProtocolStatus('active');
      
      // Log the update if debugging is enabled
      if (debugState.isDataDebugEnabled()) {
        const nodeCount = positions.length / FLOATS_PER_NODE;
        logger.debug(`Sending binary position update for ${nodeCount} nodes`);
      }
      
      this.wsService.send(positions.buffer);
    } catch (error) {
      logger.error('Failed to send position update:', error);
      // Update status to reflect error
      debugState.setBinaryProtocolStatus('error');
      // Don't disable binary updates on error - let the application decide
      // this.binaryUpdatesEnabled = false;
    }
  }

  /**
   * Initialize or update the graph data
   */
  updateGraphData(data: any): void {
    // Transform and validate incoming data
    const transformedData = transformGraphData(data);
    // Process nodes before edges
    this.processNodeData(transformedData.nodes);
    logger.info(`Updating graph data. Incoming: ${transformedData.nodes.length} nodes, ${transformedData.edges?.length || 0} edges. First 3 node IDs: ${transformedData.nodes.slice(0, 3).map(n => n.id).join(', ')}`);
    
    // Debug edge source/target IDs
    if (transformedData.edges && transformedData.edges.length > 0) {
      throttledDebugLog(`First 3 edge source/target IDs: ${transformedData.edges.slice(0, 3).map(e => `${e.source}->${e.target}`).join(', ')}`);
    }
    
    // Process edges after nodes
    if (Array.isArray(transformedData.edges)) {
      this.processEdgeData(transformedData.edges);
    }

    // Update metadata, including pagination info if available
    this.metadata = {
      ...transformedData.metadata,
      pagination: data.totalPages ? {
        totalPages: data.totalPages,
        currentPage: data.currentPage,
        totalItems: data.totalItems,
        pageSize: data.pageSize
      } : undefined
    };

    // If this is a "complete" signal, process any remaining pending edges
    if (data.complete === true) {
      this.graphDataComplete = true;
      this.processPendingEdges();
      logger.info("Received graph complete signal. All data loaded.");
    }

    // Notify listeners
    this.notifyUpdateListeners();
    logger.info(`Updated graph data: ${this.nodes.size} nodes, ${this.edges.size} edges`);
  }

  /**
   * Process node data from incoming updates
   * @param nodes The array of nodes to process
   */
  private processNodeData(nodes: Node[]): void {
    // Update nodes with proper position and velocity
    nodes.forEach((node: Node) => {
      // Validate that the node ID is present and properly formatted
      if (!node.id || !/^\d+$/.test(node.id)) {
        logger.warn(`Received node with invalid ID format: ${node.id}. Node IDs must be numeric strings.`);
        return;
      }

      // Check if we already have this node
      const existingNode = this.nodes.get(node.id);
      
      if (existingNode) {
        // Update position and velocity
        existingNode.data.position.copy(node.data.position);
        if (node.data.velocity) {
          existingNode.data.velocity.copy(node.data.velocity);
        }

        // Track relationship between node ID and metadata ID (filename)
        const metadataId = node.data.metadata?.name || (node as any).metadataId;
        if (metadataId && metadataId !== node.id && metadataId.length > 0) {
          // Store mapping from numeric ID to metadata ID (filename or label)
          this.nodeIdToMetadataId.set(node.id, metadataId);
          
          // Log the mapping if debug is enabled
          if (debugState.isNodeDebugEnabled()) {
            throttledDebugLog(`Updated metadata mapping: ${node.id} -> ${metadataId}`);
          }

        }
        
        // Only update metadata if the new node has valid metadata that's better than what we have
        if (node.data.metadata?.name && 
            node.data.metadata.name !== node.id && 
            node.data.metadata.name.length > 0) {
          // Update existing node with new metadata
          existingNode.data.metadata = {
            ...existingNode.data.metadata,
            ...node.data.metadata
          };
        }
      } else {
        // Store mapping for new nodes, prioritizing explicit metadataId if available
        const metadataId = node.data.metadata?.name || (node as any).metadataId;
        if (metadataId && metadataId !== node.id && metadataId.length > 0) {
          // Store mapping from numeric ID to metadata ID
          this.nodeIdToMetadataId.set(node.id, metadataId);
          
          if (debugState.isNodeDebugEnabled()) {
            throttledDebugLog(`New metadata mapping: ${node.id} -> ${metadataId}`);
          }
        }
        this.nodes.set(node.id, node);
      }
    });
  }

  /**
   * Process edge data, queueing edges that reference missing nodes
   * @param edges The array of edges to process
   */
  private processEdgeData(edges: Edge[]): void {
    // Store edges in Map with generated IDs
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Processing ${edges.length || 0} edges. Current edge count: ${this.edges.size}`);
    }

    let edgesAdded = 0;
    let edgesBuffered = 0;
      
    edges.forEach((edge: Edge) => {
      // Validate that edge source and target are numeric IDs
      if (!edge.source || !edge.target || !/^\d+$/.test(edge.source) || !/^\d+$/.test(edge.target)) {
        logger.warn(`Invalid edge: source or target is not a valid numeric ID. Source: ${edge.source}, Target: ${edge.target}`);
        return;
      }

      const edgeId = this.createEdgeId(edge.source, edge.target);
      if (debugState.isDataDebugEnabled())
        logger.debug(`Processing edge: ${edge.source}->${edge.target} (ID: ${edgeId})`);

      // Check if this edge already exists
      if (this.edges.has(edgeId)) {
        // Edge already exists, just log and skip
        logger.debug(`Skipping duplicate edge ${edgeId}`);
        return;
      }
      
      // Check if source and target nodes exist
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
        // If graph is still loading, buffer this edge for later processing
        if (!this.graphDataComplete) {
          this.pendingEdges.push({ edge, retryCount: 0 });
          edgesBuffered++;
          
          if (debugState.isDataDebugEnabled()) {
            logger.debug(`Buffering edge ${edgeId} due to missing node(s). Source exists: ${this.nodes.has(edge.source)}, Target exists: ${this.nodes.has(edge.target)}`);
          }
        } else {
          // Graph is complete but nodes still missing - log error
          logger.warn(`Skipping edge ${edge.source}->${edge.target} due to missing node(s). Source exists: ${this.nodes.has(edge.source)}, Target exists: ${this.nodes.has(edge.target)}`);
        }
        return;
      }
      
      const edgeWithId: EdgeWithId = {
        ...edge,
        id: edgeId
      };
      this.edges.set(edgeId, edgeWithId);
      edgesAdded++;
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Added edge ${edgeId}: ${edge.source}->${edge.target}`);
      }
    });
    
    if (edgesAdded > 0 || edgesBuffered > 0) {
      logger.info(`Edge processing complete: ${edgesAdded} edges added, ${edgesBuffered} edges buffered. Total edges: ${this.edges.size}, Pending: ${this.pendingEdges.length}`);
    }
  }

  /**
   * Process any pending edges that were waiting for nodes to be loaded
   */
  private processPendingEdges(): void {
    if (this.pendingEdges.length === 0) return;

    logger.info(`Processing ${this.pendingEdges.length} pending edges`);
    
    // Track which edges we processed successfully
    const processedIndices: number[] = [];
    let edgesAdded = 0;

    // Try to process each pending edge
    this.pendingEdges.forEach((pendingEdge, index) => {
      const { edge, retryCount } = pendingEdge;
      const edgeId = this.createEdgeId(edge.source, edge.target);

      // Check if source and target nodes now exist
      if (this.nodes.has(edge.source) && this.nodes.has(edge.target)) {
        // Both nodes exist, we can add the edge
        const edgeWithId: EdgeWithId = {
          ...edge,
          id: edgeId
        };
        this.edges.set(edgeId, edgeWithId);
        processedIndices.push(index);
        edgesAdded++;
        
        if (debugState.isDataDebugEnabled()) {
          logger.debug(`Added pending edge ${edgeId}: ${edge.source}->${edge.target} after ${retryCount} retries`);
        }
      } else if (retryCount >= 3 || this.graphDataComplete) {
        // We've retried too many times or the graph is complete, log and discard
        logger.warn(`Discarding pending edge ${edge.source}->${edge.target} after ${retryCount} retries. Source exists: ${this.nodes.has(edge.source)}, Target exists: ${this.nodes.has(edge.target)}`);
        processedIndices.push(index);
      } else {
        // Increment retry count
        pendingEdge.retryCount++;
      }
    });

    // Remove processed edges (in reverse order to maintain correct indices)
    processedIndices.sort((a, b) => b - a).forEach(index => {
      this.pendingEdges.splice(index, 1);
    });

    if (edgesAdded > 0) {
      logger.info(`Processed ${edgesAdded} pending edges. ${this.pendingEdges.length} still pending.`);
      this.notifyUpdateListeners();
    }
  }

  /**
   * Receive a graph complete signal from the server
   */
  public signalGraphComplete(): void {
    logger.info("Received graph complete signal from server");
    this.graphDataComplete = true;
    this.processPendingEdges();
    // Notify listeners
    this.notifyUpdateListeners();
  }

  /**
   * Get the current graph data
   */
  getGraphData(): GraphData {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()) as Edge[],
      metadata: this.metadata
    };
  }

  /**
   * Get a specific node by ID
   * Strictly uses the primary node ID (numeric ID)
   */
  getNode(id: string): Node | undefined {    
    return this.nodes.get(id);
  }

  /**
   * Get the metadata ID (filename) for a node
   */
  getNodeMetadataId(id: string): string | undefined {
    return this.nodeIdToMetadataId.get(id);
  }

  /**
   * Subscribe to graph data updates
   */
  subscribe(listener: (data: GraphData) => void): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to position updates only
   */
  subscribeToPositionUpdates(
    listener: (positions: Float32Array) => void
  ): () => void {
    this.positionUpdateListeners.add(listener);
    return () => {
      this.positionUpdateListeners.delete(listener);
    };
  }

  /**
   * Clear all graph data
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.metadata = {};
    this.notifyUpdateListeners();
  }

  private createEdgeId(source: string, target: string): string {
    return [source, target].sort().join('_');
  }

  private notifyUpdateListeners(): void {
    const data = this.getGraphData();
    this.updateListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error('Error in graph update listener:', error);
      }
    });
  }

  private notifyPositionUpdateListeners(positions: Float32Array): void {
    this.positionUpdateListeners.forEach(listener => {
      try {
        listener(positions);
      } catch (error) {
        logger.error('Error in position update listener:', error);
      }
    });
  }

  public updateNodePositions(positions: Float32Array): void {
    if (!this.binaryUpdatesEnabled) {
      return;
    }

    // Throttle position updates to prevent overwhelming the system
    const now = Date.now();
    if (now - lastPositionUpdateTime < POSITION_UPDATE_THROTTLE_MS) {
      // Too soon for another update, just mark we have pending updates
      return;
    }
    
    lastPositionUpdateTime = now;
    
    const nodeCount = positions.length / FLOATS_PER_NODE;
    if (positions.length % FLOATS_PER_NODE !== 0) {
      logger.warn('Invalid position array length:', positions.length);
      return;
    }

    // Buffer the updates
    for (let i = 0; i < nodeCount; i++) {
      const offset = i * FLOATS_PER_NODE;
      
      try {
        // In our binary format, the node ID is just the index
        // We'll convert it to a string since our node map uses string keys
        const nodeId = i.toString();
        
        // Skip if we don't have this node
        if (!this.nodes.has(nodeId)) {
          continue;
        }

        // Create proper THREE.Vector3 object for the position
        const nodePosition = new Vector3(
          positions[offset],
          positions[offset + 1],
          positions[offset + 2]
        );

        // Only update if the position changed significantly
        const existingNode = this.nodes.get(nodeId);
        
        // CRITICAL FIX: Don't apply deadband filtering on server physics updates
        // Always accept position updates from the server's physics simulation
        if (existingNode) {
            this.positionUpdateBuffer.set(nodeId, nodePosition);
        }
      } catch (error) {
        logger.warn(`Error processing position for node index ${i}:`, error);
      }

    }

    // Schedule buffer flush if not already scheduled
    if (!this.updateBufferTimeout) {
      this.updateBufferTimeout = window.setTimeout(() => {
        this.flushPositionUpdates();
        this.updateBufferTimeout = null;
      }, GraphDataManager.BUFFER_FLUSH_INTERVAL);
    }
  }

  private flushPositionUpdates(): void {
    if (this.positionUpdateBuffer.size === 0) return;

    // Make sure we're working with proper THREE.Vector3 objects for data flow
    const updates = Array.from(this.positionUpdateBuffer.entries())
      .map(([id, position]) => ({
        id,
        data: { 
          position, // This is now a THREE.Vector3 object
          velocity: undefined 
        }
      }));

    // Convert node updates to Float32Array for binary protocol
    const nodesCount = updates.length;
    const positionsArray = new Float32Array(nodesCount * FLOATS_PER_NODE);
    
    updates.forEach((node, index) => {
      const baseIndex = index * FLOATS_PER_NODE;
      // Position (x, y, z)
      // Access x, y, z properties from the THREE.Vector3 object
      positionsArray[baseIndex] = node.data.position.x;
      positionsArray[baseIndex + 1] = node.data.position.y;
      positionsArray[baseIndex + 2] = node.data.position.z;
      // Velocity (set to 0 since undefined)
      positionsArray[baseIndex + 3] = positionsArray[baseIndex + 4] = positionsArray[baseIndex + 5] = 0;
    });
    this.notifyPositionUpdateListeners(positionsArray);
    this.positionUpdateBuffer.clear();
  }
}

// Export a singleton instance
export const graphDataManager = GraphDataManager.getInstance();

// Declare WebSocket on window for TypeScript
declare global {
  interface Window {
    ws: WebSocket;
  }
}
