/**
 * Types for the control panel components
 */

// Setting control types
export type SettingControlType = 'slider' | 'toggle' | 'color' | 'select' | 'number' | 'text';

// Setting control interface
export interface SettingControl {
  label: string;
  type: SettingControlType;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}

// Setting value types
export type SettingValue = string | number | boolean | string[] | number[];

// Settings section props
export interface SettingsSectionProps {
  id: string;
  title: string;
  settings: Record<string, SettingControl | Record<string, SettingControl>>;
  advanced?: boolean;
}

// Settings subsection props
export interface SettingsSubsectionProps {
  title: string;
  path: string;
  settings: Record<string, SettingControl> | SettingControl;
}

// Setting control props
export interface SettingControlProps {
  path: string;
  setting: SettingControl;
  value: any;
  onChange: (value: any) => void;
}

// Detachable section props
export interface DetachableSectionProps {
  children: React.ReactNode;
  title: string;
  defaultDetached?: boolean;
  defaultPosition?: { x: number; y: number };
}