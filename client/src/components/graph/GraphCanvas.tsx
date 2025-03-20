import React, { useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import * as THREE from 'three'
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib'
import GraphManager from './GraphManager'
import XRController from '../xr/XRController'
import XRVisualizationConnector from '../XRVisualizationConnector'
import { useSettingsStore } from '../../lib/settings-store'
import { createLogger } from '../../lib/utils/logger'
import { debugState } from '../../lib/utils/debug-state'

const logger = createLogger('GraphCanvas')

// Composition of post-processing effects
const Effects = () => {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<EffectComposer>()
  const settings = useSettingsStore(state => state.settings?.visualization?.bloom)
  
  useEffect(() => {
    // Create effect composer for post-processing
    const composer = new EffectComposer(gl)
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)
    
    // Add bloom effect if enabled in settings
    if (settings?.enabled) {
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        settings.strength || 1.5,
        settings.radius || 0.4,
        settings.threshold || 0.85
      )
      composer.addPass(bloomPass)
    }
    
    composerRef.current = composer
    
    // Handle resize
    const handleResize = () => {
      composer.setSize(size.width, size.height)
    }
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      composer.dispose()
    }
  }, [gl, scene, camera, size, settings])
  
  // Update effects on frame render
  useFrame(() => {
    if (composerRef.current) {
      composerRef.current.render()
    }
  }, 1) // Higher priority than default (0)
  
  return null
}

// Initialize WebXR in the scene
const InitializeXR = () => {
  const { gl } = useThree()
  const settings = useSettingsStore(state => state.settings)
  const xrEnabled = settings?.xr?.enabled !== false
  
  useEffect(() => {
    if (xrEnabled) {
      gl.xr.enabled = true
      
      // Set reference space type based on settings
      if (settings?.xr?.roomScale) {
        gl.xr.setReferenceSpaceType('local-floor')
      } else {
        gl.xr.setReferenceSpaceType('local')
      }
      
      if (debugState.isEnabled()) {
        logger.info('WebXR enabled on renderer')
      }
    }
  }, [gl, xrEnabled, settings?.xr?.roomScale])
  
  return null
}

// Scene setup with lighting and background
const SceneSetup = () => {
  const { scene } = useThree()
  const settings = useSettingsStore(state => state.settings?.visualization)
  
  useEffect(() => {
    // Set background color from settings or default
    if (settings?.sceneBackground !== undefined) {
      scene.background = new THREE.Color(settings.sceneBackground)
    } else {
      scene.background = new THREE.Color(0x000000) // Black default
    }
    
    // Setup base lighting if not already present
    if (!scene.children.some(child => child instanceof THREE.AmbientLight)) {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
      scene.add(ambientLight)
    }
    
    if (!scene.children.some(child => child instanceof THREE.DirectionalLight)) {
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(1, 1, 1).normalize()
      scene.add(directionalLight)
    }
    
    if (debugState.isEnabled()) {
      logger.info('Scene setup complete')
    }
    
    return () => {
      // Lights are removed with scene, no need to clean up
    }
  }, [scene, settings])
  
  return null
}

// Camera setup and configuration
const CameraSetup = () => {
  const { camera } = useThree()
  const settings = useSettingsStore(state => state.settings?.visualization?.camera)
  
  useEffect(() => {
    if (!settings) return
    
    // Apply camera settings
    if (camera instanceof THREE.PerspectiveCamera) {
      if (settings.fov !== undefined) camera.fov = settings.fov
      if (settings.near !== undefined) camera.near = settings.near
      if (settings.far !== undefined) camera.far = settings.far
      if (settings.position) {
        camera.position.set(
          settings.position.x,
          settings.position.y,
          settings.position.z
        )
      }
      if (settings.lookAt) {
        camera.lookAt(
          settings.lookAt.x,
          settings.lookAt.y,
          settings.lookAt.z
        )
      }
      camera.updateProjectionMatrix()
    }
    
    if (debugState.isEnabled()) {
      logger.info('Camera configured')
    }
  }, [camera, settings])
  
  return null
}

// Main GraphCanvas component
const GraphCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const settings = useSettingsStore(state => state.settings)
  const showStats = settings?.visualization?.showStats || false
  const xrEnabled = settings?.xr?.enabled !== false
  
  
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Canvas
        ref={canvasRef}
        gl={{
          antialias: settings?.visualization?.rendering?.antialias !== false,
          alpha: true,
          powerPreference: 'high-performance' 
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: 2000,
          position: [0, 10, 50]
        }}
        // Important: Removing ID to prevent SceneManager from finding this canvas
        className="r3f-canvas"
      >
        {/* Initialize WebXR */}
        <InitializeXR />
        
        {/* Scene setup must come first to initialize properly */}
        <SceneSetup />
        <CameraSetup />
        
        {/* Graph visualization */}
        <GraphManager />
        
        {/* XR support */}
        {xrEnabled && <XRController />}
        
        {/* Connect hand interaction with visualization */}
        {xrEnabled && <XRVisualizationConnector />}
        
        {/* Camera controls */}
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
      </Canvas>
    </div>
  )
}

export default GraphCanvas