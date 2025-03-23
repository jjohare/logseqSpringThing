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
  const { initialized, settings } = useSettingsStore(state => ({
    initialized: state.initialized,
    settings: state.settings
  }));
  
  const debugEnabled = settings?.debug?.enabled === true;

  // Only log if debug is enabled
  if (debugEnabled) {
    logger.debug("Rendering ViewportContainer");
  }

  // Track resize events to update viewport dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (viewportRef.current) {
        const { width, height } = viewportRef.current.getBoundingClientRect();
        
        // Only update dimensions if they've actually changed
        if (Math.abs(dimensions.width - width) > 1 || Math.abs(dimensions.height - height) > 1) {
          setDimensions({ width, height });
          
          
        if (onResize) {
            onResize(width, height);
          }
          
          if (debugEnabled && width > 0 && height > 0) {
            logger.debug('Viewport dimensions:', { 
              width: Math.round(width), 
              height: Math.round(height),
              containerElement: viewportRef.current.parentElement
            });
          }
        }
      }
    };
    
    // Enhance the measurement by forcing a layout recalculation
    const forceLayoutAndMeasure = () => {
      if (viewportRef.current) {
        // Force a layout recalculation
        void viewportRef.current.offsetHeight;
        // Now measure
        updateDimensions();
      }
    };
    
    // Initial size measurement
    forceLayoutAndMeasure();
    
    // Also measure after a slight delay to catch any post-render adjustments
    const initialMeasurementTimer = setTimeout(() => {
      forceLayoutAndMeasure();
    }, 100);
    
    // And another measurement after layout has fully settled
    const finalMeasurementTimer = setTimeout(() => {
      forceLayoutAndMeasure();
    }, 500);

    // Add resize event listener
    window.addEventListener('resize', updateDimensions);
    
    // Create ResizeObserver to track container size changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
    }
    
    return () => {
      clearTimeout(initialMeasurementTimer);
      clearTimeout(finalMeasurementTimer);
      window.removeEventListener('resize', updateDimensions);
      resizeObserver.disconnect();
    };
  }, [onResize, dimensions, debugEnabled]);

  // Trigger resize notification when initialization completes
  useEffect(() => {
    if (initialized && viewportRef.current) {
      const { width, height } = viewportRef.current.getBoundingClientRect();
      
      if (debugEnabled) {
        logger.debug('Viewport initialized with dimensions:', { 
          width: Math.round(width), 
          height: Math.round(height) 
        });
      }

      if (onResize) {
        onResize(width, height);
      }
    }
  }, [initialized, onResize, debugEnabled]);

  return (
    <div 
      ref={viewportRef}
      className="relative w-full h-full bg-background viewport-container overflow-hidden"
      data-testid="viewport-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'block'
      }}
      onResize={() => {
        if (viewportRef.current) {
          const { width, height } = viewportRef.current.getBoundingClientRect();
          if (onResize) onResize(width, height);
        }
      }}
    >
      {/* Viewport Content (typically Three.js canvas) */}
      <div className="absolute inset-0 w-full h-full">
        {children}
      </div>
      
      {/* Viewport size indicator for debugging */}
      {debugEnabled && process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/70 px-2 py-1 rounded-md z-10">
          {`${Math.round(dimensions.width)} × ${Math.round(dimensions.height)}`}
        </div>
      )}
    </div>
  );
}

export default ViewportContainer;