import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
import { WebSocketAdapter } from '../services/websocket-service';

const logger = createLogger('GraphDataManager');

export interface Node {
  id: string;
  label: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  metadata?: Record<string, any>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  metadata?: Record<string, any>;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

type GraphDataChangeListener = (data: GraphData) => void;
type PositionUpdateListener = (positions: Float32Array) => void;

class GraphDataManager {
  private static instance: GraphDataManager;
  private data: GraphData = { nodes: [], edges: [] };
  private binaryUpdatesEnabled: boolean = false;
  private webSocketService: WebSocketAdapter | null = null;
  private graphDataListeners: GraphDataChangeListener[] = [];
  private positionUpdateListeners: PositionUpdateListener[] = [];
  private lastBinaryUpdateTime: number = 0;
  private retryTimeout: number | null = null;
  private nodePositionBuffer: Float32Array | null = null;
  private nodeIdMap: Map<string, number> = new Map();
  private reverseNodeIdMap: Map<number, string> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): GraphDataManager {
    if (!GraphDataManager.instance) {
      GraphDataManager.instance = new GraphDataManager();
    }
    return GraphDataManager.instance;
  }

  // Set WebSocket service for sending binary updates
  public setWebSocketService(service: WebSocketAdapter): void {
    this.webSocketService = service;
    if (debugState.isDataDebugEnabled()) {
      logger.debug('WebSocket service set');
    }
  }

