import React, { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { HologramManager, HologramRing, HologramSphere } from '../lib/rendering/HologramManager';
import { useSettingsStore } from '../lib/stores/settings-store';

interface HologramVisualizationProps {
  position?: [number, number, number];
  size?: number;
  standalone?: boolean;
  children?: React.ReactNode;
}

/**
 * HologramVisualization - A component that renders a hologram visualization
 * using the modern approach based on @react-three/fiber and @react-three/drei
 * 
 * Can be used in two ways:
 * 1. As a standalone component with its own canvas (standalone=true)
 * 2. As a component inside an existing canvas (standalone=false)
 */
export const HologramVisualization: React.FC<HologramVisualizationProps> = ({
  position = [0, 0, 0],
  size = 1,
  standalone = true,
  children
}) => {
  const settings = useSettingsStore(state => state.settings?.visualization?.hologram);
  
  // Content that's rendered inside the hologram
  const HologramContent = () => (
    <group position={position} scale={size}>
      {children || (
        <>
          {/* Default content if no children provided */}
          <HologramManager />
          
          {/* Optional additional content */}
          <mesh position={[0, 0, 0]}>
            <icosahedronGeometry args={[0.4, 1]} />
            <meshStandardMaterial 
              color={settings?.color || '#00ffff'} 
              emissive={settings?.color || '#00ffff'}
              emissiveIntensity={0.5}
              transparent
              opacity={0.7}
            />
          </mesh>
        </>
      )}
    </group>
  );
  
  // For standalone use, provide a Canvas
  if (standalone) {
    return (
      <div className="w-full h-full" style={{ minHeight: '300px' }}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <HologramContent />
          <OrbitControls enableDamping dampingFactor={0.1} />
        </Canvas>
      </div>
    );
  }
  
  // For embedded use, just render the content
  return <HologramContent />;
};

/**
 * Hologram Overlay - Creates a floating hologram effect for UI elements
 * This component provides a hologram-styled container for regular React components
 */
export const HologramOverlay: React.FC<{
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}> = ({
  children,
  className = '',
  glowColor = '#00ffff'
}) => {
  return (
    <div 
      className={`relative rounded-lg overflow-hidden ${className}`}
      style={{
        background: 'rgba(0, 10, 20, 0.7)',
        boxShadow: `0 0 15px ${glowColor}, inset 0 0 8px ${glowColor}`,
        border: `1px solid ${glowColor}`,
      }}
    >
      {/* Scanline effect */}
      <div 
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(transparent 50%, rgba(0, 255, 255, 0.05) 50%)',
          backgroundSize: '100% 4px',
          animation: 'hologramScanline 1s linear infinite',
        }}
      />
      
      {/* Flickering effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20 z-20"
        style={{
          animation: 'hologramFlicker 4s linear infinite',
        }}
      />
      
      {/* Content */}
      <div className="relative z-30 p-4 text-cyan-400">
        {children}
      </div>
      
      {/* CSS for animations */}
      <style>
        {`
          @keyframes hologramScanline {
            0% {
              transform: translateY(0%);
            }
            100% {
              transform: translateY(100%);
            }
          }
          
          @keyframes hologramFlicker {
            0% { opacity: 0.1; }
            5% { opacity: 0.2; }
            10% { opacity: 0.1; }
            15% { opacity: 0.3; }
            20% { opacity: 0.1; }
            25% { opacity: 0.2; }
            30% { opacity: 0.1; }
            35% { opacity: 0.15; }
            40% { opacity: 0.2; }
            45% { opacity: 0.15; }
            50% { opacity: 0.1; }
            55% { opacity: 0.2; }
            60% { opacity: 0.25; }
            65% { opacity: 0.15; }
            70% { opacity: 0.2; }
            75% { opacity: 0.1; }
            80% { opacity: 0.15; }
            85% { opacity: 0.1; }
            90% { opacity: 0.2; }
            95% { opacity: 0.15; }
            100% { opacity: 0.1; }
          }
        `}
      </style>
    </div>
  );
};

// Example usage component to demonstrate both 3D and UI hologram effects
export const HologramExample: React.FC = () => {
  return (
    <div className="flex flex-col md:flex-row gap-6 p-6 min-h-screen bg-gray-900">
      {/* 3D Hologram */}
      <div className="flex-1 h-[500px] rounded-lg overflow-hidden">
        <HologramVisualization standalone size={1.2} />
      </div>
      
      {/* UI Hologram */}
      <div className="flex-1 flex items-center justify-center">
        <HologramOverlay className="max-w-md">
          <h2 className="text-xl font-semibold mb-4">Hologram System Status</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Power Level:</span>
              <span>87%</span>
            </div>
            <div className="flex justify-between">
              <span>Signal Strength:</span>
              <span>Optimal</span>
            </div>
            <div className="flex justify-between">
              <span>Data Transmission:</span>
              <span>Active</span>
            </div>
            <div className="w-full h-2 bg-blue-900 mt-4 rounded-full overflow-hidden">
              <div 
                className="h-full bg-cyan-400" 
                style={{ 
                  width: '87%',
                  animation: 'hologramPulse 3s infinite'
                }}
              ></div>
            </div>
          </div>
        </HologramOverlay>
      </div>
      
      {/* Animation for progress bar */}
      <style>
        {`
          @keyframes hologramPulse {
            0% { opacity: 0.8; }
            50% { opacity: 1; }
            100% { opacity: 0.8; }
          }
        `}
      </style>
    </div>
  );
};

export default HologramVisualization;