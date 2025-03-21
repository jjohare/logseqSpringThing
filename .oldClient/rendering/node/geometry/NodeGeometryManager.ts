import {
    BufferGeometry,
    IcosahedronGeometry,
    OctahedronGeometry
} from 'three';
import { GeometryFactory } from '../../factories/GeometryFactory';
import { createLogger, createDataMetadata } from '../../../core/logger';

const logger = createLogger('NodeGeometryManager');

// LOD level definitions
export enum LODLevel {
    HIGH = 0,    // < 10 meters: Full detail
    MEDIUM = 1,  // 10-50 meters: Medium detail
    LOW = 2      // > 50 meters: Low detail
} 

// Interface for LOD thresholds with hysteresis
interface LODHysteresisThresholds {
    // Thresholds for switching to a higher detail level (moving closer)
    upscale: {
        [LODLevel.HIGH]: number;   // Switch to HIGH when closer than this
        [LODLevel.MEDIUM]: number; // Switch to MEDIUM when closer than this
    };
    // Thresholds for switching to a lower detail level (moving away)
    downscale: {
        [LODLevel.MEDIUM]: number; // Switch to MEDIUM when further than this
        [LODLevel.LOW]: number;    // Switch to LOW when further than this
    };
} 

interface GeometryQuality {
    segments: number;  // Number of segments/detail level
    radius: number;    // Base size
}

export class NodeGeometryManager {
    private static instance: NodeGeometryManager;
    private geometryCache: Map<LODLevel, BufferGeometry>;
    private currentLOD: LODLevel = LODLevel.HIGH;
    private lastDistance: number = 0;
    private switchCount: number = 0;
    private _lastSwitchTime: number = 0;
    
    // Implement hysteresis with different thresholds for upscaling vs downscaling
    private readonly lodThresholds: LODHysteresisThresholds = {
        // Thresholds for increasing detail (moving closer)
        upscale: {
            [LODLevel.HIGH]: 5.0,     // Switch to HIGH when closer than 5m (reduced from 8m)
            [LODLevel.MEDIUM]: 30.0,  // Switch to MEDIUM when closer than 30m (reduced from 40m)
        },
        // Thresholds for decreasing detail (moving away)
        downscale: {
            [LODLevel.MEDIUM]: 15.0,  // Switch to MEDIUM when further than 15m (increased from 12m)
            [LODLevel.LOW]: 70.0,     // Switch to LOW when further than 70m (increased from 60m)
        }
    };

    private readonly qualitySettings: Record<LODLevel, GeometryQuality> = {
        [LODLevel.HIGH]: { segments: 1, radius: 0.12 },   // 12cm radius with 1 subdivision
        [LODLevel.MEDIUM]: { segments: 0, radius: 0.12 }, // 12cm radius basic octahedron
        [LODLevel.LOW]: { segments: 0, radius: 0.1 }      // 10cm octahedron for distance
    };

    private constructor() {
        GeometryFactory.getInstance(); // Initialize factory
        this.geometryCache = new Map();
        this.initializeGeometries();
    }

    public static getInstance(): NodeGeometryManager {
        if (!NodeGeometryManager.instance) {
            NodeGeometryManager.instance = new NodeGeometryManager();
        }
        return NodeGeometryManager.instance;
    }

    private initializeGeometries(): void {
        // Initialize geometries for each LOD level
        Object.values(LODLevel).forEach((level) => {
            if (typeof level === 'number') {
                const quality = this.qualitySettings[level];
                const geometry = this.createOptimizedGeometry(level, quality);
                this.geometryCache.set(level, geometry);
            }
        });
        logger.info('Initialized geometries for all LOD levels');
    }

    private createOptimizedGeometry(level: LODLevel, quality: GeometryQuality): BufferGeometry {
        // Create geometry based on LOD level
        let geometry: BufferGeometry;

        switch (level) {
            case LODLevel.HIGH:
                // High detail: Icosahedron with 1 subdivision
                geometry = new IcosahedronGeometry(quality.radius, 1);
                break;

            case LODLevel.MEDIUM:
                // Medium detail: Basic octahedron
                geometry = new OctahedronGeometry(quality.radius);
                break;

            case LODLevel.LOW:
                // Low detail: Smaller octahedron
                geometry = new OctahedronGeometry(quality.radius);
                break;

            default:
                logger.warn(`Unknown LOD level: ${level}, falling back to medium quality`);
                geometry = new OctahedronGeometry(quality.radius);
        }

        // Compute and adjust bounding sphere for better frustum culling
        geometry.computeBoundingSphere();
        if (geometry.boundingSphere) {
            geometry.boundingSphere.radius *= 1.2;
        }

        return geometry;
    }

