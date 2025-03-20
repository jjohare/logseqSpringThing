import { createLogger, createErrorMetadata, createDataMetadata } from '../core/logger';

const logger = createLogger('NodeManagerMetrics');

interface PerformanceMetrics {
    fps: number;
    frameTime: number;
    updateTime: number;
    memoryUsage?: number;
    nodeCount: number;
    visibleNodes: number;
    updateCount: number;
}

interface MetricsSummary {
    avgFps: number;
    avgFrameTime: number;
    avgUpdateTime: number;
    avgMemoryUsage?: number;
    minFps: number;
    maxUpdateTime: number;
    totalUpdates: number;
    sampleCount: number;
}

/**
 * Monitoring system for tracking node manager performance
 */
export class NodeManagerMetrics {
    private static instance: NodeManagerMetrics;
    private metrics: PerformanceMetrics[] = [];
    private currentMetrics: PerformanceMetrics;
    private lastFrameTime: number = 0;
    private frameCount: number = 0;
    private readonly MAX_SAMPLES = 1000;
    private readonly ALERT_THRESHOLD_FPS = 45;
    private readonly ALERT_THRESHOLD_UPDATE_TIME = 16; // ms

    // Performance monitoring
    private performanceObserver: PerformanceObserver | null = null;

    private constructor() {
        this.currentMetrics = this.createEmptyMetrics();
        this.setupPerformanceObserver();
        
        // Report metrics periodically
        setInterval(() => this.reportMetrics(), 5000);
    }

    private createEmptyMetrics(): PerformanceMetrics {
        return {
            fps: 0,
            frameTime: 0,
            updateTime: 0,
            nodeCount: 0,
            visibleNodes: 0,
            updateCount: 0
        };
    }

    private setupPerformanceObserver(): void {
        if (typeof PerformanceObserver !== 'undefined') {
            this.performanceObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'measure' && entry.name === 'nodeUpdate') {
                        this.currentMetrics.updateTime = entry.duration;
                    }
                }
            });

            try {
                this.performanceObserver.observe({ entryTypes: ['measure'] });
            } catch (error) {
                logger.warn('Performance observer setup failed:', createErrorMetadata(error));
            }
        }
    }

    public static getInstance(): NodeManagerMetrics {
        if (!NodeManagerMetrics.instance) {
            NodeManagerMetrics.instance = new NodeManagerMetrics();
        }
        return NodeManagerMetrics.instance;
    }

    /**
     * Record metrics for current frame
     */
    public recordFrame(nodeCount: number, visibleNodes: number): void {
        const now = performance.now();
        
        if (this.lastFrameTime > 0) {
            const frameTime = now - this.lastFrameTime;
            this.currentMetrics.frameTime = frameTime;
            this.currentMetrics.fps = 1000 / frameTime;
        }
        
        this.lastFrameTime = now;
        this.currentMetrics.nodeCount = nodeCount;
        this.currentMetrics.visibleNodes = visibleNodes;
        
        // Add memory usage if available (Chrome-specific API)
        interface PerformanceWithMemory extends Performance {
            memory?: {
                usedJSHeapSize: number;
            };
        }
        if ((performance as PerformanceWithMemory).memory) {
            this.currentMetrics.memoryUsage = (performance as PerformanceWithMemory).memory!.usedJSHeapSize / (1024 * 1024);
        }

        // Check for performance issues
        this.checkPerformance();

        // Store metrics
        this.metrics.push({ ...this.currentMetrics });
        if (this.metrics.length > this.MAX_SAMPLES) {
            this.metrics.shift();
        }

        // Reset current metrics
        this.currentMetrics = this.createEmptyMetrics();
        this.frameCount++;
    }

    /**
     * Record start of node update
     */
    public startUpdate(): void {
        performance.mark('nodeUpdateStart');
    }

    /**
     * Record end of node update
     */
    public endUpdate(): void {
        performance.mark('nodeUpdateEnd');
        performance.measure('nodeUpdate', 'nodeUpdateStart', 'nodeUpdateEnd');
        this.currentMetrics.updateCount++;
    }

    /**
     * Get summary of collected metrics
     */
    public getMetricsSummary(): MetricsSummary {
        if (this.metrics.length === 0) {
            return {
                avgFps: 0,
                avgFrameTime: 0,
                avgUpdateTime: 0,
                minFps: 0,
                maxUpdateTime: 0,
                totalUpdates: 0,
                sampleCount: 0
            };
        }

        const summary = this.metrics.reduce((acc, metrics) => {
            acc.avgFps += metrics.fps;
            acc.avgFrameTime += metrics.frameTime;
            acc.avgUpdateTime += metrics.updateTime;
            if (metrics.memoryUsage) {
                acc.avgMemoryUsage = (acc.avgMemoryUsage || 0) + metrics.memoryUsage;
            }
            acc.minFps = Math.min(acc.minFps, metrics.fps);
            acc.maxUpdateTime = Math.max(acc.maxUpdateTime, metrics.updateTime);
            acc.totalUpdates += metrics.updateCount;
            return acc;
        }, {
            avgFps: 0,
            avgFrameTime: 0,
            avgUpdateTime: 0,
            avgMemoryUsage: undefined as number | undefined,
            minFps: Infinity,
            maxUpdateTime: 0,
            totalUpdates: 0,
            sampleCount: this.metrics.length
        });

        // Calculate averages
        summary.avgFps /= summary.sampleCount;
        summary.avgFrameTime /= summary.sampleCount;
        summary.avgUpdateTime /= summary.sampleCount;
        if (summary.avgMemoryUsage !== undefined) {
            summary.avgMemoryUsage /= summary.sampleCount;
        }

        return summary;
    }

    private checkPerformance(): void {
        const metrics = this.currentMetrics;

        // Check FPS
        if (metrics.fps < this.ALERT_THRESHOLD_FPS) {
            logger.warn('Low FPS detected:', createDataMetadata({
                fps: metrics.fps.toFixed(2),
                nodeCount: metrics.nodeCount
            }));
        }

        // Check update time
        if (metrics.updateTime > this.ALERT_THRESHOLD_UPDATE_TIME) {
            logger.warn('High update time detected:', createDataMetadata({
                updateTime: metrics.updateTime.toFixed(2),
                nodeCount: metrics.nodeCount
            }));
        }
    }

    private reportMetrics(): void {
        const summary = this.getMetricsSummary();

        logger.info('Performance Summary:', createDataMetadata({
            avgFps: summary.avgFps.toFixed(2),
            minFps: summary.minFps.toFixed(2),
            avgUpdateTime: summary.avgUpdateTime.toFixed(2),
            maxUpdateTime: summary.maxUpdateTime.toFixed(2),
            avgMemoryUsage: summary.avgMemoryUsage?.toFixed(2),
            totalUpdates: summary.totalUpdates,
            sampleCount: summary.sampleCount
        }));
    }

    public dispose(): void {
        if (this.performanceObserver) {
            this.performanceObserver.disconnect();
        }
        clearInterval(this.reportMetrics as any);
        this.metrics = [];
        NodeManagerMetrics.instance = null!;
        logger.info('NodeManagerMetrics disposed');
    }
}

// Export singleton instance
export const nodeManagerMetrics = NodeManagerMetrics.getInstance();