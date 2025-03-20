import { Vector3 } from 'three';

/**
 * Create a Vector3 from x,y,z components
 */
export function createVector3(x: number, y: number, z: number): Vector3 {
    return new Vector3(x, y, z);
}

/**
 * Create a zero Vector3
 */
export function zeroVector3(): Vector3 {
    return new Vector3(0, 0, 0);
}

/**
 * Convert object with x,y,z properties to Vector3
 */
export function objectToVector3(obj: { x: number; y: number; z: number }): Vector3 {
    return new Vector3(obj.x, obj.y, obj.z);
}

/**
 * Convert Vector3 to object with x,y,z properties (for logging/serialization)
 */
export function vector3ToObject(vec: Vector3): { x: number; y: number; z: number } {
    return { x: vec.x, y: vec.y, z: vec.z };
}

/**
 * Clamp a Vector3's components between min and max values
 */
export function clampVector3(vec: Vector3, min: number, max: number): Vector3 {
    return new Vector3(
        Math.max(min, Math.min(max, vec.x)),
        Math.max(min, Math.min(max, vec.y)),
        Math.max(min, Math.min(max, vec.z))
    );
}

/**
 * Check if a Vector3 has valid components (finite, non-NaN)
 */
export function isValidVector3(vec: Vector3): boolean {
    return !isNaN(vec.x) && !isNaN(vec.y) && !isNaN(vec.z) &&
           isFinite(vec.x) && isFinite(vec.y) && isFinite(vec.z);
}

/**
 * Compare two Vector3s for equality within a small epsilon
 */
export function vector3Equals(a: Vector3, b: Vector3, epsilon: number = 0.000001): boolean {
    return Math.abs(a.x - b.x) < epsilon &&
           Math.abs(a.y - b.y) < epsilon &&
           Math.abs(a.z - b.z) < epsilon;
}
