/**
 * Type definitions for pako 2.x
 * Project: https://github.com/nodeca/pako
 */

declare module 'pako' {
  /**
   * Inflate (decompress) data with pako
   */
  export function inflate(data: Uint8Array, options?: InflateOptions): Uint8Array;
  
  /**
   * Deflate (compress) data with pako
   */
  export function deflate(data: Uint8Array, options?: DeflateOptions): Uint8Array;
  
  /**
   * Inflate (decompress) data with pako (sync, no callback)
   */
  export function inflateRaw(data: Uint8Array, options?: InflateOptions): Uint8Array;
  
  /**
   * Deflate (compress) data with pako (sync, no callback)
   */
  export function deflateRaw(data: Uint8Array, options?: DeflateOptions): Uint8Array;
  
  /**
   * Inflate (decompress) data with gzip headers
   */
  export function ungzip(data: Uint8Array, options?: InflateOptions): Uint8Array;
  
  /**
   * Deflate (compress) data with gzip headers
   */
  export function gzip(data: Uint8Array, options?: DeflateOptions): Uint8Array;
  
  export interface InflateOptions {
    windowBits?: number;
    raw?: boolean;
    to?: 'string' | 'array';
    chunkSize?: number;
  }
  
  export interface DeflateOptions {
    level?: number;
    windowBits?: number;
    memLevel?: number;
    strategy?: number;
    raw?: boolean;
    to?: 'string';
    chunkSize?: number;
  }
}

// Add global pako declaration for browser scripts
interface Window {
  pako?: {
    inflate(data: Uint8Array, options?: any): Uint8Array;
    deflate(data: Uint8Array, options?: any): Uint8Array;
  };
} 