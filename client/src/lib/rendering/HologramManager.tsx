import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSettingsStore } from '../stores/settings-store';
import { createLogger } from '../utils/logger';
import { HologramMaterial } from './materials/HologramMaterial';

const logger = createLogger('HologramManager');

// Component for an individual hologram ring
export const HologramRing: React.FC<{
  size?: number;
  color?: string | THREE.Color | number;
  opacity?: number;
  rotationAxis?: [number, number, number];
  rotationSpeed?: number;
  segments?: number;
}> = ({
  size = 1,
  color = '#00ffff',
  opacity = 0.7,
  rotationAxis = [0, 1, 0],
  rotationSpeed = 0.5,
  segments = 64
}) => {
  const ringRef = useRef<THREE.Mesh>(null);
  
  // Animate ring rotation
  useFrame((_, delta) => {
    if (ringRef.current && rotationSpeed > 0) {
      ringRef.current.rotation.x += delta * rotationSpeed * rotationAxis[0];
      ringRef.current.rotation.y += delta * rotationSpeed * rotationAxis[1];
      ringRef.current.rotation.z += delta * rotationSpeed * rotationAxis[2];
    }
  });
  
  return (
    <mesh ref={ringRef}>
      <ringGeometry args={[size * 0.8, size, segments]} />
      <HologramMaterial color={color} opacity={opacity} />
    </mesh>
  );
};

// Component for a hologram sphere
export const HologramSphere: React.FC<{
  size?: number;
  color?: string | THREE.Color | number;
  opacity?: number;
  detail?: number;
  wireframe?: boolean;
  rotationSpeed?: number;
}> = ({
  size = 1,
  color = '#00ffff',
  opacity = 0.5,
  detail = 1,
  wireframe = true,
  rotationSpeed = 0.2
}) => {
  const sphereRef = useRef<THREE.Mesh>(null);
  
  // Animate sphere rotation
  useFrame((_, delta) => {
    if (sphereRef.current && rotationSpeed > 0) {
      sphereRef.current.rotation.y += delta * rotationSpeed;
    }
  });
  
  return (
    <mesh ref={sphereRef}>
      <icosahedronGeometry args={[size, detail]} />
      <HologramMaterial color={color} opacity={opacity} edgeOnly={wireframe} />
    </mesh>
  );
};

// Main HologramManager component that manages multiple hologram elements
export const HologramManager: React.FC<{
  position?: [number, number, number];
  isXRMode?: boolean;
}> = ({
  position = [0, 0, 0],
  isXRMode = false
}) => {
  const settings = useSettingsStore(state => state.settings?.visualization?.hologram);
  const groupRef = useRef<THREE.Group>(null);
  
  // Parse sphere sizes from settings
  const sphereSizes: number[] = React.useMemo(() => {
    if (!settings?.sphereSizes) return [40, 80];
    
    if (typeof settings.sphereSizes === 'string') {
      // Parse from string format like "40.0, 80.0"
      return settings.sphereSizes.split(',').map(s => parseFloat(s.trim()));
    } else if (Array.isArray(settings.sphereSizes)) {
      return settings.sphereSizes;
    }
    
    return [40, 80];
  }, [settings?.sphereSizes]);
  
  // Set layers for bloom effect
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.layers.set(0); // Default layer
      groupRef.current.layers.enable(1); // Bloom layer
      
      // Apply to all children
      groupRef.current.traverse(child => {
        child.layers.set(0);
        child.layers.enable(1);
      });
    }
  }, []);
  
  const quality = isXRMode ? 'high' : 'medium';
  const color: string | number = settings?.color || '#00ffff';
  const opacity = settings?.ringOpacity !== undefined ? settings.ringOpacity : 0.7;
  const rotationSpeed = settings?.ringRotationSpeed !== undefined ? settings.ringRotationSpeed : 0.5;
  const enableTriangleSphere = settings?.enableTriangleSphere !== false;
  const triangleSphereSize = settings?.triangleSphereSize || 60;
  const triangleSphereOpacity = settings?.triangleSphereOpacity || 0.3;

  return (
    <group ref={groupRef} position={position}>
      {/* Render rings based on settings */}
      {sphereSizes.map((size, index) => (
        <HologramRing 
          key={`ring-${index}`}
          size={size / 100} // Convert to meters
          color={color}
          opacity={opacity}
          rotationAxis={[
            Math.cos(index * Math.PI / 3), 
            Math.sin(index * Math.PI / 3), 
            0.5
          ]}
          rotationSpeed={rotationSpeed * (0.8 + index * 0.2)}
          segments={quality === 'high' ? 64 : 32}
        />
      ))}
      
      {/* Render triangle sphere if enabled */}
      {enableTriangleSphere && (
        <HologramSphere 
          size={triangleSphereSize / 100} // Convert to meters
          color={color}
          opacity={triangleSphereOpacity}
          detail={quality === 'high' ? 2 : 1}
          wireframe={true}
        />
      )}
    </group>
  );
};

