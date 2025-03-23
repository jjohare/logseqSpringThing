import { useRef, useEffect, useState, type ReactNode } from 'react';
import { useSettingsStore } from '../../lib/stores/settings-store';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('ViewportContainer');

interface ViewportContainerProps {
  children: ReactNode;
  /**
   * Optional callback for when the viewport size changes
   */
  onResize?: (width: number, height: number) => void;
}

/**
 * ViewportContainer serves as the main container for the Three.js visualization.
 * It handles resize events and coordinates with the panel system to adjust its dimensions
 * when panels are docked/undocked.
 */
const ViewportContainer = ({ 
  children,
  onResize 
}: ViewportContainerProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { initialized } = useSettingsStore(state => ({
    initialized: state.initialized
  }));

  logger.debug("Rendering ViewportContainer");

  // Track resize events to update viewport dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (viewportRef.current) {
        const { width, height } = viewportRef.current.getBoundingClientRect();
        setDimensions({ width, height });
        
        if (onResize) {
          onResize(width, height);
        }
        
        logger.debug('Viewport dimensions:', { 
          width: Math.round(width), 
          height: Math.round(height),
          containerElement: viewportRef.current.parentElement
        });
      }
    };
    
    // Initial size measurement (execute after a small delay to ensure accurate dimensions)
    updateDimensions();
    // Also measure after a slight delay to catch any post-render adjustments
    const initialMeasurementTimer = setTimeout(() => {
      updateDimensions();
    }, 100);

    // Add resize event listener
    window.addEventListener('resize', updateDimensions);
    
    // Create ResizeObserver to track container size changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
    }
    
    return () => {
      clearTimeout(initialMeasurementTimer);
      window.removeEventListener('resize', updateDimensions);
      resizeObserver.disconnect();
    };
  }, [onResize]);

  // Trigger resize notification when initialization completes
  useEffect(() => {
    if (initialized && viewportRef.current) {
      const { width, height } = viewportRef.current.getBoundingClientRect();
      logger.debug('Viewport initialized with dimensions:', { 
        width: Math.round(width), 
        height: Math.round(height) 
      });

      if (onResize) {
        onResize(width, height);
      }
    }
  }, [initialized, onResize]);

  return (
    <div 
      ref={viewportRef}
      className="relative w-full h-full bg-background viewport-container"
      data-testid="viewport-container"
    >
      {/* Viewport Content (typically Three.js canvas) */}
      {children}
      
      {/* Viewport size indicator for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/70 px-2 py-1 rounded-md z-10">
          {`${Math.round(dimensions.width)} × ${Math.round(dimensions.height)}`}
        </div>
      )}
    </div>
  );
}

export default ViewportContainer;