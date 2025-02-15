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

    getNodeGeometry(quality: 'low' | 'medium' | 'high', context: 'ar' | 'desktop' = 'desktop', size: number = 40): BufferGeometry {
        const cacheKey = `node-${quality}-${context}-${size}`;
        if (this.geometryCache.has(cacheKey)) {
            return this.geometryCache.get(cacheKey)!;
        }

        let geometry: BufferGeometry;
        let detail: number;
        
        switch (quality) {
            case 'low':
               detail = context === 'ar' ? 0 : 1;
                 break;
            case 'medium':
                detail = context === 'ar' ? 1 : 2;
                break;
            case 'high':
                detail = context === 'ar' ? 1 : 2;
                break;
            default:
                detail = context === 'ar' ? 1 : 2;
        }
        // Use IcosahedronGeometry for better performance while maintaining visual quality
        // Convert from native units (40-120) to scene scale (0.4-1.2)
        geometry = new IcosahedronGeometry(size / 100, detail);
        this.geometryCache.set(cacheKey, geometry);
        return geometry;
    }

    getHologramGeometry(type: string, quality: string, size: number = 40): BufferGeometry {
        const cacheKey = `hologram-${type}-${quality}-${size}`;
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
                geometry = new TorusGeometry(size, size * 0.05, segments.ring, segments.ring * 2);
                break;
            case 'triangleSphere':
                geometry = new IcosahedronGeometry(size, 1); // One subdivision for all spheres
                break;
            default:
                geometry = new IcosahedronGeometry(size, 1); // Base size
        }

        this.geometryCache.set(cacheKey, geometry);
        return geometry;
    }

    getEdgeGeometry(context: 'ar' | 'desktop' = 'desktop', quality?: 'low' | 'medium' | 'high'): BufferGeometry {
        const cacheKey = `edge-${context}-${quality || 'medium'}`;
        if (this.geometryCache.has(cacheKey)) {
            return this.geometryCache.get(cacheKey)!;
        }

        // Use CylinderGeometry for more reliable edge rendering
        const baseRadius = context === 'ar' ? 0.5 : 1.0; // Native units for edge thickness
        
        // Adjust segments based on quality
        const segments = {
            low: context === 'ar' ? 4 : 5,
            medium: context === 'ar' ? 5 : 6,
            high: context === 'ar' ? 6 : 8
        }[quality || 'medium'];
        const geometry = new CylinderGeometry(baseRadius, baseRadius, 1, segments);
        
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
