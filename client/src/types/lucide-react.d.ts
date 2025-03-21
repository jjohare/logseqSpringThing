declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';

  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
  }

  export type Icon = FC<IconProps>;

  // Export all icons that are used in the project
  export const X: Icon;
  export const Minimize: Icon;
  export const Maximize: Icon;
  export const ChevronDown: Icon;
  export const ChevronUp: Icon;
  export const Dock: Icon;
  export const Eye: Icon;
  export const Circle: Icon;
  export const CircleDashed: Icon;
  export const BrushIcon: Icon;
  export const MoveHorizontal: Icon;
  
  // Additional icons used in PanelManager
  export const Settings: Icon;
  export const LayoutGrid: Icon;
  export const RefreshCw: Icon;
  export const Terminal: Icon;
  export const Smartphone: Icon;
  export const MonitorSmartphone: Icon;
  
  // Add any other icons that might be used in your project
  // This is not an exhaustive list, just including the ones I've seen so far
}