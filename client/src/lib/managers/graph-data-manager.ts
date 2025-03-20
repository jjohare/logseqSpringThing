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

      const response = await fetch('/api/graph');
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      this.setGraphData(data);
      
      if (debugState.isEnabled()) {
        logger.info(`Loaded initial graph data: ${this.data.nodes.length} nodes, ${this.data.edges.length} edges`);
      }
      
      return this.data;
    } catch (error) {
      logger.error('Failed to fetch initial graph data:', createErrorMetadata(error));
      throw error;
    }
  }

  // Set graph data and notify listeners
  public setGraphData(data: GraphData): void {
    this.data = data;
    
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
    if (!this.data.nodes.length) {
      return;
    }
    
    // Each node has an x, y, z position (3 floats) plus its ID (1 float)
    const bufferSize = this.data.nodes.length * 4;
    this.nodePositionBuffer = new Float32Array(bufferSize);
    
    // Initialize buffer with current positions
    this.data.nodes.forEach((node, index) => {
      const baseIndex = index * 4;
      // Use the numeric ID from the map
      const numericId = this.nodeIdMap.get(node.id) || index + 1;
      this.nodePositionBuffer![baseIndex] = numericId;
      this.nodePositionBuffer![baseIndex + 1] = node.position.x;
      this.nodePositionBuffer![baseIndex + 2] = node.position.y;
      this.nodePositionBuffer![baseIndex + 3] = node.position.z;
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
  public updateNodePositions(positionData: Float32Array): void {
    if (!positionData || positionData.length === 0) {
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

    // Process position data (4 values per node: id, x, y, z)
    for (let i = 0; i < positionData.length; i += 4) {
      const numericId = positionData[i];
      const x = positionData[i + 1];
      const y = positionData[i + 2];
      const z = positionData[i + 3];

      // Convert numeric ID back to string ID using the reverse map
      const nodeId = this.reverseNodeIdMap.get(numericId);
      
      if (nodeId) {
        // Find and update the node
        const nodeIndex = this.data.nodes.findIndex(node => node.id === nodeId);
        if (nodeIndex >= 0) {
          this.data.nodes[nodeIndex].position = { x, y, z };
        }
      }
    }

    // Notify position update listeners
    this.notifyPositionUpdateListeners(positionData);
    
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Updated ${positionData.length / 4} node positions`);
    }
  }

  // Send node positions to the server via WebSocket
  public sendNodePositions(): void {
    if (!this.binaryUpdatesEnabled || !this.webSocketService || !this.nodePositionBuffer) {
      return;
    }

    // Update the buffer with current positions
    this.data.nodes.forEach((node, index) => {
      const baseIndex = index * 4;
      const numericId = this.nodeIdMap.get(node.id) || index + 1;
      this.nodePositionBuffer![baseIndex] = numericId;
      this.nodePositionBuffer![baseIndex + 1] = node.position.x;
      this.nodePositionBuffer![baseIndex + 2] = node.position.y;
      this.nodePositionBuffer![baseIndex + 3] = node.position.z;
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