import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';

/**
 * HologramMaterial - A modern implementation of hologram effects using
 * mainstream libraries like @react-three/drei instead of custom shaders
 */
interface HologramMaterialProps {
  color?: string | number | THREE.Color;
  opacity?: number;
  pulseIntensity?: number;
  edgeOnly?: boolean;
  wireframe?: boolean;
  context?: 'desktop' | 'ar';
  onUpdate?: (material: THREE.Material) => void;
}

export const HologramMaterial: React.FC<HologramMaterialProps> = ({
  color = '#00ffff',
  opacity = 0.7,
  pulseIntensity = 0.2,
  edgeOnly = false,
  wireframe = false,
  context = 'desktop',
  onUpdate
}) => {
  // Create separate refs for different material types
  const basicMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const transmissionMaterialRef = useRef(null); // Use untyped ref for drei components
  const [baseColor] = useState(new THREE.Color(color));
  const [currentTime, setCurrentTime] = useState(0);
  
  // Update material each frame with animation effects
  useFrame((_, delta) => {
    setCurrentTime(prev => prev + delta);
    
    // Apply pulse effect
    const pulse = Math.sin(currentTime * 2.0) * 0.5 + 0.5;
    const pulseEffect = pulse * pulseIntensity;
    
    // Update basic material if it exists
    if (basicMaterialRef.current) {
      const mat = basicMaterialRef.current;
      
      // Update opacity with pulse
      mat.opacity = opacity * (1.0 + pulseEffect * 0.3);
      
      // Update color with pulse
      const brightenFactor = edgeOnly 
        ? 0.5 + pulseEffect * 0.5
        : 0.8 + pulseEffect * 0.3;
      
      // Create pulsing color effect
      const newColor = new THREE.Color().copy(baseColor);
      newColor.r *= brightenFactor;
      newColor.g *= brightenFactor;
      newColor.b *= brightenFactor;
      mat.color.copy(newColor);
      
      // Force material update
      mat.needsUpdate = true;
      
      // Notify parent about updates
      if (onUpdate) {
        onUpdate(mat);
      }
    }
    
    // Update transmission material if it exists
    if (transmissionMaterialRef.current && onUpdate) {
      onUpdate(transmissionMaterialRef.current);
    }
  });
  
  // Choose the appropriate material based on the mode
  if (edgeOnly || wireframe) {
    // For edge-only mode, use a simple material with wireframe
    return (
      <meshBasicMaterial 
        ref={basicMaterialRef}
        color={color}
        wireframe={true}
        transparent={true}
        opacity={opacity}
        side={context === 'ar' ? THREE.FrontSide : THREE.DoubleSide}
        depthWrite={false}
      />
    );
  }
  
  // For full hologram mode, use the more advanced transmission material
  return (
    <MeshTransmissionMaterial
      ref={transmissionMaterialRef}
      color={color}
      roughness={0.2}
      thickness={1.5}
      transmission={0.95}
      transparent={true}
      opacity={opacity}
      distortion={0.4}
      temporalDistortion={0.2}
      distortionScale={0.5}
      attenuationDistance={0.3}
      attenuationColor={color}
      anisotropicBlur={0.5}
      side={context === 'ar' ? THREE.FrontSide : THREE.DoubleSide}
      depthWrite={false}
    />
  );
};

/**
 * Class-based wrapper for non-React usage
 * This provides an API compatible with the old HologramShaderMaterial
 */
export class HologramMaterialClass {
  private material: THREE.Material;
  private baseOpacity: number;
  private baseColor: THREE.Color;
  private pulseIntensity: number;
  private currentTime: number = 0;
  private isEdgeOnlyMode: boolean;
  private updateCallback: (() => void) | null = null;
  
