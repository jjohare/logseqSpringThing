import * as React from 'react' 
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { XR } from '@react-three/xr'
import * as THREE from 'three'
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib' 
import GraphManager from './GraphManager'
import XRController from '../xr/XRController'
import XRVisualizationConnector from '../XRVisualizationConnector'
import { useSettingsStore } from '../../lib/stores/settings-store'
import { createLogger } from '../../lib/utils/logger'
import { debugState } from '../../lib/utils/debug-state'
 import { useContainerSize } from '../../lib/hooks/useContainerSize';

const { useRef, useEffect, useLayoutEffect, useState } = React

const logger = createLogger('GraphCanvas')

// Composition of post-processing effects
const Effects: React.FC = () => {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<any>() 
  const bloomSettings = useSettingsStore(state => state.settings?.visualization?.bloom)
  
  useEffect(() => {
    // Create effect composer for post-processing
    const composer = new EffectComposer(gl)
    const renderPass = new RenderPass(scene as any, camera as any)
    composer.addPass(renderPass)
    
    // Add bloom effect if enabled in settings
    if (bloomSettings?.enabled) {
      // Use type assertion to avoid TS errors
      const bloomPass = new (UnrealBloomPass as any)(
        new (THREE.Vector2 as any)(size.width, size.height),
        bloomSettings.strength || 1.5,
        bloomSettings.radius || 0.4,
        bloomSettings.threshold || 0.85
      );
      composer.addPass(bloomPass)
    }
    
    composerRef.current = composer
    
    return () => {
      if (composer && composer.dispose) composer.dispose()
    }
  }, [gl, scene, camera, size, bloomSettings])
  
  // Update effects on frame render
  useFrame(() => {
    if (composerRef.current && typeof composerRef.current.render === 'function') {
      try { composerRef.current.render() } catch (e) { /* Ignore rendering errors */ }
    }
  }, 1) // Higher priority than default (0)
  
  return null
}

// Scene setup with lighting and background
const SceneSetup: React.FC = () => {
  const { scene } = useThree()
  const visualSettings = useSettingsStore(state => state.settings?.visualization)
  
  useEffect(() => {
    // Set background color from settings or default
    if (visualSettings?.sceneBackground !== undefined) {
      (scene as any).background = new (THREE.Color as any)(visualSettings.sceneBackground)
    } else {
      (scene as any).background = new (THREE.Color as any)('#000000')
    }
    
    // Setup base lighting if not already present
    if (!scene.children.some(child => child instanceof THREE.AmbientLight)) {
      const ambientLight = new (THREE.AmbientLight as any)('#ffffff', 0.6)
      scene.add(ambientLight)
      
      const directionalLight = new (THREE.DirectionalLight as any)('#ffffff', 0.8)
      const dirLightPos = directionalLight.position;
      dirLightPos.set(1, 1, 1).normalize();
      scene.add(directionalLight)
    }
    
    if (debugState.isEnabled()) {
      logger.info('Scene setup complete')
    }
    
    // Lights are removed with scene automatically, no explicit cleanup needed
  }, [scene, visualSettings])
  
  return null
}

// Camera setup and configuration
const CameraSetup: React.FC = () => {
  const { camera } = useThree()
  const cameraSettings = useSettingsStore(state => state.settings?.visualization?.camera)
  
  useEffect(() => {
    if (!cameraSettings) return
    
    // Apply camera settings with type assertions
    try {
      if (cameraSettings.fov !== undefined) (camera as any).fov = cameraSettings.fov;
      if (cameraSettings.near !== undefined) (camera as any).near = cameraSettings.near;
      if (cameraSettings.far !== undefined) (camera as any).far = cameraSettings.far;
      if (cameraSettings.position) (camera as any).position.set(
        cameraSettings.position.x, cameraSettings.position.y, cameraSettings.position.z);
      if (cameraSettings.lookAt) (camera as any).lookAt(
        cameraSettings.lookAt.x, cameraSettings.lookAt.y, cameraSettings.lookAt.z);
      (camera as any).updateProjectionMatrix();
    } catch (e) {
      logger.error('Failed to apply camera settings', e);
    }
  }, [camera, cameraSettings])
  
  return null
}

