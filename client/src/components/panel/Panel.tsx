import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { Rnd, RndResizeCallback, RndDragCallback } from 'react-rnd';
import { usePanel, Panel as PanelType, PanelPosition, DockPosition } from './PanelContext';
import { X, Minimize, Maximize, ChevronDown, ChevronUp, Anchor } from 'lucide-react';
import { Button } from '../ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface PanelProps {
  id: string;
  children: ReactNode;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

const Panel: React.FC<PanelProps> = ({ 
  id, 
  children, 
  initialWidth = 300, 
  initialHeight = 400, 
  minWidth = 200, 
  minHeight = 200 
}) => {
  const {
    panels,
    updatePanelPosition,
    updatePanelSize,
    togglePanelOpen,
    togglePanelCollapsed,
    bringToFront,
    dockPanel,
    activatePanelInGroup,
  } = usePanel();

  const panel = panels[id];
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (!panel || !panel.isOpen) {
    return null;
  }

  // Panel snapping logic
  const getSnappedPosition = (x: number, y: number, width: number, height: number): PanelPosition => {
    const snapThreshold = 20;
    let snappedX = x;
    let snappedY = y;
    
    // Snap to left edge
    if (x < snapThreshold) snappedX = 0;
    
    // Snap to right edge
    if (window.innerWidth - (x + width) < snapThreshold)
      snappedX = window.innerWidth - width;
    
    // Snap to top edge
    if (y < snapThreshold) snappedY = 0;
    
    // Snap to bottom edge
    if (window.innerHeight - (y + height) < snapThreshold)
      snappedY = window.innerHeight - height;
    
    return { x: snappedX, y: snappedY };
  };

  const handleDragStop: RndDragCallback = (e, d) => {
    const { x, y } = d;
    const snappedPosition = getSnappedPosition(x, y, width, height);
    updatePanelPosition(id, snappedPosition);
  };

  const handleResizeStop: RndResizeCallback = (e, direction, ref, delta, position) => {
    const newWidth = ref.offsetWidth;
    const newHeight = ref.offsetHeight;
    
    updatePanelSize(id, {
      width: newWidth,
      height: newHeight,
    });
    
    const snappedPosition = getSnappedPosition(
      position.x,
      position.y,
      newWidth,
      newHeight
    );
    
    updatePanelPosition(id, snappedPosition);
  };

  const handleClose = (): void => {
    togglePanelOpen(id);
  };

  const handleCollapse = (): void => {
    togglePanelCollapsed(id);
  };

  const handleMouseDown = (): void => {
    bringToFront(id);
    
    // If panel is in a group, activate it
    if (panel.groupId) {
      activatePanelInGroup(id);
    }
  };
  
  const handleTouchStart = (): void => {
    bringToFront(id);
    
    // If panel is in a group, activate it
    if (panel.groupId) {
      activatePanelInGroup(id);
    }
  };
  
  const handleDock = (position: DockPosition): void => {
    dockPanel(id, position);
  };

  // Calculate panel dimensions based on collapsed state
  const width = panel.size?.width || initialWidth;
  const height = panel.isCollapsed ? 40 : (panel.size?.height || initialHeight);
  
  // Determine if this panel should be shown based on group status
  const isVisibleInGroup = !panel.groupId || panel.activeInGroup;
  
  if (panel.groupId && !isVisibleInGroup) {
    return null;
  }

  return (
    <Rnd
      ref={panelRef as any} // Rnd has a ref type issue with React.RefObject<HTMLDivElement>
      default={{
        x: panel.position?.x || 0,
        y: panel.position?.y || 0,
        width: width,
        height: height,
      }}
      position={{ x: panel.position?.x || 0, y: panel.position?.y || 0 }}
      size={{ width, height }}
      minWidth={minWidth}
      minHeight={panel.isCollapsed ? 40 : minHeight}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      style={{
        zIndex: panel.zIndex || 100,
        display: panel.isOpen ? 'block' : 'none',
        transition: 'box-shadow 0.2s ease',
      }}
      disableDragging={isMobile || panel.isDocked}
      enableResizing={!panel.isCollapsed && !panel.isDocked}
      className="shadow-lg bg-background border border-border rounded-md overflow-hidden hover:shadow-xl"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      dragHandleClassName="panel-header"
      bounds="window"
      transitionDuration={200}
    >
      <div
        className="flex flex-col h-full"
        role="dialog"
        aria-labelledby={`panel-${id}-title`}
      >
        {/* Panel Header */}
        <div
          className="panel-header flex items-center justify-between p-2 bg-muted cursor-move border-b border-border"
          id={`panel-${id}-header`}
        >
          <div
            id={`panel-${id}-title`}
            className="font-medium truncate"
          >
            {panel.title}
          </div>
          <div className="flex items-center space-x-1">
            {/* Dock buttons - only show when not collapsed */}
            {!panel.isCollapsed && !panel.isDocked && (
              <div className="flex mr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDock('left')}
                  aria-label="Dock to left"
                  title="Dock to left"
                >
                  <Anchor className="h-3 w-3 transform rotate-90" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDock('right')}
                  aria-label="Dock to right"
                  title="Dock to right"
                >
                  <Anchor className="h-3 w-3 transform -rotate-90" />
                </Button>
              </div>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCollapse}
              aria-label={panel.isCollapsed ? "Expand" : "Collapse"}
              aria-expanded={!panel.isCollapsed}
              title={panel.isCollapsed ? "Expand" : "Collapse"}
            >
              {panel.isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleClose}
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Panel Content with Animation */}
        <AnimatePresence>
          {!panel.isCollapsed && (
            <motion.div
              className="flex-1 overflow-auto p-4"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              tabIndex={0}
              aria-labelledby={`panel-${id}-title`}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Rnd>
  );
};

export default Panel;