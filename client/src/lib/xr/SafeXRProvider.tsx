import React, { createContext, useContext, useState, useEffect } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('SafeXRProvider');

// Default empty values for XR context
export const DEFAULT_XR_STATE = {
  isPresenting: false,
  session: null,
  controllers: [],
  player: null,
  isValid: false,
};

// Create context with default values
const SafeXRContext = createContext<typeof DEFAULT_XR_STATE>(DEFAULT_XR_STATE);

/**
 * Safe XR Provider that prevents errors when XR components are used outside XR context
 * This component wraps the application and provides safe values for XR state
 */
export const SafeXRProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [xrState, setXRState] = useState(DEFAULT_XR_STATE);
  const [isXRLibLoaded, setIsXRLibLoaded] = useState(false);

  // Try to load the XR library safely
  useEffect(() => {
    const tryLoadXR = async () => {
      try {
        // Dynamic import to prevent errors at module load time
        const { XR } = await import('@react-three/xr');
        setIsXRLibLoaded(true);
        logger.debug('XR library loaded successfully');
      } catch (error) {
        logger.warn('Failed to load XR library, providing fallback XR context');
        setIsXRLibLoaded(false);
      }
    };

    tryLoadXR();
  }, []);

  // Check if document includes a Three.js canvas for XR
  useEffect(() => {
    const hasXRCanvas = 
      typeof window !== 'undefined' && 
      (document.querySelector('[data-xr-canvas="true"]') !== null || 
       document.querySelector('canvas.__r3f') !== null);
    
    if (hasXRCanvas) {
      logger.debug('Found XR canvas in document');
    }
  }, []);

  return (
    <SafeXRContext.Provider value={xrState}>
      {children}
    </SafeXRContext.Provider>
  );
};

/**
 * Hook to access safe XR state
 * Returns default values when outside XR context
 */
export const useSafeXRContext = () => {
  return useContext(SafeXRContext);
};

export default SafeXRProvider;