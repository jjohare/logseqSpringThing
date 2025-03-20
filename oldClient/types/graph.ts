import { Vector3 } from 'three';

/**
 * Represents a node in the graph visualization
 */
export interface GraphNode {
    /** Unique identifier for the node */
    id: string | number;
    
    /** Current position in 3D space */
    position: Vector3;
    
    /** Current velocity vector */
    velocity?: Vector3;
    
    /** Optional metadata */
    metadata?: {
        [key: string]: any;
    };
}

/**
 * Represents an edge connecting two nodes
 */
export interface GraphEdge {
    /** Unique identifier for the edge */
    id: string | number;
    
    /** Source node ID */
    source: string | number;
    
    /** Target node ID */
    target: string | number;
    
    /** Optional weight/strength of connection */
    weight?: number;
    
    /** Optional metadata */
    metadata?: {
        [key: string]: any;
    };
}

/**
 * Graph update event types
 */
export enum GraphUpdateType {
    NodeAdded = 'node_added',
    NodeRemoved = 'node_removed',
    NodeUpdated = 'node_updated',
    EdgeAdded = 'edge_added',
    EdgeRemoved = 'edge_removed',
    EdgeUpdated = 'edge_updated'
}

/**
 * Graph update event payload
 */
export interface GraphUpdateEvent {
    type: GraphUpdateType;
    data: GraphNode | GraphEdge;
}