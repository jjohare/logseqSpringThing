import { useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { IconProps } from 'lucide-react';

// Custom icon components to replace the missing ones from lucide-react
const Home = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ZoomIn = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomOut = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const RotateCw = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 2v6h-6" />
    <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
  </svg>
);

const PanelLeft = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const PanelRight = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

const PanelTop = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.color || "currentColor"}
    strokeWidth={props.strokeWidth || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
  </svg>
);


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
   * Callback for toggling the top panel
   */
  onToggleTopPanel?: () => void;
  
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
  onToggleTopPanel,
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
          {onToggleTopPanel && (
            <Tooltip content="Toggle Top Panel (Shortcut: T)">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTopPanel}
                aria-label="Toggle Top Panel"
                className="h-8 w-8"
              >
                <PanelTop className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
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