  // Fetch initial graph data from the API
  public async fetchInitialData(): Promise<GraphData> {
    try {
      if (debugState.isEnabled()) {
        logger.info('Fetching initial graph data');
      }

      const response = await fetch('/api/graph/data');
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      try {
        const data = await response.json();
        
        // Validate that the response has the expected structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid graph data format: data is not an object');
        }
        
        // Ensure nodes and edges exist, even if empty
        const validatedData = {
          nodes: Array.isArray(data.nodes) ? data.nodes : [],
          edges: Array.isArray(data.edges) ? data.edges : []
        };
        
        if (debugState.isEnabled()) {
          logger.info(`Received initial graph data: ${validatedData.nodes.length} nodes, ${validatedData.edges.length} edges`);
          if (validatedData.nodes.length > 0) {
            logger.debug(`Sample node: ${JSON.stringify(validatedData.nodes[0])}`);
          }
        }
        
        this.setGraphData(validatedData);
        
        if (debugState.isEnabled()) {
          logger.info(`Loaded initial graph data: ${this.data.nodes.length} nodes, ${this.data.edges.length} edges`);
        }
        
        return this.data;
      } catch (parseError) {
        throw new Error(`Failed to parse graph data: ${parseError}`);
      }
    } catch (error) {
      logger.error('Failed to fetch initial graph data:', createErrorMetadata(error));
      throw error;
    }
  }

  // Set graph data and notify listeners
  public setGraphData(data: GraphData): void {
    if (debugState.isEnabled()) {
      logger.info(`Setting graph data: ${data.nodes.length} nodes, ${data.edges.length} edges`);
    }

    // Ensure all nodes have valid positions before setting the data
    if (data && data.nodes) {
      const validatedNodes = data.nodes.map(node => this.ensureNodeHasValidPosition(node));
      this.data = {
        ...data,
        nodes: validatedNodes
      };
      
      if (debugState.isEnabled()) {
        logger.info(`Validated ${validatedNodes.length} nodes with positions`);
      }
    } else {
      // Initialize with empty arrays if data is invalid
      this.data = { nodes: [], edges: data?.edges || [] };
      logger.warn('Initialized with empty graph data');
    }
    
    // Reset ID maps
    this.nodeIdMap.clear();
    this.reverseNodeIdMap.clear();
    
    // Create mappings between string IDs and numeric IDs
    this.data.nodes.forEach((node, index) => {
      const numericId = parseInt(node.id, 10);
      if (!isNaN(numericId)) {
        // If the ID can be parsed as a number, use it directly
        this.nodeIdMap.set(node.id, numericId);
        this.reverseNodeIdMap.set(numericId, node.id);
      } else {
        // For non-numeric IDs, use the index + 1 as the numeric ID
        // We add 1 to avoid using 0 as an ID
        const mappedId = index + 1;
        this.nodeIdMap.set(node.id, mappedId);
        this.reverseNodeIdMap.set(mappedId, node.id);
      }
    });
    
    // Prepare buffer for binary updates
    this.prepareNodePositionBuffer();
    
    // Notify listeners
    this.notifyGraphDataListeners();
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Graph data updated: ${data.nodes.length} nodes, ${data.edges.length} edges`);
    }
  }

  // Prepare the binary buffer for position updates
  private prepareNodePositionBuffer(): void {
    if (!this.data.nodes || !this.data.nodes.length) {
      return;
    }
    
    // Each node has an x, y, z position (3 floats) plus its ID (1 float)
    const bufferSize = this.data.nodes.length * 4;
    this.nodePositionBuffer = new Float32Array(bufferSize);
    
    // Initialize buffer with current positions
    this.data.nodes.forEach((node, index) => {
      if (!node) {
        logger.warn(`Null or undefined node found at index ${index}, skipping`);
        return;
      }
      
      // Skip nodes without valid IDs
      if (!node.id) {
        logger.warn(`Node at index ${index} has no ID, skipping`);
        return;
      }
      
      // Ensure node has a valid position
      if (!node.position) {
        node.position = { x: 0, y: 0, z: 0 };
      }
      
      // Skip nodes without valid position data
      node.position.x = typeof node.position.x === 'number' ? node.position.x : 0;
      node.position.y = typeof node.position.y === 'number' ? node.position.y : 0;
      node.position.z = typeof node.position.z === 'number' ? node.position.z : 0;

      const baseIndex = index * 4;
      // Use the numeric ID from the map
      const numericId = this.nodeIdMap.get(node.id) || index + 1;
      this.nodePositionBuffer![baseIndex] = numericId;
      this.nodePositionBuffer![baseIndex + 1] = node.position.x || 0;
      this.nodePositionBuffer![baseIndex + 2] = node.position.y || 0;
      this.nodePositionBuffer![baseIndex + 3] = node.position.z || 0;
    });
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Prepared position buffer for ${this.data.nodes.length} nodes with ID mapping`);
    }
  }

  // Enable binary updates and start the retry mechanism
  public enableBinaryUpdates(): void {
    if (!this.webSocketService) {
      logger.warn('Cannot enable binary updates: WebSocket service not set');
      return;
    }

    // If WebSocket is already ready, enable binary updates immediately
    if (this.webSocketService.isReady()) {
      this.setBinaryUpdatesEnabled(true);
      return;
    }

    // Otherwise, start a retry mechanism
    if (this.retryTimeout) {
      window.clearTimeout(this.retryTimeout);
    }

    this.retryTimeout = window.setTimeout(() => {
      if (this.webSocketService && this.webSocketService.isReady()) {
        this.setBinaryUpdatesEnabled(true);
        if (debugState.isEnabled()) {
          logger.info('WebSocket ready, binary updates enabled');
        }
      } else {
        if (debugState.isEnabled()) {
          logger.info('WebSocket not ready yet, retrying...');
        }
        this.enableBinaryUpdates();
      }
    }, 500);
  }

  public setBinaryUpdatesEnabled(enabled: boolean): void {
    this.binaryUpdatesEnabled = enabled;
    
    if (enabled && !this.nodePositionBuffer) {
      this.prepareNodePositionBuffer();
    }
    
    if (debugState.isEnabled()) {
      logger.info(`Binary updates ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  // Get current graph data
  public getGraphData(): GraphData {
    return this.data;
  }

  // Add a node to the graph
  public addNode(node: Node): void {
    // Check if node with this ID already exists
    const existingIndex = this.data.nodes.findIndex(n => n.id === node.id);
    
    if (existingIndex >= 0) {
      // Update existing node
      this.data.nodes[existingIndex] = {
        ...this.data.nodes[existingIndex],
        ...node
      };
    } else {
      // Add new node
      this.data.nodes.push(node);
      
      // Resize position buffer if needed
      this.prepareNodePositionBuffer();
    }
    
    this.notifyGraphDataListeners();
  }

  // Add an edge to the graph
  public addEdge(edge: Edge): void {
    // Check if edge with this ID already exists
    const existingIndex = this.data.edges.findIndex(e => e.id === edge.id);
    
    if (existingIndex >= 0) {
      // Update existing edge
      this.data.edges[existingIndex] = {
        ...this.data.edges[existingIndex],
        ...edge
      };
    } else {
      // Add new edge
      this.data.edges.push(edge);
    }
    
    this.notifyGraphDataListeners();
  }

  // Remove a node from the graph
  public removeNode(nodeId: string): void {
    // Remove node
    this.data.nodes = this.data.nodes.filter(node => node.id !== nodeId);
    
    // Remove all edges connected to this node
    this.data.edges = this.data.edges.filter(
      edge => edge.source !== nodeId && edge.target !== nodeId
    );
    
    // Prepare new buffer for binary updates
    this.prepareNodePositionBuffer();
    
    this.notifyGraphDataListeners();
  }

  // Remove an edge from the graph
  public removeEdge(edgeId: string): void {
    this.data.edges = this.data.edges.filter(edge => edge.id !== edgeId);
    this.notifyGraphDataListeners();
  }

  // Update node positions from binary data
  public updateNodePositions(positionData: ArrayBuffer): void {
    if (!positionData || positionData.byteLength === 0) {
      return;
    }

    // Check if this is a duplicate update (can happen with WebSocket)
    const now = Date.now();
    if (now - this.lastBinaryUpdateTime < 16) { // Less than 16ms (60fps)
      if (debugState.isDataDebugEnabled()) {
        logger.debug('Skipping duplicate position update');
      }
      return;
    }
    this.lastBinaryUpdateTime = now;

    // Convert ArrayBuffer to DataView for reading binary data
    const view = new DataView(positionData);
    const numNodes = positionData.byteLength / 26; // 26 bytes per node

    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Processing ${numNodes} node updates from binary data`);
    }

    // Process position data (26 bytes per node)
    for (let i = 0; i < numNodes; i++) {
      const offset = i * 26;
      
      // Read node ID (uint16, 2 bytes)
      const numericId = view.getUint16(offset, true);
      
      // Read position (3 float32 values, 12 bytes)
      const x = view.getFloat32(offset + 2, true);
      const y = view.getFloat32(offset + 6, true);
      const z = view.getFloat32(offset + 10, true);

      // Read velocity (3 float32 values, 12 bytes)
      const vx = view.getFloat32(offset + 14, true);
      const vy = view.getFloat32(offset + 18, true);
      const vz = view.getFloat32(offset + 22, true);

      // Convert numeric ID back to string ID using the reverse map
      const nodeId = this.reverseNodeIdMap.get(numericId);
      
      if (nodeId) {
        // Find and update the node
        const nodeIndex = this.data.nodes.findIndex(node => node.id === nodeId);
        if (nodeIndex >= 0) {
          this.data.nodes[nodeIndex].position = { x, y, z };
          // Store velocity in metadata if needed
          this.data.nodes[nodeIndex].metadata = {
            ...this.data.nodes[nodeIndex].metadata,
            velocity: { x: vx, y: vy, z: vz }
          };
        }
      }
    }

    // Create Float32Array for position updates (4 values per node: id, x, y, z)
    const positionArray = new Float32Array(numNodes * 4);
    for (let i = 0; i < numNodes; i++) {
      const offset = i * 26;
      const numericId = view.getUint16(offset, true);
      const x = view.getFloat32(offset + 2, true);
      const y = view.getFloat32(offset + 6, true);
      const z = view.getFloat32(offset + 10, true);

      const arrayOffset = i * 4;
      positionArray[arrayOffset] = numericId;
      positionArray[arrayOffset + 1] = x;
      positionArray[arrayOffset + 2] = y;
      positionArray[arrayOffset + 3] = z;
    }

    // Notify position update listeners with the Float32Array
    this.notifyPositionUpdateListeners(positionArray);
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Updated ${numNodes} node positions`);
    }
  }

  // Send node positions to the server via WebSocket
  public sendNodePositions(): void {
    if (!this.binaryUpdatesEnabled || !this.webSocketService || !this.nodePositionBuffer) {
      return;
    }

    // Update the buffer with current positions
    this.data.nodes.forEach((node, index) => {     
      if (!node) {
        logger.warn(`Null or undefined node found at index ${index}, skipping`);
        return;
      }
      
      // Skip nodes without valid IDs
      if (!node.id) {
        logger.warn(`Node at index ${index} has no ID, skipping`);
        return;
      }
      
      // Ensure node has a valid position
      this.ensureNodeHasValidPosition(node);

      const baseIndex = index * 4;
      const numericId = this.nodeIdMap.get(node.id) || index + 1;
      this.nodePositionBuffer![baseIndex] = numericId;
      this.nodePositionBuffer![baseIndex + 1] = node.position.x || 0;
      this.nodePositionBuffer![baseIndex + 2] = node.position.y || 0;
      this.nodePositionBuffer![baseIndex + 3] = node.position.z || 0;
    });

    try {
      // Send the buffer via WebSocket
      this.webSocketService.send(this.nodePositionBuffer.buffer);
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Sent positions for ${this.data.nodes.length} nodes with ID mapping`);
      }
    } catch (error) {
      logger.error('Error sending node positions:', createErrorMetadata(error));
    }
  }

  // Add listener for graph data changes
  public onGraphDataChange(listener: GraphDataChangeListener): () => void {
    this.graphDataListeners.push(listener);
    
    // Call immediately with current data
    listener(this.data);
    
    // Return unsubscribe function
    return () => {
      this.graphDataListeners = this.graphDataListeners.filter(l => l !== listener);
    };
  }

  // Add listener for position updates
  public onPositionUpdate(listener: PositionUpdateListener): () => void {
    this.positionUpdateListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      this.positionUpdateListeners = this.positionUpdateListeners.filter(l => l !== listener);
    };
  }

  // Notify all graph data listeners
  private notifyGraphDataListeners(): void {
    this.graphDataListeners.forEach(listener => {
      try {
        listener(this.data);
      } catch (error) {
        logger.error('Error in graph data listener:', createErrorMetadata(error));
      }
    });
  }

  // Notify all position update listeners
  private notifyPositionUpdateListeners(positions: Float32Array): void {
    this.positionUpdateListeners.forEach(listener => {
      try {
        listener(positions);
      } catch (error) {
        logger.error('Error in position update listener:', createErrorMetadata(error));
      }
    });
  }

  // Initialize a node with default position if needed
  public ensureNodeHasValidPosition(node: Node): Node {
    if (!node.position) {
      // Provide a default position if none exists
      return {
        ...node,
        position: { x: 0, y: 0, z: 0 }
      };
    } else if (typeof node.position.x !== 'number' || 
               typeof node.position.y !== 'number' || 
               typeof node.position.z !== 'number') {
      // Fix any NaN or undefined coordinates
      node.position.x = typeof node.position.x === 'number' ? node.position.x : 0;
      node.position.y = typeof node.position.y === 'number' ? node.position.y : 0;
      node.position.z = typeof node.position.z === 'number' ? node.position.z : 0;
    }
    return node;
  }

  // Clean up resources
  public dispose(): void {
    if (this.retryTimeout) {
      window.clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    this.graphDataListeners = [];
    this.positionUpdateListeners = [];
    this.webSocketService = null;
    this.nodePositionBuffer = null;
    
    if (debugState.isEnabled()) {
      logger.info('GraphDataManager disposed');
    }
  }
}

// Create singleton instance
export const graphDataManager = GraphDataManager.getInstance();