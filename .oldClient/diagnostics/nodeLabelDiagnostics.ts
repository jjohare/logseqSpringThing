import { NodeIdentityManager } from '../rendering/node/identity/NodeIdentityManager';
import { createLogger, createDataMetadata, createErrorMetadata } from '../core/logger';

const logger = createLogger('NodeLabelDiagnostics');

/**
 * NodeLabelDiagnostics provides tools for debugging label issues
 * in the node visualization system.
 * 
 * It can be used to:
 * 1. Detect and log duplicate labels
 * 2. Verify label resolution consistency
 * 3. Test integration of the NodeIdentityManager
 */
export class NodeLabelDiagnostics {
    private identityManager: NodeIdentityManager;
    
    constructor() {
        this.identityManager = NodeIdentityManager.getInstance();
        logger.info('NodeLabelDiagnostics initialized');
    }
    
    /**
     * Run a diagnostic test on sample data to verify duplicate detection
     */
    public runDuplicateLabelTest(): void {
        logger.info('Running duplicate label detection test');
        
        // Create sample test data with known duplicates
        const testNodes = [
            { id: '1', data: { metadata: { name: 'Test Node' } } },
            { id: '2', data: { metadata: { name: 'Test Node' } } }, // Duplicate!
            { id: '3', data: { metadata: { name: 'Unique Node 1' } } },
            { id: '4', data: { metadata: { name: 'Unique Node 2' } } },
            { id: '5', data: { metadata: { name: 'Another Test' } } },
            { id: '6', data: { metadata: { name: 'Another Test' } } }, // Duplicate!
        ];
        
        // Run the test
        this.identityManager.processNodes(testNodes);
        
        // Verify results
        const duplicates = this.identityManager.getDuplicateLabels();
        
        logger.info(`Duplicate test results: Found ${duplicates.size} duplicate labels`, 
            createDataMetadata({ duplicateCount: duplicates.size }));
            
        duplicates.forEach((nodeIds, label) => {
            logger.info(`Duplicate label "${label}" used by ${nodeIds.length} nodes: ${nodeIds.join(', ')}`);
        });
        
        // Validate expected behavior
        const expectedDuplicates = 2; // "Test Node" and "Another Test"
        if (duplicates.size === expectedDuplicates) {
            logger.info('✅ Duplicate detection test PASSED');
        } else {
            logger.warn(`❌ Duplicate detection test FAILED: Expected ${expectedDuplicates} duplicates, found ${duplicates.size}`);
        }
    }
    
    /**
     * Analyze a real dataset by processing a snapshot of actual nodes
     */
    public analyzeRealData(nodes: any[]): void {
        if (!nodes || nodes.length === 0) {
            logger.warn('No nodes provided for analysis');
            return;
        }
        
        logger.info(`Analyzing ${nodes.length} real nodes for label issues`);
        
        // Process the real data
        this.identityManager.processNodes(nodes);
        
        // Get results
        const duplicates = this.identityManager.getDuplicateLabels();
        
        // Log summary
        logger.info(`Analysis complete: Found ${duplicates.size} duplicate labels in ${nodes.length} nodes`);
        
        if (duplicates.size > 0) {
            logger.warn('⚠️ Duplicate labels detected in production data:');
            duplicates.forEach((nodeIds, label) => {
                logger.warn(`  - "${label}" used by ${nodeIds.length} nodes: ${nodeIds.join(', ')}`);
            });
        } else {
            logger.info('✅ No duplicate labels found in the dataset');
        }
    }
    
    /**
     * Execute this from console to test the duplicate label detection 
     * after integration with NodeManagerFacade
     */
    public static runTest(): void {
        const diagnostics = new NodeLabelDiagnostics();
        diagnostics.runDuplicateLabelTest();
        logger.info('To test with real data, call NodeLabelDiagnostics.analyzeCurrentNodes()');
    }
    
    /**
     * Run analysis on current graph nodes (call from browser console)
     * 
     * Usage: NodeLabelDiagnostics.analyzeCurrentNodes()
     */
    public static analyzeCurrentNodes(): void {
        try {
            // Access the global window object to get current nodes
            // This must be run in the browser context
            const windowAny = window as any;
            
            if (windowAny.__graphData && windowAny.__graphData.nodes) {
                const nodes = windowAny.__graphData.nodes;
                logger.info(`Analyzing current graph with ${nodes.length} nodes`);
                
                const diagnostics = new NodeLabelDiagnostics();
                diagnostics.analyzeRealData(nodes);
            } else {
                logger.warn('No graph data found in window.__graphData. Make sure you run this in the browser after graph is loaded.', createDataMetadata({ found: false }));
            }
        } catch (error) {
            logger.error('Error analyzing current nodes:', createErrorMetadata(error as Error));
        }
    }
}

// Make it accessible for browser console debugging
(window as any).NodeLabelDiagnostics = NodeLabelDiagnostics;

// Allow direct testing via console
export function testDuplicateLabels(): void {
    NodeLabelDiagnostics.runTest();
}