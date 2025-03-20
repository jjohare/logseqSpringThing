import { Settings, SettingsPath, SettingsValue } from './base';

// Settings categories
export type SettingsCategory = keyof Settings;

// Re-export base types
export type { SettingsPath, SettingsValue };

/**
 * Get all possible setting paths from a settings object
 */
export function getAllSettingPaths(settings: Partial<Settings>): string[] {
    const paths: string[] = [];

    function traverse(obj: any, path: string = '') {
        if (!obj || typeof obj !== 'object') return;

        Object.entries(obj).forEach(([key, value]) => {
            const currentPath = path ? `${path}.${key}` : key;
            paths.push(currentPath);

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                traverse(value, currentPath);
            }
        });
    }

    traverse(settings);
    return paths;
}

/**
 * Format a setting path into a human-readable name
 */
export function formatSettingName(path: string): string {
    return path
        .split('.')
        .pop()!
        .split(/(?=[A-Z])|[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Get the appropriate step value for a numeric setting
 */
export function getStepValue(path: SettingsPath): string {
    // Physics settings need finer control
    if (path.includes('physics.attractionStrength') || 
        path.includes('physics.repulsionStrength') ||
        path.includes('physics.springStrength')) {
        return '0.001';
    }

    // Opacity and other normalized values
    if (path.includes('opacity') || 
        path.includes('metalness') || 
        path.includes('roughness')) {
        return '0.01';
    }

    // Size related settings
    if (path.includes('Size') || path.includes('scale')) {
        return '0.1';
    }

    // Animation speeds
    if (path.includes('speed') || path.includes('strength')) {
        return '0.05';
    }

    // Default step value
    return '1';
}

/**
 * Get the appropriate min/max values for a numeric setting
 */
export function getValueRange(path: SettingsPath): [number, number] {
    // Physics settings
    if (path.includes('physics.attractionStrength') || 
        path.includes('physics.repulsionStrength') ||
        path.includes('physics.springStrength')) {
        return [0, 2];
    }

    // Normalized values
    if (path.includes('opacity') || 
        path.includes('metalness') || 
        path.includes('roughness')) {
        return [0, 1];
    }

    // Size related settings
    if (path.includes('Size') || path.includes('scale')) {
        return [0.1, 10];
    }

    // Animation speeds
    if (path.includes('speed')) {
        return [0, 5];
    }

    // Strength values
    if (path.includes('strength')) {
        return [0, 2];
    }

    // Default range
    return [0, 100];
}

/**
 * Get the appropriate input type for a setting
 */
export function getInputType(path: SettingsPath, value: SettingsValue): string {
    // Handle specific path cases
    if (path.endsWith('.mode') || 
        path.endsWith('.spaceType') || 
        path.endsWith('.quality')) {
        return 'select';
    }

    // Handle value type cases
    if (typeof value === 'boolean') {
        return 'toggle';
    }

    if (typeof value === 'number') {
        return 'slider';
    }

    if (typeof value === 'string' && value.startsWith('#')) {
        return 'color';
    }

    if (Array.isArray(value)) {
        if (value.length === 2 && value.every(v => typeof v === 'number')) {
            return 'range';
        }
        return 'array';
    }

    return 'text';
}

/**
 * Get select options for a setting
 */
export function getSelectOptions(path: SettingsPath): string[] {
    if (path.endsWith('.mode')) {
        return ['immersive-ar', 'immersive-vr'];
    }

    if (path.endsWith('.spaceType')) {
        return ['viewer', 'local', 'local-floor', 'bounded-floor', 'unbounded'];
    }

    if (path.endsWith('.quality')) {
        return ['low', 'medium', 'high'];
    }

    return [];
}

/**
 * Check if a setting should be considered advanced
 */
export function isAdvancedSetting(path: SettingsPath): boolean {
    const advancedPatterns = [
        /physics\./,
        /rendering\.(?!quality|backgroundColour)/,
        /system\./,
        /debug\./,
        /enableInstancing/,
        /enableMetadata/,
        /compression/,
        /binary/
    ];

    return advancedPatterns.some(pattern => pattern.test(path));
}

/**
 * Get a setting value by path
 */
export function getSettingValue(settings: Settings, path: SettingsPath): SettingsValue | undefined {
    const parts = path.split('.');
    let current: any = settings;

    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }

    return current;
}

/**
 * Set a setting value by path
 */
export function setSettingValue(settings: Settings, path: SettingsPath, value: SettingsValue): void {
    const parts = path.split('.');
    let current: any = settings;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
            current[part] = {};
        }
        current = current[part];
    }

    current[parts[parts.length - 1]] = value;
}

/**
 * Check if a setting path is valid
 */
export function isValidSettingPath(settings: Settings, path: SettingsPath): boolean {
    return getSettingValue(settings, path) !== undefined;
}

/**
 * Format a setting value for display
 */
export function formatSettingValue(value: SettingsValue): string {
    if (typeof value === 'number') {
        // Use more decimal places for small values
        return value < 1 ? value.toFixed(3) : value.toFixed(1);
    }

    if (typeof value === 'boolean') {
        return value ? 'Enabled' : 'Disabled';
    }

    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return String(value);
}
