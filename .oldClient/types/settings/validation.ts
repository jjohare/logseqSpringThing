import { Settings } from './base';
import { nostrAuth } from '../../services/NostrAuthService';

export interface ValidationError {
    path: string;
    message: string;
    value?: any;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

interface ValidationRule {
    validate: (value: any) => boolean;
    message: string;
}

const validationRules: Record<string, Record<string, ValidationRule>> = {
    visualization: {
        'nodes.sizeRange': {
            validate: (value: [number, number]) => 
                Array.isArray(value) && 
                value.length === 2 && 
                value[0] >= 0.01 && value[0] <= 0.5 &&  // 1cm to 50cm
                value[1] >= value[0] && value[1] <= 0.5,
            message: 'Node size range must be between 0.01m and 0.5m (1cm to 50cm), with min <= max'
        },
        'nodes.opacity': {
            validate: (value: number) => value >= 0 && value <= 1,
            message: 'Opacity must be between 0 and 1'
        },
        'nodes.metalness': {
            validate: (value: number) => value >= 0 && value <= 1,
            message: 'Metalness must be between 0 and 1'
        },
        'nodes.roughness': {
            validate: (value: number) => value >= 0 && value <= 1,
            message: 'Roughness must be between 0 and 1'
        },
        'edges.baseWidth': {
            validate: (value: number) => value >= 0.001 && value <= 0.02,  // 1mm to 20mm
            message: 'Edge width must be between 0.001m and 0.02m (1mm to 20mm)'
        },
        'edges.widthRange': {
            validate: (value: [number, number]) => 
                Array.isArray(value) && 
                value.length === 2 && 
                value[0] >= 0.001 && value[0] <= 0.02 &&  // 1mm to 20mm
                value[1] >= value[0] && value[1] <= 0.02,
            message: 'Edge width range must be between 0.001m and 0.02m (1mm to 20mm), with min <= max'
        },
        'edges.arrowSize': {
            validate: (value: number) => value >= 0.005 && value <= 0.05,  // 5mm to 50mm
            message: 'Arrow size must be between 0.005m and 0.05m (5mm to 50mm)'
        },
        'physics.attractionStrength': {
            validate: (value: number) => value >= 0 && value <= 1.0,
            message: 'Attraction strength must be between 0 and 100cm/s²'
        },
        'physics.repulsionStrength': {
            validate: (value: number) => value >= 0 && value <= 0.5,
            message: 'Repulsion strength must be between 0 and 50cm/s² (before 1/d² falloff)'
        },
        'physics.springStrength': {
            validate: (value: number) => value >= 0 && value <= 1.0,
            message: 'Spring strength must be between 0 and 100cm/s² per meter'
        },
        'physics.repulsionDistance': {
            validate: (value: number) => value >= 0.2 && value <= 1.0,  // 20cm to 1m
            message: 'Repulsion distance must be between 20cm and 1m'
        },
        'physics.collisionRadius': {
            validate: (value: number) => value >= 0.01 && value <= 0.2,  // 1cm to 20cm
            message: 'Collision radius must be between 1cm and 20cm'
        },
        'physics.boundsSize': {
            validate: (value: number) => value >= 0.5 && value <= 5.0,  // 50cm to 5m
            message: 'Bounds size (half-width) must be between 50cm and 5m'
        },
        'physics.massScale': {
            validate: (value: number) => value >= 0 && value <= 10,
            message: 'Mass scale must be between 0 and 10'
        },
        'physics.boundaryDamping': {
            validate: (value: number) => value >= 0 && value <= 1,
            message: 'Boundary damping (velocity retention) must be between 0% and 100%'
        },
        'hologram.sphereSizes': {
            validate: (value: number[]) => 
                Array.isArray(value) && 
                value.every(size => size >= 0.02 && size <= 0.5) &&  // 2cm to 50cm
                value.length >= 1,
            message: 'Hologram sphere sizes must be between 0.02m and 0.5m (2cm to 50cm)'
        },
        'hologram.triangleSphereSize': {
            validate: (value: number) => value >= 0.02 && value <= 0.5,  // 2cm to 50cm
            message: 'Triangle sphere size must be between 0.02m and 0.5m (2cm to 50cm)'
        },
        'hologram.buckminsterSize': {
            validate: (value: number) => value >= 0 && value <= 0.5,  // 0 to 50cm
            message: 'Buckminster size must be between 0m and 0.5m (0 to 50cm)'
        },
        'hologram.geodesicSize': {
            validate: (value: number) => value >= 0 && value <= 0.5,  // 0 to 50cm
            message: 'Geodesic size must be between 0m and 0.5m (0 to 50cm)'
        }
    },
    xr: {
        'roomScale': {
            validate: (value: number) => value >= 0.1 && value <= 2.0,
            message: 'Room scale must be between 0.1 and 2.0 (prefer 1.0 for real-world scale)'
        },
        'handPointSize': {
            validate: (value: number) => value >= 0.001 && value <= 0.02,  // 1mm to 20mm
            message: 'Hand point size must be between 0.001m and 0.02m (1mm to 20mm)'
        },
        'handRayWidth': {
            validate: (value: number) => value >= 0.001 && value <= 0.01,  // 1mm to 10mm
            message: 'Hand ray width must be between 0.001m and 0.01m (1mm to 10mm)'
        },
        'interactionRadius': {
            validate: (value: number) => value >= 0.05 && value <= 0.5,  // 5cm to 50cm
            message: 'Interaction radius must be between 0.05m and 0.5m (5cm to 50cm)'
        },
        'portalSize': {
            validate: (value: number) => value >= 0.5 && value <= 5.0,  // 50cm to 5m
            message: 'Portal size must be between 0.5m and 5.0m'
        },
        'portalEdgeWidth': {
            validate: (value: number) => value >= 0.005 && value <= 0.05,  // 5mm to 50mm
            message: 'Portal edge width must be between 0.005m and 0.05m (5mm to 50mm)'
        }
    }
};

// Define settings that require specific permissions
const restrictedSettings: Record<string, string[]> = {
    perplexity: ['perplexity'],
    openai: ['openai'],
    ragflow: ['ragflow'],
    power_user: [
        'system.advanced',
        'visualization.physics.advanced',
        'visualization.rendering.advanced'
    ]
};

function validatePermissions(path: string): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Check if user is authenticated
    if (!nostrAuth.isAuthenticated()) {
        // Unauthenticated users can only access basic settings
        if (Object.values(restrictedSettings).flat().some(prefix => path.startsWith(prefix))) {
            errors.push({
                path,
                message: 'This setting requires authentication'
            });
        }
        return errors;
    }
    
