import React, { useEffect, useState, ReactNode } from 'react';
import { usePanel, DockPosition } from './PanelContext';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('DockingZone');

interface DockingZoneProps {
  position: DockPosition;
  className?: string;
  children?: ReactNode;
  autoSize?: boolean;
  defaultSize?: number;
}

/**
 * DockingZone manages panels that are docked to specific edges of the viewport.
 * It handles resizing and proper stacking of docked panels.
 */
const DockingZone: React.FC<DockingZoneProps> = ({ 
  position, 
  className = '', 
  children, 
  autoSize = true, 
  defaultSize = 300 
}) => {
  const { panels } = usePanel();
  const [size, setSize] = useState<number>(defaultSize);
  const [isDragResizing, setIsDragResizing] = useState<boolean>(false);
  const [dockedPanelIds, setDockedPanelIds] = useState<string[]>([]);

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
          ? panel.size?.width || defaultSize
          : panel.size?.height || defaultSize;
      });
      const maxSize = Math.max(...dockedPanelsSizes);
      if (maxSize > 0 && maxSize !== size) {
        setSize(maxSize);
      }
    }
  }, [panels, position, autoSize, defaultSize, size]);

  // Handling resize dragging
  const handleResizeStart = (): void => {
    setIsDragResizing(true);
  };

  const handleResizeEnd = (): void => {
    setIsDragResizing(false);
  };

  // Determine if the docking zone has visible panels
  const hasVisiblePanels = dockedPanelIds.length > 0;

  // Set up styles based on docking position
  const getPositionStyles = (): React.CSSProperties => {
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
    </div>
  );
};

export default DockingZone;