// A composite hologram component for easy use
export const Hologram: React.FC<{
  position?: [number, number, number];
  color?: string | THREE.Color | number;
  size?: number;
  children?: React.ReactNode;
}> = ({
  position = [0, 0, 0],
  color = '#00ffff',
  size = 1,
  children
}) => {
  return (
    <group position={position} scale={size}>
      {children}
      <HologramManager />
    </group>
  );
};

// Class-based wrapper for non-React usage (similar to the old implementation)
export class HologramManagerClass {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private ringInstances: THREE.Mesh[] = [];
  private sphereInstances: THREE.Mesh[] = [];
  private isXRMode: boolean = false;
  private settings: any;
  
  constructor(scene: THREE.Scene, settings: any) {
    this.scene = scene;
    this.settings = settings;
    this.group = new THREE.Group();
    
    // Enable bloom layer
    this.group.layers.set(0);
    this.group.layers.enable(1);
    
    this.createHolograms();
    this.scene.add(this.group);
  }
  
  private createHolograms() {
    // Clear existing holograms
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    
    this.ringInstances = [];
    this.sphereInstances = [];
    
    // Quality based on XR mode
    const quality = this.isXRMode ? 'high' : 'medium';
    const segments = quality === 'high' ? 64 : 32;
    
    // Extract settings
    const hologramSettings = this.settings?.visualization?.hologram || {};
    const color = hologramSettings.color || 0x00ffff;
    const opacity = hologramSettings.ringOpacity !== undefined ? hologramSettings.ringOpacity : 0.7;
    const sphereSizes = Array.isArray(hologramSettings.sphereSizes) 
      ? hologramSettings.sphereSizes 
      : [40, 80];
    
    // Create ring instances
    sphereSizes.forEach((size, index) => {
      const geometry = new THREE.RingGeometry(size * 0.8 / 100, size / 100, segments);
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      const ring = new THREE.Mesh(geometry, material);
      
      // Set random rotation
      ring.rotation.x = Math.PI / 3 * index;
      ring.rotation.y = Math.PI / 6 * index;
      
      // Enable bloom layer
      ring.layers.set(0);
      ring.layers.enable(1);
      
      this.ringInstances.push(ring);
      this.group.add(ring);
    });
    
    // Create triangle sphere if enabled
    if (hologramSettings.enableTriangleSphere) {
      const size = hologramSettings.triangleSphereSize || 60;
      const sphereOpacity = hologramSettings.triangleSphereOpacity || 0.3;
      const detail = quality === 'high' ? 2 : 1;
      
      const geometry = new THREE.IcosahedronGeometry(size / 100, detail);
      const material = new THREE.MeshBasicMaterial({
        color: color,
        wireframe: true,
        transparent: true,
        opacity: sphereOpacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      
      // Enable bloom layer
      sphere.layers.set(0);
      sphere.layers.enable(1);
      
      this.sphereInstances.push(sphere);
      this.group.add(sphere);
    }
  }
  
  setXRMode(enabled: boolean) {
    this.isXRMode = enabled;
    this.createHolograms();
  }
  
  update(deltaTime: number) {
    // Get rotation speed from settings
    const rotationSpeed = this.settings?.visualization?.hologram?.ringRotationSpeed || 0.5;
    
    // Update ring rotations
    this.ringInstances.forEach((ring, index) => {
      // Each ring rotates at a different speed
      const speed = rotationSpeed * (1 + index * 0.2);
      ring.rotation.y += deltaTime * speed;
    });
    
    // Update sphere rotations
    this.sphereInstances.forEach((sphere) => {
      sphere.rotation.y += deltaTime * rotationSpeed * 0.5;
    });
  }
  
  updateSettings(newSettings: any) {
    this.settings = newSettings;
    this.createHolograms();
  }
  
  getGroup() {
    return this.group;
  }
  
  dispose() {
    this.scene.remove(this.group);
    
    // Dispose geometries and materials
    this.ringInstances.forEach(ring => {
      ring.geometry.dispose();
      if (Array.isArray(ring.material)) {
        ring.material.forEach(m => m.dispose());
      } else {
        ring.material.dispose();
      }
    });
    
    this.sphereInstances.forEach(sphere => {
      sphere.geometry.dispose();
      if (Array.isArray(sphere.material)) {
        sphere.material.forEach(m => m.dispose());
      } else {
        sphere.material.dispose();
      }
    });
    
    this.ringInstances = [];
    this.sphereInstances = [];
  }
}

export default HologramManager;