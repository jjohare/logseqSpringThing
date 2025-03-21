import React, { ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { usePanel, DockPosition } from './PanelContext';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('PanelToolbar');

interface PanelToolbarProps {
  panelId: string;
  title: string;
  icon?: ReactNode;
  showDockControls?: boolean;
  showCollapseControl?: boolean;
  showCloseControl?: boolean;
  extraControls?: ReactNode;
  className?: string;
}

/**
 * PanelToolbar provides a standardized header with controls for panels
 */
const PanelToolbar: React.FC<PanelToolbarProps> = ({
  panelId,
  title,
  icon,
  showDockControls = true,
  showCollapseControl = true,
  showCloseControl = true,
  extraControls,
  className = ''
}) => {
  const { panels, togglePanelOpen, togglePanelCollapsed, dockPanel } = usePanel();
  const panel = panels[panelId];

  if (!panel) {
    logger.warn(`Panel with ID "${panelId}" not found`);
    return null;
  }

  const isCollapsed = panel.isCollapsed;
  const isDocked = panel.isDocked;

  const handleClose = (): void => {
    logger.debug(`Closing panel: ${panelId}`);
    togglePanelOpen(panelId);
  };

  const handleCollapse = (): void => {
    logger.debug(`${isCollapsed ? 'Expanding' : 'Collapsing'} panel: ${panelId}`);
    togglePanelCollapsed(panelId);
  };

  const handleDock = (position: DockPosition): void => {
    logger.debug(`Docking panel ${panelId} to ${position}`);
    dockPanel(panelId, position);
  };

  return (
    <div 
      className={`panel-toolbar flex items-center justify-between p-2 bg-muted border-b border-border ${className}`}
      data-panel-id={panelId}
    >
      <div className="flex items-center space-x-2 text-sm font-medium truncate">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h3 className="truncate">{title}</h3>
      </div>
      <div className="flex items-center space-x-1">
        {extraControls}

        {showDockControls && !isCollapsed && !isDocked && (
          <div className="flex mr-1">
            <Tooltip content="Dock to left">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleDock('left')}
                aria-label="Dock to left"
              >
                <svg
                  className="h-3 w-3 transform rotate-90"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M4 12h16" />
                </svg>
              </Button>
            </Tooltip>

            <Tooltip content="Dock to right">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleDock('right')}
                aria-label="Dock to right"
              >
                <svg
                  className="h-3 w-3 transform -rotate-90"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M4 12h16" />
                </svg>
              </Button>
            </Tooltip>
          </div>
        )}

        {showCollapseControl && (
          <Tooltip content={isCollapsed ? 'Expand' : 'Collapse'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCollapse}
              aria-label={isCollapsed ? "Expand" : "Collapse"}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </Tooltip>
        )}

        {showCloseControl && (
          <Tooltip content="Close">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default PanelToolbar;