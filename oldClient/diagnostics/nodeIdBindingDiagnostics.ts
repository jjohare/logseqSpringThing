/**
 * Node ID Binding Diagnostics
 * 
 * This tool helps diagnose issues related to node ID binding between
 * the binary WebSocket protocol and metadata visualization.
 */

import { createLogger } from '../core/logger';
import { WebSocketService } from '../websocket/websocketService';
import { GraphDataManager } from '../state/graphData';
import { debugState } from '../core/debugState';
import { Node } from '../core/types';

const logger = createLogger('NodeBindingDiagnostics');

/**
 * NodeBindingDiagnostics
 * 
 * This class provides diagnostics for node ID binding issues
 * - Validates ID consistency across different components
 * - Detects mismatches between binary protocol and metadata
 * - Provides debugging suggestions for ID binding problems
 */
export class NodeBindingDiagnostics {
    private static instance: NodeBindingDiagnostics | null = null;
    
    private constructor() {
        // Private constructor for singleton pattern
    }
    
    public static getInstance(): NodeBindingDiagnostics {
        if (!NodeBindingDiagnostics.instance) {
            NodeBindingDiagnostics.instance = new NodeBindingDiagnostics();
        }
        return NodeBindingDiagnostics.instance;
    }
    
    /**
     * Run comprehensive checks on node ID binding
     * This is the main entry point for diagnostics
     */
    public runDiagnostics(): void {
        logger.info('Starting node ID binding diagnostics...');
        
        try {
            // Check graph data node IDs
            this.checkGraphDataNodeIds();
            
            // Check WebSocket node mapping
            this.checkWebSocketNodeMapping();
            
            // Check metadata binding
            this.checkMetadataBinding();
            
            // Check for suspicious ID formats
            this.checkForSuspiciousIdFormats();
            
            logger.info('Node ID binding diagnostics completed successfully');
        } catch (error) {
            logger.error('Error running node ID binding diagnostics', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    
    /**
     * Check for consistency in graph data node IDs
     */
    private checkGraphDataNodeIds(): void {
        const graphData = GraphDataManager.getInstance().getGraphData();
        
        if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
            logger.warn('No graph data available for node ID check');
            return;
        }
        
        // Check for node ID consistency
        const { numericIdCount, nonNumericIdCount, suspiciousIds } = this.analyzeNodeIds(graphData.nodes);
        
        logger.info('Graph data node ID analysis:', {
            totalNodes: graphData.nodes.length,
            numericIdCount,
            nonNumericIdCount,
            suspiciousIdsCount: suspiciousIds.length,
            suspiciousIdsSample: suspiciousIds.slice(0, 5)
        });
        
        if (nonNumericIdCount > 0) {
            logger.warn(`Found ${nonNumericIdCount} nodes with non-numeric IDs. This may cause binding issues with the binary protocol.`);
        }
    }
    
    /**
     * Check WebSocket service node mapping
     */
    private checkWebSocketNodeMapping(): void {
        const wsService = WebSocketService.getInstance();
        
        // Access private field via a type assertion hack (for diagnostic purposes only)
        const service = wsService as any;
        if (!service.nodeNameToIndexMap) {
            logger.warn('Unable to access WebSocket node mapping');
            return;
        }
        
        const mapping = service.nodeNameToIndexMap as Map<string, number>;
        
        logger.info('WebSocket node mapping analysis:', {
            mappingSize: mapping.size,
            sampleEntries: Array.from(mapping.entries()).slice(0, 5)
        });
        
        // Check for suspicious mappings (non-numeric string to numeric index)
        const suspiciousMappings = Array.from(mapping.entries())
            .filter(([key]) => !/^\d+$/.test(key))
            .slice(0, 10);
            
        if (suspiciousMappings.length > 0) {
            logger.warn('Found suspicious node ID mappings in WebSocket service:', {
                count: suspiciousMappings.length,
                examples: suspiciousMappings
            });
            
            logger.info('RECOMMENDATION: These non-numeric IDs should be converted to numeric IDs for proper binding with the binary protocol.');
        }
    }
    
    /**
     * Check metadata binding to nodes
     */
    private checkMetadataBinding(): void {
        // This requires accessing the DOM to find all metadata labels
        // For browser context only
        if (typeof document === 'undefined') {
            logger.warn('Cannot check metadata binding outside browser context');
            return;
        }
        
        try {
            // Find metadata label groups in the scene
            // This is a heuristic approach that may need adjustment for your specific scene structure
            const metadataElements = Array.from(document.querySelectorAll('[data-metadata-node-id]'));
            
            if (metadataElements.length === 0) {
                logger.warn('No metadata labels found in DOM');
                return;
            }
            
            // Check node IDs in metadata
            const metadataNodeIds = metadataElements.map(el => el.getAttribute('data-metadata-node-id'));
            const graphData = GraphDataManager.getInstance().getGraphData();
            
            const matchingIds = metadataNodeIds.filter(id => 
                graphData.nodes.some(node => node.id === id)
            );
            
            logger.info('Metadata binding analysis:', {
                totalMetadataElements: metadataElements.length,
                matchingWithGraphData: matchingIds.length,
                mismatchCount: metadataElements.length - matchingIds.length
            });
            
            if (matchingIds.length < metadataElements.length) {
                logger.warn('Some metadata labels are not properly bound to graph nodes!', {
                    boundCount: matchingIds.length,
                    unboundCount: metadataElements.length - matchingIds.length
                });
            }
        } catch (error) {
            logger.error('Error checking metadata binding', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    
    /**
     * Check for suspicious node ID formats
     */
    private checkForSuspiciousIdFormats(): void {
        const graphData = GraphDataManager.getInstance().getGraphData();
        
        if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
            return;
        }
        
        // Check for inconsistent ID types (mixed string/numeric)
        const idTypes = new Set<string>();
        graphData.nodes.forEach(node => {
            // Determine ID type
            let type = 'unknown';
            if (typeof node.id === 'string') {
                if (/^\d+$/.test(node.id)) {
                    type = 'numeric-string';
                } else if (node.id.includes('.')) {
                    type = 'possible-filename';
                } else {
                    type = 'non-numeric-string';
                }
            } else if (typeof node.id === 'number') {
                type = 'number';
            }
            
            idTypes.add(type);
        });
        
        logger.info('Node ID type analysis:', {
            typesFound: Array.from(idTypes)
        });
        
        if (idTypes.size > 1) {
            logger.warn('Multiple ID types detected in node data. This could indicate inconsistency in ID handling.');
        }
        
        // Check if IDs match their string representation
        // This is to detect issues where IDs might be mistakenly cast between string and number
        const idMismatchCount = graphData.nodes
            .filter(node => node.id !== String(node.id))
            .length;
            
        if (idMismatchCount > 0) {
            logger.warn(`Found ${idMismatchCount} nodes where ID doesn't match its string representation. This could indicate a type conversion issue.`);
        }
    }
    
    /**
     * Analyze node IDs to detect patterns and potential issues
     * @param nodes Array of nodes to analyze
     */
    private analyzeNodeIds(nodes: Node[]): { 
        numericIdCount: number, 
        nonNumericIdCount: number,
        suspiciousIds: string[]
    } {
        let numericIdCount = 0;
        let nonNumericIdCount = 0;
        const suspiciousIds: string[] = [];
        
        nodes.forEach(node => {
            const id = node.id;
            
            // Check if ID is numeric string
            if (typeof id === 'string' && /^\d+$/.test(id)) {
                numericIdCount++;
            } else {
                nonNumericIdCount++;
                suspiciousIds.push(String(id));
            }
            
            // Check for suspicious patterns
            if (typeof id === 'string') {
                // Check for file extension in ID (often a sign of metadata_id being used incorrectly as id)
                if (id.includes('.md') || id.includes('.js') || id.includes('.ts')) {
                    suspiciousIds.push(id);
                }
                
                // Check for very long IDs (unusual for numeric IDs)
                if (id.length > 10) {
                    suspiciousIds.push(id);
                }
            }
        });
        
        return { numericIdCount, nonNumericIdCount, suspiciousIds };
    }
    
    /**
     * Enable diagnostic mode for monitoring ID binding issues in real-time
     */
    public enableMonitoring(): void {
        // Set up monitoring of node position updates
        logger.info('Enabling real-time node ID binding monitoring');
        
        // Log guidance for enabling relevant debug flags
        logger.info('To see detailed node binding logs, please ensure the following debug flags are enabled:');
        logger.info('- Node debugging: ' + (debugState.isNodeDebugEnabled() ? 'ENABLED' : 'DISABLED'));
        logger.info('- Data debugging: ' + (debugState.isDataDebugEnabled() ? 'ENABLED' : 'DISABLED'));
        logger.info('- WebSocket debugging: ' + (debugState.isWebsocketDebugEnabled() ? 'ENABLED' : 'DISABLED'));
        
        if (!debugState.isNodeDebugEnabled() || !debugState.isDataDebugEnabled()) {
            logger.info('NOTE: Enable all debug modes in application settings or console for full diagnostics');
        }
        
        logger.info('Node ID binding monitoring enabled. Check console for detailed logs.');
    }
    
    /**
     * Provide recommendations based on diagnostic results
     */
    public getRecommendations(): string[] {
        return [
            'Ensure all node IDs in graph data are numeric strings matching the binary protocol',
            'Verify WebSocketService correctly converts binary u16 IDs to strings',
            'Check that MetadataVisualizer uses the same node IDs as position updates',
            'Review NodeInstanceManager to confirm it uses the same IDs as other components',
            'Add explicit validation for node ID formats during critical operations',
            'Consider adding assertions to verify ID consistency between components'
        ];
    }
}

// Make diagnostics available on window for console access
if (typeof window !== 'undefined') {
    (window as any).NodeBindingDiagnostics = NodeBindingDiagnostics.getInstance();
}

export default NodeBindingDiagnostics.getInstance();