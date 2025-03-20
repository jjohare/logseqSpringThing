import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
/**
 * Merges class names with Tailwind CSS classes
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
/**
 * Format a setting name for display (convert camelCase to Title Case)
 */
export function formatSettingName(name) {
    // Handle special case acronyms (e.g., "XR" should remain uppercase)
    if (name === 'xr')
        return 'XR';
    // Replace camelCase with spaces
    const spacedName = name.replace(/([A-Z])/g, ' $1').trim();
    // Capitalize first letter of each word
    return spacedName.charAt(0).toUpperCase() + spacedName.slice(1);
}
/**
 * Check if a value is defined (not undefined and not null)
 */
export function isDefined(value) {
    return value !== undefined && value !== null;
}
/**
 * Debounce a function call
 */
export function debounce(func, wait) {
    let timeout = null;
    return function (...args) {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}
/**
 * Truncate a string to the specified length
 */
export function truncate(str, length) {
    if (str.length <= length) {
        return str;
    }
    return str.slice(0, length) + '...';
}
