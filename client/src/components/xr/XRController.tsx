import React, { useState, useCallback } from 'react'
import { useXR } from '@react-three/xr'
import HandInteractionSystem, { GestureRecognitionResult } from '../../lib/xr/HandInteractionSystem'
import { debugState } from '../../lib/utils/debug-state'
import { useSettingsStore } from '../../lib/settings-store'
import { createLogger } from '../../lib/utils/logger'

const logger = createLogger('XRController')

/**
 * XRController component manages WebXR functionality through react-three/xr.
 * This version is simplified to avoid integration conflicts.
 */
const XRController: React.FC = () => {
  const { isPresenting, controllers } = useXR()
  const settings = useSettingsStore(state => state.settings)
  const [handsVisible, setHandsVisible] = useState(false)
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(settings?.xr?.handInteraction !== false)
  
  // Log session state changes
  React.useEffect(() => {
    if (debugState.isEnabled()) {
      if (isPresenting) {
        logger.info('XR session is now active')
      } else {
        logger.info('XR session is not active')
      }
    }
  }, [isPresenting])

  // Log controller information
  React.useEffect(() => {
    if (isPresenting && controllers && controllers.length > 0 && debugState.isEnabled()) {
      logger.info(`XR controllers active: ${controllers.length}`)
      controllers.forEach((controller, index) => {
        logger.info(`Controller ${index}: ${controller.inputSource.handedness}`)
      })
    }
  }, [controllers, isPresenting])

  // Handle gesture recognition
  const handleGestureRecognized = useCallback((gesture: GestureRecognitionResult) => {
    if (debugState.isEnabled()) {
      logger.info(`Gesture recognized: ${gesture.gesture} (${gesture.confidence.toFixed(2)}) with ${gesture.hand} hand`)
    }
  }, [])

  // Handle hand visibility changes
  const handleHandsVisible = useCallback((visible: boolean) => {
    setHandsVisible(visible)
    
    if (debugState.isEnabled()) {
      logger.info(`Hands visible: ${visible}`)
    }
  }, [])
  
  // Only render if enabled in settings
  if (settings?.xr?.enabled === false) {
    return null
  }
  
  return (
    <group name="xr-controller-root">
      <HandInteractionSystem 
        enabled={handTrackingEnabled}
        onGestureRecognized={handleGestureRecognized}
        onHandsVisible={handleHandsVisible}
      />
    </group>
  )
}

export default XRController