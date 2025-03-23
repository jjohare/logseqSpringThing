import { useState, useEffect } from 'react';

// Define the window size interface
export interface WindowSize {
  width: number;
  height: number;
  pixelRatio: number;
}

/**
 * Hook that tracks window dimensions and device pixel ratio.
 * This provides a centralized source of truth for window size used across the app.
 */
export function useWindowSize(): WindowSize {
  // Initialize with current window dimensions and pixel ratio
  const [windowSize, setWindowSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1
  });

  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window dimensions in state
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1
      });
    }
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Call handler right away so state gets updated with initial window size
    handleResize();
    
    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty array ensures effect runs only on mount and unmount

  return windowSize;
}