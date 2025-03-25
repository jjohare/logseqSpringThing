/**
 * Utility functions for binary data handling
 */
import { createLogger, createErrorMetadata } from './logger';
import { debugState } from './debug-state';

const logger = createLogger('BinaryUtils');

/**
 * Check if binary data is likely compressed with zlib
 * Zlib header usually starts with bytes 0x78 0x01, 0x78 0x9C, or 0x78 0xDA
 * 
 * The possible headers (first byte is 0x78):
 * - 0x01: No compression or lowest compression level
 * - 0x5E: Level 1 compression
 * - 0x9C: Default compression (level 6)
 * - 0xDA: Maximum compression (level 9)
 */
export function isZlibCompressed(data: ArrayBuffer): boolean {
  if (data.byteLength < 2) {
    return false;
  }
  
  const view = new Uint8Array(data);
  
  // First byte for zlib must be 0x78
  if (view[0] !== 0x78) {
    return false;
  }
  
  // Common second bytes for zlib headers
  const validSecondBytes = [0x01, 0x5E, 0x9C, 0xDA];
  const isCompressed = validSecondBytes.includes(view[1]);
  
  if (isCompressed && debugState.isDataDebugEnabled()) {
    // Log compression details for debugging
    let compressionLevel = "unknown";
    switch (view[1]) {
      case 0x01: compressionLevel = "no compression/lowest"; break;
      case 0x5E: compressionLevel = "level 1"; break;
      case 0x9C: compressionLevel = "default (level 6)"; break;
      case 0xDA: compressionLevel = "maximum (level 9)"; break;
    }
    logger.debug(`Detected zlib compressed data: ${compressionLevel} compression, size: ${data.byteLength} bytes`);
  }
  
  return isCompressed;
}

/**
 * Decompress zlib compressed data
 * Using the DecompressionStream API available in modern browsers
 */
export async function decompressZlib(compressedData: ArrayBuffer): Promise<ArrayBuffer> {
  // Start timing the decompression
  const startTime = performance.now();
  
  // For browsers that support DecompressionStream (Chrome, Firefox, Safari)
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const cs = new DecompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(new Uint8Array(compressedData.slice(2))); // Skip zlib header (2 bytes)
      writer.close();
      const output = [];
      const reader = cs.readable.getReader();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        output.push(value);
      }
      
      // Combine all chunks
      const totalLength = output.reduce((acc, arr) => acc + arr.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const arr of output) {
        result.set(arr, offset);
        offset += arr.length;
      }
      
      // End timing and log
      const endTime = performance.now();
      if (debugState.isDataDebugEnabled()) {
        logger.debug(`Decompressed ${compressedData.byteLength} bytes to ${result.buffer.byteLength} bytes in ${(endTime - startTime).toFixed(2)}ms (${((result.buffer.byteLength / compressedData.byteLength) * 100).toFixed(2)}% expansion)`);
      }
      
      return result.buffer;
    } catch (error) {
      logger.error('Error decompressing data:', createErrorMetadata(error));
      throw new Error('Failed to decompress data');
    }
  } else {
    // DecompressionStream not available
    logger.error('DecompressionStream API not available in this browser');
    throw new Error('Decompression not supported in this browser');
  }
}

/**
 * Detect and decompress binary data if it's compressed
 */
export async function maybeDecompress(data: ArrayBuffer): Promise<ArrayBuffer> {
  // Check for invalid data
  if (!data || data.byteLength === 0) {
    logger.warn('Empty or invalid binary data received');
    return data;
  }
  
  // Log the first few bytes to help with debugging
  if (debugState.isDataDebugEnabled()) {
    const view = new Uint8Array(data);
    const hexBytes = [];
    const maxBytesToShow = Math.min(16, data.byteLength);
    
    for (let i = 0; i < maxBytesToShow; i++) {
      hexBytes.push(view[i].toString(16).padStart(2, '0'));
    }
    
    logger.debug(`Binary data header (${data.byteLength} bytes): ${hexBytes.join(' ')}`);
  }
  
  if (isZlibCompressed(data)) {
    try {
      const decompressed = await decompressZlib(data);
      return decompressed;
    } catch (error) {
      logger.error('Failed to decompress data, using raw data instead:', createErrorMetadata(error));
      // Fall back to original data if decompression fails
      return data;
    }
  } else {
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Processing uncompressed binary data (${data.byteLength} bytes)`);
    }
    return data;
  }
} 