/**
 * Type definitions for UI settings as actually used in components
 */

/**
 * Interface for settings that can be controlled through UI components
 * This represents the runtime structure of settings as they appear in the components
 */
export interface UISetting {
  type: string;
  id?: string;
  label?: string;
  description?: string;
  help?: string;
  value?: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  advanced?: boolean;
}

/**
 * Type guard to check if an object is a valid setting control
 */
export function isUISetting(obj: any): obj is UISetting {
  return obj && typeof obj === 'object' && 'type' in obj;
}