import React, { useRef, useEffect } from 'react'
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

const logger = createLogger('GraphCanvas')

// Composition of post-processing effects
const Effects = () => {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<any>()
  const bloomSettings = useSettingsStore(state => state.settings?.visualization?.bloom)
  
  useEffect(() => {
    // Create effect composer for post-processing
    const composer = new EffectComposer(gl as any)
    const renderPass = new RenderPass(scene as any, camera as any)
    composer.addPass(renderPass)
    
    // Add bloom effect if enabled in settings
    if (bloomSettings?.enabled) {
      // Use type assertion to avoid TS errors
      const sizeVector = new (THREE.Vector2 as any)(size.width, size.height);
      // Use type assertion to avoid TS constructor errors
      const bloomPass = new (UnrealBloomPass as any)(
        sizeVector,
        bloomSettings.strength || 1.5,
        bloomSettings.radius || 0.4,
        bloomSettings.threshold || 0.85
      );
      composer.addPass(bloomPass)
    }
    
    composerRef.current = composer
    
    // Handle resize
    return () => {
      if (composer && composer.dispose) composer.dispose()
    }
  }, [gl, scene, camera, size, bloomSettings])
  
  // Update effects on frame render
  useFrame(() => {
    if (composerRef.current) {
      try { composerRef.current.render() } catch (e) { /* Ignore rendering errors */ }
    }
  }, 1) // Higher priority than default (0)
  
  return null
}

// Scene setup with lighting and background
const SceneSetup = () => {
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
    
    return () => {
      // Lights are removed with scene, no need to clean up
    }
  }, [scene, visualSettings])
  
  return null
}

// Camera setup and configuration
const CameraSetup = () => {
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
const GraphCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null) 
  const { settings } = useSettingsStore()
  const showStats = settings?.visualization?.showStats ?? false
  const xrEnabled = settings?.xr?.enabled !== false
  const antialias = settings?.visualization?.rendering?.antialias !== false
  const debugEnabled = settings?.debug?.enabled === true

  // Debug logging for container dimensions (only if debug is enabled)
  useEffect(() => {
    if (containerRef.current && debugEnabled) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      logger.debug('GraphCanvas container dimensions:', { 
        width: Math.round(width), 
        height: Math.round(height),
        container: containerRef.current
      });
    }
  }, [debugEnabled]);
  
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
        ref={canvasRef}
        gl={{
          antialias,
          alpha: true,
          powerPreference: 'high-performance',
          // Don't prevent rendering on devices with poor WebGL performance
          failIfMajorPerformanceCaveat: false
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: settings?.visualization?.camera?.far || 2000,
          position: [0, 10, 50],
          makeDefault: true
        }}
        // Use a specific className with positioning
        className="r3f-canvas" 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
        onCreated={({ gl }) => {
          // Set renderer properties that can't be set via props
          try {
            gl.setClearColor(new (THREE.Color as any)(settings?.visualization?.sceneBackground || '#000000'));
            const width = containerRef.current?.clientWidth || window.innerWidth;
            const height = containerRef.current?.clientHeight || window.innerHeight;
            gl.setSize(width, height);
            
            if (debugEnabled) {
              logger.info('React Three Fiber canvas created successfully');
              logger.debug('Renderer initialized with dimensions:', {
                width: gl.domElement.width,
                height: gl.domElement.height
              });
            }
          } catch (e) {
            logger.warn('Failed to set renderer properties', e);
          }
        }}
      >
        {xrEnabled ? (
          <XR referenceSpace={settings?.xr?.roomScale ? 'local-floor' : 'local'}>
            {/* Scene setup must come first to initialize properly */}
            <SceneSetup />
            <CameraSetup />
            
            {/* Graph visualization */}
            <GraphManager />
            
            {/* XR Controller - now properly wrapped in XR component */}
            <XRController />
            
            {/* Connect hand interaction with visualization */}
            <XRVisualizationConnector />
            
            {/* Camera controls for non-XR mode */}
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
            
            {/* Post-processing effects */}
            <Effects />
            
            {/* Performance stats (if enabled) */}
            {showStats && <Stats />}
          </XR>
        ) : (
          <>
            {/* Non-XR mode rendering */}
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