    /**
     * Get the appropriate geometry for a given distance with hysteresis to prevent
     * rapid switching between LOD levels
     */
    public getGeometryForDistance(distance: number): BufferGeometry {
        // Start with current LOD level
        let targetLOD = this.currentLOD;

        // Calculate distance change since last update
        const distanceChange = Math.abs(distance - this.lastDistance);
        this.lastDistance = distance;
        
        // Skip LOD calculation if distance hasn't changed significantly (< 0.5m)
        // This prevents unnecessary LOD switches due to tiny camera movements
        if (distanceChange < 0.5) {
            return this.getGeometryForLOD(this.currentLOD);
        }
        
        // Use more conservative thresholds for AR mode
        const isAR = window.location.href.includes('ar=true') || 
                    document.querySelector('#xr-button')?.textContent?.includes('Exit AR');
        
        // Apply AR mode adjustments if needed
        let thresholds = this.lodThresholds;
        if (isAR) {
            // In AR mode, use more conservative thresholds (1.5x further)
            thresholds = {
                upscale: {
                    [LODLevel.HIGH]: this.lodThresholds.upscale[LODLevel.HIGH] * 1.5,
                    [LODLevel.MEDIUM]: this.lodThresholds.upscale[LODLevel.MEDIUM] * 1.5,
                },
                downscale: {
                    [LODLevel.MEDIUM]: this.lodThresholds.downscale[LODLevel.MEDIUM] * 1.5,
                    [LODLevel.LOW]: this.lodThresholds.downscale[LODLevel.LOW] * 1.5,
                }
            };
        }
        
        // Apply hysteresis based on current LOD level and distance
        switch (this.currentLOD) {
            case LODLevel.HIGH:
                // Currently high detail - only downgrade if we move far enough away
                if (distance > thresholds.downscale[LODLevel.MEDIUM]) {
                    targetLOD = LODLevel.MEDIUM;
                }
                break;
                
            case LODLevel.MEDIUM:
                // Currently medium detail - upgrade or downgrade based on distance
                if (distance <= thresholds.upscale[LODLevel.HIGH]) {
                    targetLOD = LODLevel.HIGH;
                } else if (distance > thresholds.downscale[LODLevel.LOW]) {
                    targetLOD = LODLevel.LOW;
                }
                break;
                
            case LODLevel.LOW:
                // Currently low detail - only upgrade if we get close enough
                if (distance <= thresholds.upscale[LODLevel.MEDIUM]) {
                    targetLOD = LODLevel.MEDIUM;
                }
                break;
        }

        // Only update if LOD level changed
        if (targetLOD !== this.currentLOD) {
            this.switchCount++;
            
            // Add a dampening mechanism to reduce switch frequency
            // Only update if we've had a significant distance change or a minimum count of frames
            const significantDistanceChange = distanceChange > 2.0; // 2 meters movement is significant
            
            // Implement a cooldown period for LOD switching (don't switch too frequently)
            const currentTime = performance.now();
            const timeSinceLastSwitch = currentTime - (this._lastSwitchTime || 0);
            const minimumSwitchInterval = 1000; // 1 second between LOD changes
            
            if (significantDistanceChange || timeSinceLastSwitch > minimumSwitchInterval) {
                // Update LOD level
                this.currentLOD = targetLOD;
                this._lastSwitchTime = currentTime;
                
                // Log at debug level to reduce console spam
                logger.info(`Switching to LOD level ${targetLOD} for distance ${distance.toFixed(2)}`, 
                    createDataMetadata({ 
                        previousLevel: this.currentLOD,
                    switchCount: this.switchCount,
                    distanceChange: distanceChange.toFixed(3)
                }));
            }
        }

        // Always ensure we return a valid geometry
        const geometry = this.geometryCache.get(targetLOD);
        if (!geometry) {
            logger.warn(`No geometry found for LOD level ${targetLOD}, falling back to MEDIUM`);
            return this.geometryCache.get(LODLevel.MEDIUM)!;
        }
        return geometry;
    }
    
    /**
     * Get geometry for a specific LOD level
     */
    private getGeometryForLOD(level: LODLevel): BufferGeometry {
        const geometry = this.geometryCache.get(level);
        if (!geometry) {
            logger.warn(`No geometry found for LOD level ${level}, falling back to MEDIUM`);
            return this.geometryCache.get(LODLevel.MEDIUM)!;
        }
        return geometry;
    }

    public getCurrentLOD(): LODLevel {
        return this.currentLOD;
    }

    /**
     * Get the upscale threshold for a specific LOD level
     */
    public getUpscaleThresholdForLOD(level: LODLevel): number | undefined {
        if (level === LODLevel.HIGH || level === LODLevel.MEDIUM) {
            return this.lodThresholds.upscale[level];
        } else if (level === LODLevel.LOW) {
            return undefined; // No upscale threshold for LOW level
        }
        return undefined;
    } 

    public dispose(): void {
        // Clean up geometries
        this.geometryCache.forEach(geometry => {
            geometry.dispose();
        });
        this.geometryCache.clear();
        logger.info('Disposed all geometries');
    }
}