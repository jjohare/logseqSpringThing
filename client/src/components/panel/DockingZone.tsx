import { useEffect, useState, ReactNode, FC, CSSProperties } from 'react';
import { usePanel, DockPosition } from './PanelContext';
import { useWindowSizeContext } from '../../lib/contexts/WindowSizeContext';
import { createLogger } from '../../lib/utils/logger';
import { ChevronUp, ChevronDown, Minimize, Maximize } from 'lucide-react';

const logger = createLogger('DockingZone');

interface DockingZoneProps {
  position: DockPosition;
  className?: string;
  children?: ReactNode;
  autoSize?: boolean;
  defaultSize?: number;
  expandable?: boolean;
}

/**
 * DockingZone manages panels that are docked to specific edges of the viewport.
 * It handles resizing and proper stacking of docked panels.
 */
const DockingZone: FC<DockingZoneProps> = ({ 
  position, 
  className = '', 
  children, 
  autoSize = true, 
  defaultSize,
  expandable = true
}) => {
  // Get window dimensions from global context
  const windowSize = useWindowSizeContext();
  
  // Set appropriate default sizes based on position
  const getDefaultSize = () => {
    if (!defaultSize) {
      switch (position) {
        case 'top':
        case 'bottom':
          return 300; // Taller top/bottom panels
        default:
          return 300; // Default side panel width
      }
    }
    return defaultSize;
  };
  const { panels } = usePanel();
  const [size, setSize] = useState<number>(defaultSize);
  const [isDragResizing, setIsDragResizing] = useState<boolean>(false);
  const [dockedPanelIds, setDockedPanelIds] = useState<string[]>([]);
  const [previousWindowSize, setPreviousWindowSize] = useState({ width: windowSize.width, height: windowSize.height });

  // Track which panels are docked to this zone
  useEffect(() => {
    const dockedIds = Object.keys(panels).filter(id => 
      panels[id].isDocked &&
      panels[id].dockPosition === position &&
      panels[id].isOpen
    );
    setDockedPanelIds(dockedIds);

    // If auto-sizing is enabled, calculate the optimal size for this docking zone
    if (autoSize && dockedIds.length > 0) {
      // For each docking direction, use the largest panel size as the zone size
      const dockedPanelsSizes = dockedIds.map(id => {
        const panel = panels[id];
        return position === 'left' || position === 'right'
          ? panel.size?.width || getDefaultSize()
          : panel.size?.height || getDefaultSize();
      });
      const maxSize = Math.max(...dockedPanelsSizes);
      if (maxSize > 0 && maxSize !== size) {
        setSize(maxSize);
      }
    }
  }, [panels, position, autoSize, defaultSize, size, windowSize]);
  
  // Initialize with proper default size
  useEffect(() => {
    setSize(getDefaultSize());
  }, []);
  
  // Adjust the zone size when window is resized
  useEffect(() => {
    if (hasVisiblePanels && size > 0) {
      if (position === 'left' || position === 'right') {
        // For horizontal panels, scale based on width changes
        const maxWidth = windowSize.width * 0.8; // Max 80% of window width
        setSize(prev => Math.min(prev, maxWidth));
      } else if (position === 'top' || position === 'bottom') {
        // For vertical panels, scale based on height changes
        const maxHeight = windowSize.height * 0.8; // Max 80% of window height
        setSize(prev => Math.min(prev, maxHeight));
      }
    }
    // Update previous window size
    setPreviousWindowSize({ width: windowSize.width, height: windowSize.height });
  }, [windowSize.width, windowSize.height, position]);

  // Handling resize dragging
  const handleResizeStart = (): void => {
    setIsDragResizing(true);
  };

  const handleResizeEnd = (): void => {
    setIsDragResizing(false);
  };

  // Toggle expanded/collapsed state for the docking zone
  const toggleExpand = () => {
    setSize(size === 0 ? getDefaultSize() : 0);
  };

  // Determine if the docking zone has visible panels
  const hasVisiblePanels = dockedPanelIds.length > 0;

  // Set up styles based on docking position
  const getPositionStyles = (): CSSProperties => {
    const isHorizontal = position === 'top' || position === 'bottom';
    const dimensionStyle = isHorizontal
      ? { height: hasVisiblePanels ? `${size}px` : '0px' }
      : { width: hasVisiblePanels ? `${size}px` : '0px' };
    return dimensionStyle;
  };

  // Set up classes based on docking position
  const getPositionClasses = (): string => {
    switch (position) {
      case 'left':
        return 'border-r';
      case 'right':
        return 'border-l';
      case 'top':
        return 'border-b';
      case 'bottom':
        return 'border-t';
      default:
        return '';
    }
  };

  // Only show the resizer when there are docked panels
  const showResizer = hasVisiblePanels;

  // Determine resizer position and styling
  const getCollapseIconAndPosition = (): { icon: JSX.Element, position: string } => {
    switch (position) {
      case 'left':
        return {
          icon: size === 0 ? <Maximize size={16} /> : <Minimize size={16} />,
          position: 'absolute -right-6 top-2 bg-background border border-border rounded-r-md p-1'
        };
      case 'right':
        return {
          icon: size === 0 ? <Minimize size={16} /> : <Maximize size={16} />,
          position: 'absolute -left-6 top-2 bg-background border border-border rounded-l-md p-1'
        };
      case 'top':
        return {
          icon: size === 0 ? <ChevronDown size={16} /> : <ChevronUp size={16} />,
          position: 'absolute bottom-0 left-1/2 -translate-x-1/2 bg-background border border-border rounded-b-md p-1'
        };
      case 'bottom':
        return {
          icon: size === 0 ? <ChevronUp size={16} /> : <ChevronDown size={16} />,
          position: 'absolute top-0 left-1/2 -translate-x-1/2 bg-background border border-border rounded-t-md p-1'
        };
    }
  };
  const getResizerClasses = (): string => {
    switch (position) {
      case 'left':
        return 'right-0 top-0 h-full w-1 cursor-ew-resize';
      case 'right':
        return 'left-0 top-0 h-full w-1 cursor-ew-resize';
      case 'top':
        return 'bottom-0 left-0 w-full h-1 cursor-ns-resize';
      case 'bottom':
        return 'top-0 left-0 w-full h-1 cursor-ns-resize';
      default:
        return '';
    }
  };

  return (
    <div
      className={`docking-zone relative bg-background ${getPositionClasses()} ${hasVisiblePanels ? '' : 'hidden'} transition-all duration-200 ${className}`}
      style={getPositionStyles()}
      data-docking-position={position}
    >
      <div className="h-full w-full overflow-auto">
        {children}
      </div>
      {showResizer && (
        <div
          className={`absolute bg-transparent hover:bg-primary/20 ${getResizerClasses()} ${isDragResizing ? 'bg-primary/20' : ''}`}
          onMouseDown={handleResizeStart}
          onMouseUp={handleResizeEnd}
          onDoubleClick={() => setSize(defaultSize)}
          title="Drag to resize. Double-click to reset."
        />
      )}
      
      {/* Expand/Collapse Button */}
      {expandable && hasVisiblePanels && (
        <button
          className={`${getCollapseIconAndPosition()?.position} cursor-pointer hover:bg-accent/10 z-30`}
          onClick={toggleExpand}
          title={size === 0 ? "Expand panel" : "Collapse panel"}
        >{getCollapseIconAndPosition()?.icon}</button>
      )}
    </div>
  );
};

export default DockingZone;