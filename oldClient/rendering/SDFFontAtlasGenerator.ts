import { createLogger } from '../core/logger';
import { Texture, LinearFilter, ClampToEdgeWrapping } from 'three';

const logger = createLogger('SDFFontAtlasGenerator');

interface GlyphMetrics {
    width: number;
    height: number;
    advanceWidth: number;
    bearingX: number;
    bearingY: number;
}

interface GlyphInfo {
    char: string;
    metrics: GlyphMetrics;
    textureX: number;
    textureY: number;
    textureWidth: number;
    textureHeight: number;
}

export class SDFFontAtlasGenerator {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private atlasSize: number;
    private padding: number;
    private spread: number;
    private glyphInfoMap: Map<string, GlyphInfo>;
    private readonly superSampling: number = 2; // Supersampling factor for higher quality
    
    constructor(atlasSize = 2048, padding = 8, spread = 16) {
        this.atlasSize = atlasSize;
        this.padding = padding;
        this.spread = spread;
        this.glyphInfoMap = new Map();
        
        // Create high-res canvas for supersampling
        this.canvas = document.createElement('canvas');
        this.canvas.width = atlasSize * this.superSampling;
        this.canvas.height = atlasSize * this.superSampling;
        
        const ctx = this.canvas.getContext('2d', { 
            alpha: true,
            antialias: true,
            desynchronized: true
        }) as CanvasRenderingContext2D;
        if (!ctx) {
            throw new Error('Failed to get 2D context');
        }
        this.ctx = ctx;
        
        // Enable high-quality rendering
        (this.ctx as any).textRendering = 'geometricPrecision';
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }
    
    public async generateAtlas(
        fontFamily: string,
        fontSize: number,
        chars: string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-+/():;%&`\'*#=[]" '
    ): Promise<{ texture: Texture; glyphInfoMap: Map<string, GlyphInfo> }> {
        logger.info('Generating font atlas:', {
            fontFamily,
            fontSize,
            atlasSize: this.atlasSize,
            padding: this.padding,
            spread: this.spread,
            chars: chars.length,
            superSampling: this.superSampling
        });

        // Scale font size for supersampling
        const scaledFontSize = fontSize * this.superSampling;
        this.ctx.font = `${scaledFontSize}px ${fontFamily}`;
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'white';
        
        // Clear canvas with transparency
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Calculate glyph positions with supersampling
        let x = this.padding * this.superSampling;
        let y = (this.padding + fontSize) * this.superSampling;
        const lineHeight = fontSize * 1.4 * this.superSampling;
        
        // Generate glyphs and compute SDF
        for (const char of chars) {
            const metrics = this.getGlyphMetrics(char, fontSize);
            
            // Check if we need to move to next line
            if (x + metrics.width + this.padding > this.canvas.width) {
                x = this.padding * this.superSampling;
                y += lineHeight;
                
                if (y + lineHeight > this.canvas.height) {
                    logger.warn('Atlas size exceeded, some characters may be missing');
                    break;
                }
            }
            
            // Draw glyph
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(char, x, y);
            
            // Store glyph info
            this.glyphInfoMap.set(char, {
                char,
                metrics,
                textureX: x,
                textureY: y - fontSize,
                textureWidth: metrics.width + this.padding * 2,
                textureHeight: fontSize + this.padding * 2
            });
            
            x += metrics.width + this.padding * 2;
        }
        
        // Generate SDF
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const sdf = this.computeSDF(imageData.data);
        
        // Apply SDF to canvas
        const sdfImageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
        for (let i = 0; i < sdf.length; i++) {
            const value = Math.floor(sdf[i] * 255);
            const idx = i * 4;
            sdfImageData.data[idx] = value;
            sdfImageData.data[idx + 1] = value;
            sdfImageData.data[idx + 2] = value;
            sdfImageData.data[idx + 3] = 255;
        }
        this.ctx.putImageData(sdfImageData, 0, 0);
        
        logger.info('Font atlas generated:', {
            glyphCount: this.glyphInfoMap.size,
            sampleGlyphs: Array.from(this.glyphInfoMap.entries())
                .slice(0, 3)
                .map(([char, info]) => ({
                    char,
                    textureX: info.textureX,
                    textureY: info.textureY,
                    width: info.textureWidth,
                    height: info.textureHeight
                }))
        });

        // Create texture with better filtering
        const texture = new Texture(this.canvas);
        texture.needsUpdate = true;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        
        // Downscale canvas to final size
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = this.atlasSize;
        finalCanvas.height = this.atlasSize;
        const finalCtx = finalCanvas.getContext('2d');
        if (finalCtx) {
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.drawImage(this.canvas, 0, 0, this.atlasSize, this.atlasSize);
            (texture as any).image = finalCanvas;
            texture.needsUpdate = true;
        }
        
        return {
            texture,
            glyphInfoMap: this.glyphInfoMap
        };
    }
    
    private getGlyphMetrics(char: string, fontSize: number): GlyphMetrics {
        const metrics = this.ctx.measureText(char);
        return {
            width: metrics.width,
            height: fontSize,
            advanceWidth: metrics.width,
            bearingX: 0,
            bearingY: metrics.actualBoundingBoxAscent
        };
    }
    
    private computeSDF(imageData: Uint8ClampedArray): Float32Array {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const sdf = new Float32Array(width * height);
        
        // Simple 8-bit SDF computation
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const alpha = imageData[idx + 3] / 255;
                
                if (alpha > 0.5) {
                    // Inside glyph
                    sdf[y * width + x] = Math.min(1, this.computeDistance(x, y, imageData, false) / this.spread);
                } else {
                    // Outside glyph
                    sdf[y * width + x] = Math.max(0, 1 - this.computeDistance(x, y, imageData, true) / this.spread);
                }
            }
        }
        
        return sdf;
    }
    
    private computeDistance(x: number, y: number, imageData: Uint8ClampedArray, inside: boolean): number {
        let minDist = this.spread * 2;
        const width = this.canvas.width;
        
        // Search in a square around the point
        for (let dy = -this.spread; dy <= this.spread; dy++) {
            for (let dx = -this.spread; dx <= this.spread; dx++) {
                const sx = x + dx;
                const sy = y + dy;
                
                if (sx >= 0 && sx < width && sy >= 0 && sy < width) {
                    const idx = (sy * width + sx) * 4;
                    const alpha = imageData[idx + 3] / 255;
                    
                    if ((inside && alpha <= 0.5) || (!inside && alpha > 0.5)) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        minDist = Math.min(minDist, dist);
                    }
                }
            }
        }
        
        return minDist;
    }
}