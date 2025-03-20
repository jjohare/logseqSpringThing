import { createLogger } from '../core/logger';
import { WebSocketService } from '../websocket/websocketService';
import { graphDataManager } from '../state/graphData';
import { debugState } from '../core/debugState';
import { SettingsStore } from '../state/SettingsStore';

const logger = createLogger('SystemDiagnostics');

/**
 * SystemDiagnostics provides tools for diagnosing and debugging the application.
 * It offers methods to analyze various aspects of the system and log detailed information.
 */
export class SystemDiagnostics {
    private static instance: SystemDiagnostics | null = null;
    private webSocketService: WebSocketService;
    private settingsStore: SettingsStore;
    private isActive: boolean = false;
    private intervalId: number | null = null;
    
    private constructor() {
        this.webSocketService = WebSocketService.getInstance();
        this.settingsStore = SettingsStore.getInstance();
        logger.info('SystemDiagnostics initialized');
    }
    
    public static getInstance(): SystemDiagnostics {
        if (!SystemDiagnostics.instance) {
            SystemDiagnostics.instance = new SystemDiagnostics();
        }
        return SystemDiagnostics.instance;
    }
    
    /**
     * Start continuous diagnostics logging
     * @param intervalMs Interval in milliseconds between diagnostics runs
     */
    public startDiagnostics(intervalMs: number = 5000): void {
        if (this.isActive) {
            logger.warn('Diagnostics already running');
            return;
        }
        
        logger.info(`Starting system diagnostics with ${intervalMs}ms interval`);
        this.isActive = true;
        
        // Enable all debug flags
        // Use the settings store to update debug settings
        this.settingsStore.set('system.debug.enabled', true);
        this.settingsStore.set('system.debug.enable_data_debug', true);
        this.settingsStore.set('system.debug.enable_websocket_debug', true);
        this.settingsStore.set('system.debug.enable_node_debug', true);
        this.settingsStore.set('system.debug.enable_shader_debug', true);
        this.settingsStore.set('system.debug.enable_physics_debug', true);
        this.settingsStore.set('system.debug.enable_matrix_debug', true);
        
        // Log the current debug state
        logger.info('Debug flags enabled:', {
            globalDebug: debugState.isEnabled(),
            dataDebug: debugState.isDataDebugEnabled(),
            websocketDebug: debugState.isWebsocketDebugEnabled(),
            nodeDebug: debugState.isNodeDebugEnabled()
        });
        
        // Run initial diagnostics immediately
        this.runDiagnostics();
        
        // Set up interval for continuous diagnostics
        this.intervalId = window.setInterval(() => {
            this.runDiagnostics();
        }, intervalMs);
    }
    
    /**
     * Stop continuous diagnostics logging
     */
    public stopDiagnostics(): void {
        if (!this.isActive || this.intervalId === null) {
            logger.warn('Diagnostics not running');
            return;
        }
        
        logger.info('Stopping system diagnostics');
        window.clearInterval(this.intervalId);
        this.intervalId = null;
        this.isActive = false;
    }
    
