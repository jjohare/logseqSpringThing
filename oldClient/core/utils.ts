/**
 * Core utilities for the LogseqXR visualization system
 */

import { Vector3 } from 'three';
import { debugState } from './debugState';
import { THROTTLE_INTERVAL } from './constants';

// Debug logging utility
export interface Logger {
  log: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  performance: (message: string, ...args: any[]) => void;
}

export function createLogger(namespace: string): Logger {
  return {
    log: (message: string, ...args: any[]) => console.log(`[${namespace}] ${message}`, ...args),
    error: (message: string, ...args: any[]) => console.error(`[${namespace}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => console.warn(`[${namespace}] ${message}`, ...args),
    debug: (message: string, ...args: any[]) => console.debug(`[${namespace}] ${message}`, ...args),
    info: (message: string, ...args: any[]) => console.info(`[${namespace}] ${message}`, ...args),
    performance: (message: string, ...args: any[]) => console.debug(`[${namespace}][Performance] ${message}`, ...args)
  };
}

// Case conversion utilities
export const camelToSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

export const snakeToCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

export const convertObjectKeysToSnakeCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectKeysToSnakeCase(item));
  }
  
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = camelToSnakeCase(key);
      acc[snakeKey] = convertObjectKeysToSnakeCase(obj[key]);
      return acc;
    }, {} as any);
  }
  
  return obj;
};

export const convertObjectKeysToCamelCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectKeysToCamelCase(item));
  }
  
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = snakeToCamelCase(key);
      acc[camelKey] = convertObjectKeysToCamelCase(obj[key]);
      return acc;
    }, {} as any);
  }
  
  return obj;
};

// Update throttler for performance optimization
export class UpdateThrottler {
  private lastUpdate: number = 0;
  private throttleInterval: number;
  private frameCount: number = 0;
  private totalTime: number = 0;

  constructor(throttleInterval: number = THROTTLE_INTERVAL) {
    this.throttleInterval = throttleInterval;
  }

  /**
   * Check if an update should be allowed based on the throttle interval
   */
  shouldUpdate(): boolean {
    const now = performance.now();
    const elapsed = now - this.lastUpdate;
    
    if (elapsed >= this.throttleInterval) {
      // Update metrics for adaptive throttling
      this.frameCount++;
      this.totalTime += elapsed;
      
      this.lastUpdate = now;
      return true;
    }
    return false;
  }

  /**
   * Get the time remaining until the next update is allowed
   */
  getTimeUntilNextUpdate(): number {
    const now = performance.now();
    const elapsed = now - this.lastUpdate;
    return Math.max(0, this.throttleInterval - elapsed);
  }
  
  /**
   * Get the current effective update rate in Hz
   */
  getRate(): number {
    return this.frameCount > 0 ? (1000 * this.frameCount) / this.totalTime : 0;
  }

  reset(): void {
    this.lastUpdate = 0;
    this.frameCount = 0;
    this.totalTime = 0;
  }
}

// Vector operations
export const vectorOps = {
  add: (a: Vector3, b: Vector3): Vector3 => {
    const result = new Vector3();
    return result.addVectors(a, b);
  },

  subtract: (a: Vector3, b: Vector3): Vector3 => {
    const result = new Vector3();
    return result.subVectors(a, b);
  },

  multiply: (v: Vector3, scalar: number): Vector3 => {
    const result = v.clone();
    return result.multiplyScalar(scalar);
  },

  divide: (v: Vector3, scalar: number): Vector3 => {
    const result = v.clone();
    return result.multiplyScalar(1 / scalar);
  },

  length: (v: Vector3): number => 
    v.length(),

  normalize: (v: Vector3): Vector3 => {
    const result = v.clone();
    return result.normalize().clone();
  },

  distance: (a: Vector3, b: Vector3): number => 
    a.distanceTo(b),

};

/**
 * Validates a Vector3 and fixes any invalid values (NaN, Infinity)
 * @param vec The Vector3 to validate
 * @param maxValue Maximum allowed absolute value for any component
 * @param defaultValue Default value to use if the vector is invalid
 * @returns A new Vector3 with valid values
 */
export const validateAndFixVector3 = (
    vec: Vector3, 
    maxValue: number = 1000, 
    defaultValue: Vector3 = new Vector3(0, 0, 0)
): Vector3 => {
    // Check for NaN or Infinity
    if (isNaN(vec.x) || isNaN(vec.y) || isNaN(vec.z) ||
        !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z)) {
        // Return a copy of the default value
        return defaultValue.clone();
    }
    
    // Check for values exceeding maximum
    if (Math.abs(vec.x) > maxValue || Math.abs(vec.y) > maxValue || Math.abs(vec.z) > maxValue) {
        // Clamp values to the maximum
        return new Vector3(
            Math.max(-maxValue, Math.min(maxValue, vec.x)),
            Math.max(-maxValue, Math.min(maxValue, vec.y)),
            Math.max(-maxValue, Math.min(maxValue, vec.z))
        );
    }
    
    return vec.clone();
};

// Scale utilities
export const scaleOps = {
  // Normalize a value between min and max
  normalize: (value: number, min: number, max: number): number => {
    return Math.min(max, Math.max(min, value));
  },

  // Map a value from one range to another
  mapRange: (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    // First normalize to 0-1
    const normalized = (value - inMin) / (inMax - inMin);
    // Then map to output range
    return outMin + normalized * (outMax - outMin);
  },

  // Scale node size from server range to visualization range
  normalizeNodeSize: (size: number, serverMin: number = 20, serverMax: number = 30, visMin: number = 0.15, visMax: number = 0.4): number => {
    return scaleOps.mapRange(size, serverMin, serverMax, visMin, visMax);
  }
};

// Data validation utilities
export const validateGraphData = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;
  
  // Validate nodes
  for (const node of data.nodes) {
    if (!node.id) return false;
    // Allow position to be either array or Vector3
    if (node.position) {
      if (Array.isArray(node.position)) {
        if (node.position.length !== 3 || 
            typeof node.position[0] !== 'number' ||
            typeof node.position[1] !== 'number' ||
            typeof node.position[2] !== 'number') {
          return false;
        }
      } else if (typeof node.position === 'object') {
        if (typeof node.position.x !== 'number' ||
            typeof node.position.y !== 'number' ||
            typeof node.position.z !== 'number') {
          return false;
        }
      } else {
        return false;
      }
    }
  }
  
  // Validate edges
  for (const edge of data.edges) {
    if (!edge.source || !edge.target) return false;
  }
  
  return true;
};

// Binary data helpers
export const binaryToFloat32Array = (buffer: ArrayBuffer): Float32Array => {
  return new Float32Array(buffer);
};

export const float32ArrayToPositions = (array: Float32Array): Vector3[] => {
  const positions: Vector3[] = [];
  for (let i = 0; i < array.length; i += 3) {
    positions.push(new Vector3(array[i], array[i + 1], array[i + 2]));
  }
  return positions;
};

// Error handling utility
export class VisualizationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'VisualizationError';
  }
}

// Performance monitoring
export class PerformanceMonitor {
  private logger = createLogger('Performance');
  private metrics: Map<string, number> = new Map();
  private operations: Map<string, { startTime: number, count: number, totalTime: number }> = new Map();

  public startOperation(name: string): void {
    if (debugState.getState().enablePerformanceDebug) {
      this.metrics.set(name, performance.now());
      
      // Initialize operation stats if not exists
      if (!this.operations.has(name)) {
        this.operations.set(name, { startTime: 0, count: 0, totalTime: 0 });
      }
    }
  }

  public endOperation(name: string): void {
    if (debugState.getState().enablePerformanceDebug) {
      const startTime = this.metrics.get(name);
      if (startTime) {
        const duration = performance.now() - startTime;
        this.metrics.delete(name);
        
        // Update operation stats
        const stats = this.operations.get(name);
        if (stats) {
          stats.count++;
          stats.totalTime += duration;
          
          this.logger.performance(`Operation: ${name}`, {
            duration,
            avgDuration: stats.totalTime / stats.count,
            count: stats.count,
            operation: 'measure'
          });
        }
      }
    }
  }

  public reset(): void {
    this.metrics.clear();
    this.operations.clear();
  }
}