    // Check feature-specific permissions
    Object.entries(restrictedSettings).forEach(([feature, paths]) => {
        if (paths.some(prefix => path.startsWith(prefix)) && !nostrAuth.hasFeatureAccess(feature)) {
            errors.push({
                path,
                message: `This setting requires ${feature} access`
            });
        }
    });
    
    return errors;
}

export function validateSettings(settings: Partial<Settings>): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Recursively validate all settings
    function validateObject(obj: any, path: string = '') {
        if (!obj || typeof obj !== 'object') return;
        
        Object.entries(obj).forEach(([key, value]) => {
            const currentPath = path ? `${path}.${key}` : key;
            
            // Check permissions first
            const permissionErrors = validatePermissions(currentPath);
            if (permissionErrors.length > 0) {
                errors.push(...permissionErrors);
            }
            
            // Check if there's a validation rule for this path
            for (const [category, rules] of Object.entries(validationRules)) {
                if (currentPath.startsWith(category)) {
                    const rule = rules[currentPath];
                    if (rule && !rule.validate(value)) {
                        errors.push({
                            path: currentPath,
                            message: rule.message,
                            value
                        });
                    }
                }
            }
            
            // Recursively validate nested objects
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                validateObject(value, currentPath);
            }
        });
    }
    
    validateObject(settings);
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

export function validateSettingValue(path: string, value: any, currentSettings: Settings): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Check permissions first
    const permissionErrors = validatePermissions(path);
    if (permissionErrors.length > 0) {
        return permissionErrors;
    }
    
    // Find matching validation rule
    for (const [category, rules] of Object.entries(validationRules)) {
        if (path.startsWith(category)) {
            const rule = rules[path];
            if (rule && !rule.validate(value)) {
                errors.push({
                    path,
                    message: rule.message,
                    value
                });
            }
        }
    }
    
    // Special validation for interdependent settings
    if (path.includes('physics')) {
        validatePhysicsSettings(path, value, currentSettings, errors);
    } else if (path.includes('rendering')) {
        validateRenderingSettings(path, value, currentSettings, errors);
    }
    
    return errors;
}

function validatePhysicsSettings(
    path: string,
    value: any,
    settings: Settings,
    errors: ValidationError[]
): void {
    const physics = settings.visualization.physics;
    
    // Validate repulsion distance relative to collision radius
    if (path === 'visualization.physics.repulsionDistance' && physics.collisionRadius) {
        const ratio = value / physics.collisionRadius;
        if (ratio < 4 || ratio > 10) {
            errors.push({
                path,
                message: 'Repulsion distance should be 4-10x the collision radius for stable spacing',
                value
            });
        }
    }
}

function validateRenderingSettings(
    path: string,
    value: any,
    settings: Settings,
    errors: ValidationError[]
): void {
    const rendering = settings.visualization.rendering;
    
    // Example: Warn about performance impact of combined settings
    if (path === 'visualization.rendering.quality' && value === 'high') {
        if (rendering.enableShadows && rendering.enableAmbientOcclusion) {
            errors.push({
                path,
                message: 'High quality with shadows and ambient occlusion may impact performance',
                value
            });
        }
    }
}

export function getValidationTooltip(path: string): string | undefined {
    for (const [category, rules] of Object.entries(validationRules)) {
        if (path.startsWith(category)) {
            const rule = rules[path];
            if (rule) {
                return rule.message;
            }
        }
    }
    return undefined;
}