import React, { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { XRSessionManager } from '../../lib/managers/xr-session-manager'
import { XRInitializer } from '../../lib/managers/xr-initializer'
import { SceneManager } from '../../lib/managers/scene-manager'
import { createLogger } from '../../lib/utils/logger'
import { debugState } from '../../lib/utils/debug-state'
import { useSettingsStore } from '../../lib/settings-store'

const logger = createLogger('XRController')

/**
 * XRController component initializes and manages WebXR in the React application.
 * This is a non-rendering component that coordinates XR functionality.
 */
const XRController: React.FC = () => {
  const [sessionManager, setSessionManager] = useState<XRSessionManager | null>(null)
  const [xrInitializer, setXRInitializer] = useState<XRInitializer | null>(null)
  const { scene, gl, camera } = useThree()
  const settings = useSettingsStore(state => state.settings)
  
  // Initialize XR session manager
  useEffect(() => {
    if (!scene || !gl || !camera) return
    
    try {
      // Get the scene manager and initialize XR
      const sceneManager = SceneManager.getInstance()
      const xrSessionManager = XRSessionManager.getInstance(sceneManager)
      
      // Store reference for other effects
      setSessionManager(xrSessionManager)
      
      if (debugState.isEnabled()) {
        logger.info('XR session manager initialized')
      }
      
      // Clean up on unmount
      return () => {
        if (debugState.isEnabled()) {
          logger.info('Cleaning up XR session manager')
        }
      }
    } catch (error) {
      logger.error('Failed to initialize XR session manager:', error)
    }
  }, [scene, gl, camera])
  
  // Initialize XR initializer once session manager is ready
  useEffect(() => {
    if (!sessionManager) return
    
    try {
      // Create XR initializer
      const initializer = XRInitializer.getInstance(sessionManager)
      setXRInitializer(initializer)
      
      if (debugState.isEnabled()) {
        logger.info('XR initializer created')
      }
      
      // Clean up on unmount
      return () => {
        if (debugState.isEnabled()) {
          logger.info('Cleaning up XR initializer')
        }
        initializer.dispose()
      }
    } catch (error) {
      logger.error('Failed to initialize XR:', error)
    }
  }, [sessionManager])
  
  // Apply settings to XR components when settings change
  useEffect(() => {
    if (!settings || !sessionManager || !xrInitializer) return
    
    try {
      // Initialize or update XR components with settings
      sessionManager.initialize(settings)
      xrInitializer.initialize(settings)
      
      if (debugState.isEnabled()) {
        logger.info('XR settings applied')
      }
    } catch (error) {
      logger.error('Failed to apply XR settings:', error)
    }
  }, [settings, sessionManager, xrInitializer])
  
  // This component doesn't render anything
  return null
}

export default XRController