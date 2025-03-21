import { 
    BufferGeometry, 
    CylinderGeometry, 
    IcosahedronGeometry,
    TorusGeometry
} from 'three';

export class GeometryFactory {
    private static instance: GeometryFactory;
    private geometryCache = new Map<string, BufferGeometry>();

    private constructor() {}

    static getInstance(): GeometryFactory {
        if (!GeometryFactory.instance) {
            GeometryFactory.instance = new GeometryFactory();
        }
        return GeometryFactory.instance;
    }

    /**
     * Creates a node geometry with radius 1, which can be scaled by the NodeInstanceManager
     * to match the desired size from settings.
     */
    getNodeGeometry(quality: 'low' | 'medium' | 'high', context: 'ar' | 'desktop' = 'desktop'): BufferGeometry {
        const cacheKey = `node-${quality}-${context}`;
        if (this.geometryCache.has(cacheKey)) {
            return this.geometryCache.get(cacheKey)!;
        }

        let geometry: BufferGeometry;
        let detail: number;
        
        switch (quality) {
            case 'low':
               detail = context === 'ar' ? 1 : 2;
                 break;
            case 'medium':
                detail = context === 'ar' ? 2 : 3;
                break;
            case 'high':
                detail = context === 'ar' ? 2 : 4;
                break;
            default:
                detail = context === 'ar' ? 1 : 2;
        }
        
        // Create unit-sized geometry (radius = 1) that will be scaled by NodeInstanceManager
        geometry = new IcosahedronGeometry(1, detail);
        this.geometryCache.set(cacheKey, geometry);
        return geometry;
    }

    /**
     * Creates a hologram geometry with radius 1, which can be scaled by the HologramManager
     * to match the desired size from settings.
     */
    getHologramGeometry(type: string, quality: string): BufferGeometry {
        const cacheKey = `hologram-${type}-${quality}`;
        if (this.geometryCache.has(cacheKey)) {
            return this.geometryCache.get(cacheKey)!;
        }

        const segments = {
            low: { ring: 16, sphere: 12 },
            medium: { ring: 24, sphere: 16 },
            high: { ring: 32, sphere: 16 }
        }[quality] || { ring: 32, sphere: 16 };

        let geometry: BufferGeometry;
        switch (type) {
            case 'ring':
                // Create unit-sized torus (radius = 1) with proportional tube radius
                geometry = new TorusGeometry(1, 0.05, segments.ring, segments.ring * 2);
                break;
            case 'triangleSphere':
                // Create unit-sized icosahedron (radius = 1)
                geometry = new IcosahedronGeometry(1, 1);
                break;
            default:
                // Create unit-sized icosahedron (radius = 1)
                geometry = new IcosahedronGeometry(1, 1);
        }

        this.geometryCache.set(cacheKey, geometry);
        return geometry;
    }

    /**
     * Creates an edge geometry with radius 1 and height 1, which can be scaled by the EdgeManager
     * to match the desired width from settings.
     */
    getEdgeGeometry(context: 'ar' | 'desktop' = 'desktop', quality?: 'low' | 'medium' | 'high'): BufferGeometry {
        const cacheKey = `edge-${context}-${quality || 'medium'}`;
        if (this.geometryCache.has(cacheKey)) {
            return this.geometryCache.get(cacheKey)!;
        }

        // Adjust segments based on quality
        const segments = {
            low: context === 'ar' ? 4 : 5,
            medium: context === 'ar' ? 5 : 6,
            high: context === 'ar' ? 6 : 8
        }[quality || 'medium'];

        // Create unit-sized cylinder (radius = 1, height = 1) that will be scaled by EdgeManager
        const geometry = new CylinderGeometry(1, 1, 1, segments);
        
        // Rotate 90 degrees to align with Z-axis
        geometry.rotateX(Math.PI / 2);
        
        this.geometryCache.set(cacheKey, geometry);
        return geometry;
    }

    dispose(): void {
        this.geometryCache.forEach(geometry => geometry.dispose());
        this.geometryCache.clear();
    }
}
