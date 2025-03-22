import * as THREE from 'three';
import React from 'react';

declare module '@react-three/fiber' {
  // Core React Three Fiber hooks and components
  export function Canvas(props: any): JSX.Element;
  export function useThree(): {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    size: { width: number; height: number };
    viewport: { width: number; height: number; factor: number };
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    clock: THREE.Clock;
    // Add other context properties as needed
  };
  export function useFrame(callback: (state: any, delta: number) => void, renderPriority?: number): void;

  // Extend mesh props for better TypeScript integration with jsx-runtime
  export interface MeshProps {
    color?: string | number | THREE.Color;
    wireframe?: boolean;
    transparent?: boolean;
    opacity?: number;
    side?: typeof THREE.FrontSide | typeof THREE.BackSide | typeof THREE.DoubleSide;
    emissive?: string | number | THREE.Color;
    emissiveIntensity?: number;
    depthWrite?: boolean;
    roughness?: number;
    thickness?: number;
    transmission?: number;
    distortion?: number;
    temporalDistortion?: number;
    clearcoat?: number;
    attenuationDistance?: number;
    attenuationColor?: string | number | THREE.Color;
    ref?: React.Ref<any>;
  }

  export interface ExtendedColors<T> {
    color?: string | number | THREE.Color;
    emissive?: string | number | THREE.Color;
    // Add other color properties as needed
  }
}

// Define MeshTransmissionMaterial props
declare module '@react-three/drei' {
  export interface MeshTransmissionMaterialProps {
    transmissionSampler?: boolean;
    backside?: boolean;
    samples?: number;
    resolution?: number;
    transmission?: number;
    roughness?: number;
    thickness?: number;
    ior?: number;
    chromaticAberration?: number;
    anisotropy?: number;
    distortion?: number;
    distortionScale?: number;
    temporalDistortion?: number;
    clearcoat?: number;
    attenuationDistance?: number;
    attenuationColor?: string | number | THREE.Color;
    color?: string | number | THREE.Color;
    bg?: string | number | THREE.Color;
  }

  export type MeshTransmissionMaterialType = THREE.Material & {
    // Add specific props of the material implementation if needed
  };
}