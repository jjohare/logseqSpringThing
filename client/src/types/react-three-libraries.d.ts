declare module '@react-three/drei' {
  import { ReactNode } from 'react';
  
  export const OrbitControls: React.FC<{
    enableDamping?: boolean;
    dampingFactor?: number;
    screenSpacePanning?: boolean;
    minDistance?: number;
    maxDistance?: number;
    enableRotate?: boolean;
    enableZoom?: boolean;
    enablePan?: boolean;
    rotateSpeed?: number;
    zoomSpeed?: number;
    panSpeed?: number;
    [key: string]: any;
  }>;
  
  export const Stats: React.FC<any>;
}

declare module '@react-three/xr' {
  import { ReactNode } from 'react';
  
  export const XR: React.FC<{
    children?: ReactNode;
    referenceSpace?: string;
    [key: string]: any;
  }>;
}

declare module 'three-stdlib' {
  import * as THREE from 'three';
  
  export class EffectComposer {
    constructor(renderer: any);
    addPass(pass: any): void;
    render(): void;
    dispose?(): void;
  }
  
  export class RenderPass {
    constructor(scene: any, camera: any);
  }
  
  export class UnrealBloomPass {
    constructor(resolution: any, strength: any, radius: any, threshold: any);
  }
}