  // Provide compatible uniforms structure for backward compatibility
  public uniforms: {
    time: { value: number };
    opacity: { value: number };
    color: { value: THREE.Color };
    pulseIntensity: { value: number };
    interactionPoint: { value: THREE.Vector3 };
    interactionStrength: { value: number };
    isEdgeOnly: { value: boolean };
  };
  
  constructor(settings?: any, context: 'ar' | 'desktop' = 'desktop') {
    // Extract settings
    const isAR = context === 'ar';
    const opacity = settings?.visualization?.hologram?.opacity ?? 0.7;
    const colorValue = settings?.visualization?.hologram?.color ?? 0x00ffff;
    const colorObj = new THREE.Color(colorValue);
    const pulseIntensity = isAR ? 0.1 : 0.2;
    const edgeOnly = false;
    
    this.baseOpacity = opacity;
    this.baseColor = colorObj.clone();
    this.pulseIntensity = pulseIntensity;
    this.isEdgeOnlyMode = edgeOnly;
    
    // Create appropriate material
    if (edgeOnly) {
      this.material = new THREE.MeshBasicMaterial({
        color: colorObj,
        wireframe: true,
        transparent: true,
        opacity: opacity,
        side: isAR ? THREE.FrontSide : THREE.DoubleSide,
        depthWrite: false
      });
    } else {
      // Use MeshPhysicalMaterial as a replacement for MeshTransmissionMaterial
      // since MeshTransmissionMaterial is a React component
      this.material = new THREE.MeshPhysicalMaterial({
        color: colorObj,
        metalness: 0.1,
        roughness: 0.2,
        transmission: 0.95,
        transparent: true,
        opacity: opacity,
        side: isAR ? THREE.FrontSide : THREE.DoubleSide,
        depthWrite: false,
        attenuationDistance: 0.3,
        attenuationColor: colorObj.clone(),
      });
    }
    
    // Initialize uniforms for API compatibility
    this.uniforms = {
      time: { value: 0 },
      opacity: { value: opacity },
      color: { value: colorObj.clone() },
      pulseIntensity: { value: pulseIntensity },
      interactionPoint: { value: new THREE.Vector3() },
      interactionStrength: { value: 0.0 },
      isEdgeOnly: { value: edgeOnly }
    };
  }
  
  public update(deltaTime: number): void {
    // Update time
    this.currentTime += deltaTime;
    this.uniforms.time.value = this.currentTime;
    
    // Apply pulse effect
    const pulse = Math.sin(this.currentTime * 2.0) * 0.5 + 0.5;
    const pulseEffect = pulse * this.pulseIntensity;
    
    // Update material properties
    if (this.material.type === 'MeshBasicMaterial' || 
        this.material.type === 'MeshPhysicalMaterial') {
      
      // Update opacity
      if ('opacity' in this.material) {
        this.material.opacity = this.baseOpacity * (1.0 + pulseEffect * 0.3);
      }
      
      // Update color
      if ('color' in this.material && this.material.color instanceof THREE.Color) {
        const brightenFactor = this.isEdgeOnlyMode 
          ? 0.5 + pulseEffect * 0.5
          : 0.8 + pulseEffect * 0.3;
        
        // Create pulsing color effect
        const newColor = new THREE.Color().copy(this.baseColor);
        newColor.r *= brightenFactor;
        newColor.g *= brightenFactor;
        newColor.b *= brightenFactor;
        this.material.color.copy(newColor);
      }
      
      // Force material update
      this.material.needsUpdate = true;
    }
    
    // Handle interaction effect
    if (this.uniforms.interactionStrength.value > 0.01) {
      this.uniforms.interactionStrength.value *= 0.95; // Decay interaction effect
    }
    
    // Trigger update callback if exists
    if (this.updateCallback) {
      this.updateCallback();
    }
  }
  
  public handleInteraction(position: THREE.Vector3): void {
    this.uniforms.interactionPoint.value.copy(position);
    this.uniforms.interactionStrength.value = 1.0;
  }
  
