import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
import { WebSocketAdapter } from '../services/websocket-service';
import { BinaryNodeData, parseBinaryNodeData, createBinaryNodeData, Vec3, BINARY_NODE_SIZE } from '../types/binary-protocol';

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
    
    // Set up nodes and validate their positions
    this.setupNodesAndMapping();
    
    // Notify listeners
    this.notifyGraphDataListeners();
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Graph data updated: ${data.nodes.length} nodes, ${data.edges.length} edges`);
    }
  }

  // Setup node IDs and validate positions
  private setupNodesAndMapping(): void {
    if (!this.data.nodes || !this.data.nodes.length) {
      return;
    }
    
    // Process each node to ensure valid positions and create ID mappings
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
      
      // Ensure all position values are numbers
      node.position.x = typeof node.position.x === 'number' ? node.position.x : 0;
      node.position.y = typeof node.position.y === 'number' ? node.position.y : 0;
      node.position.z = typeof node.position.z === 'number' ? node.position.z : 0;

      // Use the numeric ID from the map
      const numericId = this.nodeIdMap.get(node.id) || index + 1;
      
      if (debugState.isDataDebugEnabled() && index < 5) {
        // Log a sample of node data for debugging (just the first few nodes)
        logger.debug(`Node ${node.id} (numeric ID: ${numericId}) at position [${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)}]`);
      }
    });
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Prepared ${this.data.nodes.length} nodes with ID mapping`);
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
    
    if (enabled) {
      this.setupNodesAndMapping();
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
      
      // Update node mappings
      const numericId = parseInt(node.id, 10);
      if (!isNaN(numericId)) {
        this.nodeIdMap.set(node.id, numericId);
        this.reverseNodeIdMap.set(numericId, node.id);
      } else {
        const mappedId = this.data.nodes.length;
        this.nodeIdMap.set(node.id, mappedId);
        this.reverseNodeIdMap.set(mappedId, node.id);
      }
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
    // Get numeric ID before removing the node
    const numericId = this.nodeIdMap.get(nodeId);
    
    // Remove node
    this.data.nodes = this.data.nodes.filter(node => node.id !== nodeId);
    
    // Remove all edges connected to this node
    this.data.edges = this.data.edges.filter(
      edge => edge.source !== nodeId && edge.target !== nodeId
    );
    
    // Remove from ID maps
    if (numericId !== undefined) {
      this.nodeIdMap.delete(nodeId);
      this.reverseNodeIdMap.delete(numericId);
    }
    
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

    try {
      // Add diagnostic information about the received data
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Received binary data: ${positionData.byteLength} bytes`);
        
        // Check if data length is a multiple of our expected node size
        const remainder = positionData.byteLength % BINARY_NODE_SIZE;
        if (remainder !== 0) {
          logger.warn(`Binary data size (${positionData.byteLength} bytes) is not a multiple of ${BINARY_NODE_SIZE}. Remainder: ${remainder} bytes`);
        }
      }
      
      // Parse binary data using our standardized binary protocol parser
      const nodeUpdates = parseBinaryNodeData(positionData);
      
      if (nodeUpdates.length === 0) {
        logger.warn(`No valid node updates parsed from ${positionData.byteLength} bytes of binary data`);
        return;
      }
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Processing ${nodeUpdates.length} node updates from binary data`);
      }

      // Create Float32Array for position updates (4 values per node: id, x, y, z)
      // This format is expected by the GraphManager component
      const positionArray = new Float32Array(nodeUpdates.length * 4);
      let updatedNodes = 0;
      
      // Process each node update
      nodeUpdates.forEach((nodeUpdate, index) => {
        const { nodeId, position, velocity } = nodeUpdate;
        
        // Convert numeric ID back to string ID using the reverse map
        const stringNodeId = this.reverseNodeIdMap.get(nodeId);
        
        if (stringNodeId) {
          // Find and update the node
          const nodeIndex = this.data.nodes.findIndex(node => node.id === stringNodeId);
          if (nodeIndex >= 0) {
            this.data.nodes[nodeIndex].position = position;
            // Store velocity in metadata if needed
            this.data.nodes[nodeIndex].metadata = {
              ...this.data.nodes[nodeIndex].metadata,
              velocity
            };
            updatedNodes++;
          } else if (debugState.isDataDebugEnabled()) {
            logger.debug(`Node with ID ${stringNodeId} (numeric: ${nodeId}) not found in data`);
          }
        } else if (debugState.isDataDebugEnabled()) {
          logger.debug(`No string ID mapping found for numeric ID ${nodeId}`);
        }
        
        // Update the position array for rendering (4 values per node: id, x, y, z)
        const arrayOffset = index * 4;
        positionArray[arrayOffset] = nodeId;
        positionArray[arrayOffset + 1] = position.x;
        positionArray[arrayOffset + 2] = position.y;
        positionArray[arrayOffset + 3] = position.z;
      });

      // Notify position update listeners with the Float32Array
      this.notifyPositionUpdateListeners(positionArray);
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Updated positions for ${updatedNodes} out of ${nodeUpdates.length} nodes (${this.data.nodes.length} total nodes in graph)`);
      }
    } catch (error) {
      logger.error('Error processing binary position data:', createErrorMetadata(error));
      
      // Add additional diagnostic information
      if (debugState.isEnabled()) {
        try {
          // Try to display the first few bytes for debugging
          const view = new DataView(positionData);
          const byteArray = [];
          const maxBytesToShow = Math.min(64, positionData.byteLength);
          
          for (let i = 0; i < maxBytesToShow; i++) {
            byteArray.push(view.getUint8(i).toString(16).padStart(2, '0'));
          }
          
          logger.debug(`First ${maxBytesToShow} bytes of binary data: ${byteArray.join(' ')}${positionData.byteLength > maxBytesToShow ? '...' : ''}`);
        } catch (e) {
          logger.debug('Could not display binary data preview:', e);
        }
      }
    }
  }

  // Send node positions to the server via WebSocket
  public sendNodePositions(): void {
    if (!this.binaryUpdatesEnabled || !this.webSocketService) {
      return;
    }

    try {
      // Create binary node data array in the format expected by the server
      const binaryNodes: BinaryNodeData[] = this.data.nodes
        .filter(node => node && node.id) // Filter out invalid nodes
        .map(node => {
          // Ensure node has a valid position
          this.ensureNodeHasValidPosition(node);
          
          // Get numeric ID from map or create a new one
          const numericId = this.nodeIdMap.get(node.id) || 0;
          if (numericId === 0) {
            logger.warn(`No numeric ID found for node ${node.id}, skipping`);
            return null;
          }
          
          // Get velocity from metadata or default to zero
          const velocity: Vec3 = (node.metadata?.velocity as Vec3) || { x: 0, y: 0, z: 0 };
          
          return {
            nodeId: numericId,
            position: {
              x: node.position.x || 0,
              y: node.position.y || 0,
              z: node.position.z || 0
            },
            velocity
          };
        })
        .filter((node): node is BinaryNodeData => node !== null);

      // Create binary buffer using our protocol encoder
      const buffer = createBinaryNodeData(binaryNodes);
      
      // Send the buffer via WebSocket
      this.webSocketService.send(buffer);
      
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Sent positions for ${binaryNodes.length} nodes using binary protocol`);
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
    this.nodeIdMap.clear();
    this.reverseNodeIdMap.clear();
    
    if (debugState.isEnabled()) {
      logger.info('GraphDataManager disposed');
    }
  }
}

// Create singleton instance
export const graphDataManager = GraphDataManager.getInstance();