    /**
     * Run a full system diagnostics check
     */
    public runDiagnostics(): void {
        try {
            logger.info('Running full system diagnostics');
            
            this.checkWebSocketStatus();
            this.checkGraphData();
            this.checkRendererStatus();
            this.checkMemoryUsage();
            
            logger.info('Diagnostics completed successfully');
        } catch (error) {
            logger.error('Error running diagnostics', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }
    
    /**
     * Check WebSocket connection status and health
     */
    private checkWebSocketStatus(): void {
        // Get connection status as string safely
        const connectionStatus = String(this.webSocketService.getConnectionStatus());
        
        logger.info('WebSocket status:', { 
            statusString: connectionStatus, 
            isConnected: connectionStatus === 'connected',
            readyState: this.getWebSocketReadyState()
        });
        
        // If not connected, try to reconnect
        if (connectionStatus !== 'connected') {
            logger.warn('WebSocket not connected, trying to reconnect');
            this.webSocketService.connect().catch(error => {
                logger.error('Failed to reconnect', { error });
            });
        }
    }

    /**
     * Get the current WebSocket readyState as a string
     */
    private getWebSocketReadyState(): string {
        const ws = (this.webSocketService as any).ws;
        const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        
        if (!ws) {
            return 'CLOSED (No WebSocket)';
        }
        
        // readyState is a number from 0-3
        const readyState = ws.readyState;
        
        if (readyState >= 0 && readyState <= 3) {
            return `${readyStates[readyState]} (${readyState})`;
        }
        
        // Fallback for unexpected values
        if (typeof readyState === 'number') {
            return `UNKNOWN (${readyState})`;
        }
        
        return 'UNKNOWN (null)';
    }
    
    /**
     * Check graph data state
     */
    private checkGraphData(): void {
        const graphData = graphDataManager.getGraphData();
        logger.info('Graph data status:', {
            nodeCount: graphData.nodes.length,
            edgeCount: graphData.edges.length,
            metadata: graphData.metadata
        });
        
        // Check sample node positions
        if (graphData.nodes.length > 0) {
            const sampleNodes = graphData.nodes.slice(0, 3);
            logger.info('Sample node positions:', {
                samples: sampleNodes.map(node => ({
                    id: node.id,
                    position: node.data.position,
                    velocity: node.data.velocity,
                    metadata: {
                        name: node.data.metadata?.name,
                        fileSize: node.data.metadata?.fileSize
                    }
                }))
            });
        }
    }
    
    /**
     * Check renderer status
     */
    private checkRendererStatus(): void {
        // Get WebGL context information
        try {
            const canvas = document.querySelector('canvas');
            if (!canvas) {
                logger.warn('No canvas element found');
                return;
            }
            
            const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
            if (!gl) {
                logger.error('WebGL context not available');
                return;
            }
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            
            logger.info('WebGL context info:', {
                webgl2: gl instanceof WebGL2RenderingContext,
                vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown',
                renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxVaryings: gl.getParameter(gl.MAX_VARYING_VECTORS),
                maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
                maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
            });
            
            // Check for WebGL errors
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                logger.error('WebGL error detected', { 
                    code: error,
                    description: this.getWebGLErrorDescription(error)
                });
            }
        } catch (error) {
            logger.error('Error checking renderer status', { error });
        }
    }
    
    /**
     * Check memory usage
     */
    private checkMemoryUsage(): void {
        if (window.performance && (performance as any).memory) {
            const memory = (performance as any).memory;
            logger.info('Memory usage:', {
                usedJSHeapSize: this.formatBytes(memory.usedJSHeapSize),
                totalJSHeapSize: this.formatBytes(memory.totalJSHeapSize),
                jsHeapSizeLimit: this.formatBytes(memory.jsHeapSizeLimit),
                percentUsed: (memory.usedJSHeapSize / memory.totalJSHeapSize * 100).toFixed(1) + '%'
            });
        }
    }
    
    /**
     * Convert bytes to a human-readable format
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Get a human-readable description of a WebGL error code
     */
    private getWebGLErrorDescription(errorCode: number): string {
        // Get a sample WebGL context to access error constants
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
        if (!gl) return 'Unknown error';
        
        switch (errorCode) {
            case gl.INVALID_ENUM: return 'INVALID_ENUM: An unacceptable value has been specified for an enumerated argument';
            case gl.INVALID_VALUE: return 'INVALID_VALUE: A numeric argument is out of range';
            case gl.INVALID_OPERATION: return 'INVALID_OPERATION: The specified command is not allowed for the current state';
            case gl.INVALID_FRAMEBUFFER_OPERATION: return 'INVALID_FRAMEBUFFER_OPERATION: The currently bound framebuffer is not framebuffer complete';
            case gl.OUT_OF_MEMORY: return 'OUT_OF_MEMORY: Not enough memory is left to execute the command';
            case gl.CONTEXT_LOST_WEBGL: return 'CONTEXT_LOST_WEBGL: The WebGL context has been lost';
            default: return `Unknown WebGL error code: ${errorCode}`;
        }
    }
    
    /**
     * Test a shader for compatibility/compilation issues
     * @param vertexShader Vertex shader source code
     * @param fragmentShader Fragment shader source code
     */
    public testShaderCompilation(vertexShader: string, fragmentShader: string): boolean {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
            if (!gl) {
                logger.error('WebGL context not available for shader test');
                return false;
            }
            
            // Create and compile vertex shader
            const vs = gl.createShader(gl.VERTEX_SHADER);
            if (!vs) {
                logger.error('Failed to create vertex shader');
                return false;
            }
            gl.shaderSource(vs, vertexShader);
            gl.compileShader(vs);
            
            // Check vertex shader compilation status
            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
                logger.error('Vertex shader compilation failed', {
                    error: gl.getShaderInfoLog(vs),
                    source: vertexShader
                });
                gl.deleteShader(vs);
                return false;
            }
            
            // Create and compile fragment shader
            const fs = gl.createShader(gl.FRAGMENT_SHADER);
            if (!fs) {
                logger.error('Failed to create fragment shader');
                gl.deleteShader(vs);
                return false;
            }
            gl.shaderSource(fs, fragmentShader);
            gl.compileShader(fs);
            
            // Check fragment shader compilation status
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                logger.error('Fragment shader compilation failed', {
                    error: gl.getShaderInfoLog(fs),
                    source: fragmentShader
                });
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                return false;
            }
            
            // Create program and link shaders
            const program = gl.createProgram();
            if (!program) {
                logger.error('Failed to create shader program');
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                return false;
            }
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            
            // Check program link status
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                logger.error('Shader program linking failed', {
                    error: gl.getProgramInfoLog(program)
                });
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                gl.deleteProgram(program);
                return false;
            }
            
            // Validate program
            gl.validateProgram(program);
            if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
                logger.error('Shader program validation failed', {
                    error: gl.getProgramInfoLog(program)
                });
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                gl.deleteProgram(program);
                return false;
            }
            
            // Success! Clean up resources
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            gl.deleteProgram(program);
            
            logger.info('Shader compilation test passed');
            return true;
        } catch (error) {
            logger.error('Error during shader compilation test', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            return false;
        }
    }
    
    /**
     * Force a websocket reconnection
     */
    public forceWebSocketReconnect(): void {
        logger.info('Forcing WebSocket reconnection');
        this.webSocketService.close();
        this.webSocketService.connect().then(() => {
            logger.info('WebSocket reconnected successfully');
        }).catch(error => {
            logger.error('WebSocket reconnection failed', { error });
        });
    }
    
    /**
     * Force a refresh of graph data from server
     */
    public refreshGraphData(): void {
        logger.info('Refreshing graph data from server');
        graphDataManager.fetchInitialData().then(() => {
            logger.info('Graph data refreshed successfully');
        }).catch(error => {
            logger.error('Failed to refresh graph data', { error });
        });
    }
}

// Export a singleton instance
export const systemDiagnostics = SystemDiagnostics.getInstance();