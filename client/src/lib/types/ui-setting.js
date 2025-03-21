/**
 * Type definitions for UI settings as actually used in components
 */
/**
 * Type guard to check if an object is a valid setting control
 */
export function isUISetting(obj) {
    return obj && typeof obj === 'object' && 'type' in obj;
}