// Main GraphCanvas component
const GraphCanvas: React.FC = () => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null) 
  const { settings } = useSettingsStore()
  const showStats = settings?.visualization?.showStats ?? false
  const xrEnabled = settings?.xr?.enabled !== false
  const antialias = settings?.visualization?.rendering?.antialias !== false
  
  const containerSize = useContainerSize(containerRef);
  
  // Renderer size management using useLayoutEffect
  const RendererSizeManager: React.FC = () => {
    const { gl, viewport, size, camera } = useThree();
      
    useLayoutEffect(() => {
      if (containerSize.width <= 0 || containerSize.height <= 0) return;
      
      try {
        // Force Three.js to update both the renderer size and the canvas element size
        (gl as any).setSize(containerSize.width, containerSize.height, false);
        
        // Update camera aspect ratio based on new size
        if (camera instanceof THREE.PerspectiveCamera) {
          (camera as any).aspect = containerSize.width / containerSize.height;
          (camera as any).updateProjectionMatrix();
        }
        
        logger.debug(`Canvas size force-updated: ${containerSize.width}px x ${containerSize.height}px`);
      } catch (e) {
        logger.error('Error updating renderer size:', e);
      }
    }, [gl, camera, containerSize]);
    return null;
  };
  const debugEnabled = settings?.debug?.enabled === true

  // Debug logging for settings and container dimensions
  useEffect(() => {
    if (debugEnabled) {
      logger.debug('GraphCanvas settings:', settings);
      
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        logger.debug('GraphCanvas container dimensions:', { 
          width: Math.round(width), 
          height: Math.round(height),
          container: containerRef.current
        });
      }
    }
  }, [debugEnabled, settings]);
  
  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden w-full h-full" 
      style={{ 
        touchAction: 'none', // Prevent touch scrolling/zooming on mobile
        zIndex: 5 // Ensure canvas stays below viewport controls
      }}
      data-testid="graph-canvas-container"
    >
      <Canvas
        key={`canvas-${containerSize.width}-${containerSize.height}`} // Force canvas recreation on size change
        ref={canvasRef}
        gl={{
          antialias,
          alpha: true,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: settings?.visualization?.camera?.far || 2000,
          position: [0, 10, 50],
          makeDefault: true,
          aspect: containerSize.width / Math.max(containerSize.height, 1) // Ensure valid aspect ratio
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl }) => {
          try {
            gl.setClearColor(new (THREE.Color as any)(settings?.visualization?.sceneBackground || '#000000'));
            if (debugEnabled) {
              logger.info('React Three Fiber canvas created successfully');
              logger.debug('Initial canvas dimensions:', {
                width: gl.domElement.width,
                height: gl.domElement.height
              });
            }
            // Note: We don't set the size here, as the RendererSizeManager will handle that
          } catch (e) {
            logger.warn('Failed to set renderer properties', e);
          }
        }}
      >
        <RendererSizeManager />
        {xrEnabled ? (
          <XR referenceSpace={settings?.xr?.roomScale ? 'local-floor' : 'local'}>
            <SceneSetup />
            <CameraSetup />
            <GraphManager />
            <XRController />
            <XRVisualizationConnector />
            <OrbitControls
              enableDamping
              dampingFactor={0.1}
              screenSpacePanning
              minDistance={1}
              maxDistance={2000}
              enableRotate
              enableZoom
              enablePan
              rotateSpeed={1.0}
              zoomSpeed={1.2}
              panSpeed={0.8}
            />
            <Effects />
            {showStats && <Stats />}
          </XR>
        ) : (
          <>
            <SceneSetup />
            <CameraSetup />
            <GraphManager />
            <OrbitControls
              enableDamping
              dampingFactor={0.1}
              screenSpacePanning
              minDistance={1}
              maxDistance={2000}
              enableRotate
              enableZoom
              enablePan
              rotateSpeed={1.0}
              zoomSpeed={1.2}
              panSpeed={0.8}
            />
            <Effects />
            {showStats && <Stats />}
          </>
        )}
      </Canvas>
    </div>
  )
}

export default GraphCanvas