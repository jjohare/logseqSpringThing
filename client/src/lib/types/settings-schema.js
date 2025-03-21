/**
 * This file defines the schema for the application settings.
 * It provides type definitions, validation rules, and default values
 * for all configurable settings.
 */
// Helper function to format settings labels
export function formatSettingLabel(label) {
    // Replace underscores with spaces
    let formatted = label.replace(/_/g, ' ');
    // Capitalize first letter
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    // Capitalize after spaces
    formatted = formatted.replace(/\s([a-z])/g, function (match) {
        return ' ' + match.toUpperCase();
    });
    return formatted;
}
// Helper for validating setting values against schema
export function validateSetting(schema, value) {
    switch (schema.controlType) {
        case 'text': {
            if (typeof value !== 'string') {
                return { valid: false, error: 'Value must be a string' };
            }
            const validation = schema.validation;
            if (validation?.required && value.trim() === '') {
                return { valid: false, error: 'This field is required' };
            }
            if (validation?.minLength !== undefined && value.length < validation.minLength) {
                return { valid: false, error: `Must be at least ${validation.minLength} characters` };
            }
            if (validation?.maxLength !== undefined && value.length > validation.maxLength) {
                return { valid: false, error: `Must be at most ${validation.maxLength} characters` };
            }
            if (validation?.pattern && !new RegExp(validation.pattern).test(value)) {
                return { valid: false, error: 'Invalid format' };
            }
            return { valid: true };
        }
        case 'number': {
            if (typeof value !== 'number' || isNaN(value)) {
                return { valid: false, error: 'Value must be a number' };
            }
            const { min, max, validation } = schema;
            if (validation?.integer && !Number.isInteger(value)) {
                return { valid: false, error: 'Value must be an integer' };
            }
            if (min !== undefined && value < min) {
                return { valid: false, error: `Value must be at least ${min}` };
            }
            if (max !== undefined && value > max) {
                return { valid: false, error: `Value must be at most ${max}` };
            }
            return { valid: true };
        }
        case 'checkbox': {
            if (typeof value !== 'boolean') {
                return { valid: false, error: 'Value must be a boolean' };
            }
            return { valid: true };
        }
        case 'select': {
            const { options, allowCustom } = schema;
            // If custom values are allowed, just check type
            if (allowCustom) {
                if (typeof value !== 'string' && typeof value !== 'number') {
                    return { valid: false, error: 'Value must be a string or number' };
                }
                return { valid: true };
            }
            // Otherwise, check if value is in options
            const isValid = options.some(option => option.value === value);
            if (!isValid) {
                return { valid: false, error: 'Value must be one of the available options' };
            }
            return { valid: true };
        }
        case 'color': {
            if (typeof value !== 'string') {
                return { valid: false, error: 'Value must be a string' };
            }
            // Simple validation for hex color
            const { format } = schema;
            if (format === 'hex' || !format) {
                const hexRegex = /^#([0-9A-F]{3}){1,2}$/i;
                if (!hexRegex.test(value)) {
                    return { valid: false, error: 'Invalid hex color format' };
                }
            }
            return { valid: true };
        }
        case 'slider': {
            if (typeof value !== 'number' || isNaN(value)) {
                return { valid: false, error: 'Value must be a number' };
            }
            const { min, max } = schema;
            if (value < min) {
                return { valid: false, error: `Value must be at least ${min}` };
            }
            if (value > max) {
                return { valid: false, error: `Value must be at most ${max}` };
            }
            return { valid: true };
        }
        case 'button':
        case 'group':
            // These types don't have values to validate
            return { valid: true };
        default:
            return { valid: false, error: 'Unknown control type' };
    }
}
// Helper to get default value from schema
export function getDefaultValue(schema) {
    if ('defaultValue' in schema) {
        return schema.defaultValue;
    }
    if (schema.controlType === 'group') {
        const groupSchema = schema;
        const defaults = {};
        groupSchema.settings.forEach(setting => {
            defaults[setting.id] = getDefaultValue(setting);
        });
        return defaults;
    }
    return undefined;
}
