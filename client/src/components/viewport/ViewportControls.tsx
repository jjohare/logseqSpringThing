import { useState } from 'react';
import { Home, ZoomIn, ZoomOut, Maximize, RotateCw, Minimize, PanelLeft, PanelRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { createLogger } from '../../lib/utils/logger';
import { useApplicationMode } from '../context/ApplicationModeContext';

const logger = createLogger('ViewportControls');

interface ViewportControlsProps {
  /**
   * Callback for resetting the camera to its default position
   */
  onReset?: () => void;
  
  /**
   * Callback for zooming in
   */
  onZoomIn?: () => void;
  
  /**
   * Callback for zooming out
   */
  onZoomOut?: () => void;
  
  /**
   * Callback for toggling fullscreen mode
   */
  onToggleFullscreen?: () => void;
  
  /**
   * Callback for rotating the view
   */
  onRotate?: () => void;
  
  /**
   * Callback for toggling the left panel
   */
  onToggleLeftPanel?: () => void;
  
  /**
   * Callback for toggling the right panel
   */
  onToggleRightPanel?: () => void;
  
  /**
   * Whether the controls should be horizontal or vertical
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  
  /**
   * Position of the controls
   * @default 'bottom-right'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * ViewportControls provides a set of controls for navigating and interacting with the 3D viewport.
 */
const ViewportControls = ({
  onReset,
  onZoomIn,
  onZoomOut,
  onToggleFullscreen,
  onRotate,
  onToggleLeftPanel,
  onToggleRightPanel,
  orientation = 'horizontal',
  position = 'bottom-right',
  className = ''
}: ViewportControlsProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { mode, isXRMode } = useApplicationMode();
  
  // Hide controls in XR mode
  if (isXRMode) {
    return null;
  }
  
  // Handle fullscreen toggle
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    
    if (onToggleFullscreen) {
      onToggleFullscreen();
    }
  };
  
  // Position classes
  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'bottom-4 right-4';
    }
  };
  
  // Orientation classes
  const orientationClasses = orientation === 'vertical' ? 'flex-col' : 'flex-row';
  
  return (
    <div
      className={`viewport-controls fixed ${getPositionClasses()} flex items-center gap-2 backdrop-blur-sm bg-background/60 rounded-lg p-1 shadow-md z-10 ${orientationClasses} ${className}`}
      aria-label="Viewport Controls"
    >
      {/* Reset View */}
      <Tooltip content="Reset View (Shortcut: Home)">
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label="Reset View"
          className="h-8 w-8"
        >
          <Home className="h-4 w-4" />
        </Button>
      </Tooltip>
      
      {/* Zoom Controls */}
      <div className={`flex ${orientation === 'vertical' ? 'flex-col' : 'flex-row'} gap-1`}>
        <Tooltip content="Zoom In (Shortcut: +)">
          <Button
            variant="ghost"
            size="icon"
            onClick={onZoomIn}
            aria-label="Zoom In"
            className="h-8 w-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Zoom Out (Shortcut: -)">
          <Button
            variant="ghost"
            size="icon"
            onClick={onZoomOut}
            aria-label="Zoom Out"
            className="h-8 w-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      
      {/* Rotate View */}
      <Tooltip content="Rotate View (Shortcut: R)">
        <Button
          variant="ghost"
          size="icon"
          onClick={onRotate}
          aria-label="Rotate View"
          className="h-8 w-8"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </Tooltip>
      
      {/* Fullscreen Toggle */}
      <Tooltip content={isFullscreen ? "Exit Fullscreen (Shortcut: F)" : "Enter Fullscreen (Shortcut: F)"}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          className="h-8 w-8"
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </Button>
      </Tooltip>
      
      {/* Layout Controls (Only show in desktop mode) */}
      {mode === 'desktop' && (
        <div className={`flex ${orientation === 'vertical' ? 'flex-col' : 'flex-row'} gap-1`}>
          <Tooltip content="Toggle Left Panel (Shortcut: [)">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleLeftPanel}
              aria-label="Toggle Left Panel"
              className="h-8 w-8"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Toggle Right Panel (Shortcut: ])">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleRightPanel}
              aria-label="Toggle Right Panel"
              className="h-8 w-8"
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

export default ViewportControls;