  public setEdgeOnly(enabled: boolean): void {
    // Store the state
    this.isEdgeOnlyMode = enabled;
    this.uniforms.isEdgeOnly.value = enabled;
    
    // Update material properties based on mode
    if (enabled && this.material.type !== 'MeshBasicMaterial') {
      // Switch to wireframe material
      const newMaterial = new THREE.MeshBasicMaterial({
        color: this.baseColor,
        wireframe: true,
        transparent: true,
        opacity: this.baseOpacity * 0.8,
        side: this.material.side,
        depthWrite: false
      });
      
      // Replace material
      this.material.dispose();
      this.material = newMaterial;
      this.pulseIntensity = 0.15;
      
    } else if (!enabled && this.material.type !== 'MeshPhysicalMaterial') {
      // Switch to physical material
      const newMaterial = new THREE.MeshPhysicalMaterial({
        color: this.baseColor,
        metalness: 0.1,
        roughness: 0.2,
        transmission: 0.95,
        transparent: true,
        opacity: this.baseOpacity,
        side: this.material.side,
        depthWrite: false,
        attenuationDistance: 0.3,
        attenuationColor: this.baseColor.clone(),
      });
      
      // Replace material
      this.material.dispose();
      this.material = newMaterial;
      this.pulseIntensity = 0.1;
    }
    
    // Update uniform for API compatibility
    this.uniforms.pulseIntensity.value = this.pulseIntensity;
  }
  
  public getMaterial(): THREE.Material {
    return this.material;
  }
  
  public setUpdateCallback(callback: () => void): void {
    this.updateCallback = callback;
  }
  
  public clone(): HologramMaterialClass {
    // Create settings object from current state
    const settings = {
      visualization: {
        hologram: {
          opacity: this.baseOpacity,
          color: this.baseColor.getHex()
        }
      }
    };
    
    // Create new instance
    const clone = new HologramMaterialClass(
      settings, 
      this.material.side === THREE.FrontSide ? 'ar' : 'desktop'
    );
    
    // Copy current state
    clone.isEdgeOnlyMode = this.isEdgeOnlyMode;
    clone.setEdgeOnly(this.isEdgeOnlyMode);
    
    return clone;
  }
  
  public dispose(): void {
    if (this.material) {
      this.material.dispose();
    }
  }
}

// HologramComponent for use with React Three Fiber
export const HologramComponent: React.FC<{
  children?: React.ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color?: string | number | THREE.Color;
  opacity?: number;
  edgeOnly?: boolean;
  rings?: boolean;
  rotationSpeed?: number;
}> = ({
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = '#00ffff',
  opacity = 0.7,
  edgeOnly = false,
  rings = true,
  rotationSpeed = 0.5
}) => {
  // Ref for the group to apply rotation animation
  const groupRef = useRef<THREE.Group>(null);
  
  // Animate rotation
  useFrame((_, delta) => {
    if (groupRef.current && rotationSpeed > 0) {
      groupRef.current.rotation.y += delta * rotationSpeed;
    }
  });
  
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Main hologram content */}
      <group ref={groupRef}>
        {children || (
          // Default sphere if no children provided
          <mesh>
            <icosahedronGeometry args={[1, 1]} />
            <HologramMaterial color={color} opacity={opacity} edgeOnly={edgeOnly} />
          </mesh>
        )}
        
        {/* Rings (optional) */}
        {rings && (
          <>
            <mesh rotation={[Math.PI/2, 0, 0]}>
              <ringGeometry args={[0.8, 1, 32]} />
              <HologramMaterial color={color} opacity={opacity * 0.8} pulseIntensity={0.3} />
            </mesh>
            <mesh rotation={[0, Math.PI/3, Math.PI/3]}>
              <ringGeometry args={[1.2, 1.4, 32]} />
              <HologramMaterial color={color} opacity={opacity * 0.6} pulseIntensity={0.2} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
};

export default HologramComponent;