import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { PanelProvider, usePanel } from './PanelContext';
import Panel from './Panel';
import { Button } from '../ui/button';
import {
  Settings,
  LayoutGrid,
  RefreshCw,
  Terminal,
  Smartphone,
  Maximize,
  Minimize,
  MonitorSmartphone
} from 'lucide-react';
import { Tooltip } from '../ui/tooltip';

// Panel toggle buttons component
const PanelControls: React.FC = () => {
  const {
    panels,
    togglePanelOpen,
    resetPanels,
    applyLayout,
    createPanel,
    layoutPresets
  } = usePanel();
  
  const [layoutMenuOpen, setLayoutMenuOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleLayoutMenu = (): void => {
    setLayoutMenuOpen(!layoutMenuOpen);
  };
  
  const handleOpenConsole = (): void => {
    // If console panel doesn't exist in panels, create it
    if (!panels.console) {
      createPanel('console', {
        title: 'Console',
        position: { x: window.innerWidth - 320, y: 20 },
        size: { width: 300, height: 500 },
        groupId: 'rightGroup',
      });
    }
    togglePanelOpen('console');
  };

  return (
    <div className="fixed top-4 left-4 z-50">
      <div className="flex space-x-2">
        {/* Settings Panel Toggle */}
        <Tooltip content="Settings (Ctrl+,)">
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePanelOpen('settings')}
            aria-label="Toggle Settings Panel"
            className="bg-background/80 backdrop-blur-sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </Tooltip>

        {/* Console Panel Toggle */}
        <Tooltip content="Console (Ctrl+`)">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenConsole}
            aria-label="Toggle Console Panel"
            className="bg-background/80 backdrop-blur-sm"
          >
            <Terminal className="h-4 w-4 mr-2" />
            Console
          </Button>
        </Tooltip>

        {/* Layout Menu Toggle */}
        <Tooltip content="Layout Options">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLayoutMenu}
            aria-label="Layout Options"
            className="bg-background/80 backdrop-blur-sm"
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Layout
          </Button>
        </Tooltip>

        {/* Reset Panels Button */}
        <Tooltip content="Reset Panels (Ctrl+Alt+R)">
          <Button
            variant="outline"
            size="sm"
            onClick={resetPanels}
            aria-label="Reset Panels"
            className="bg-background/80 backdrop-blur-sm"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      
      {/* Layout Menu */}
      {layoutMenuOpen && (
        <div className="mt-2 p-2 bg-background/95 backdrop-blur-sm border border-border rounded-md shadow-lg">
          <div className="text-sm font-medium mb-2">Layout Presets</div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                applyLayout('default');
                setLayoutMenuOpen(false);
              }}
              className="flex items-center justify-start"
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Default
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                applyLayout('compact');
                setLayoutMenuOpen(false);
              }}
              className="flex items-center justify-start"
            >
              <Minimize className="h-4 w-4 mr-2" />
              Compact
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                applyLayout('expanded');
                setLayoutMenuOpen(false);
              }}
              className="flex items-center justify-start"
            >
              <Maximize className="h-4 w-4 mr-2" />
              Expanded
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                applyLayout('mobile');
                setLayoutMenuOpen(false);
              }}
              className="flex items-center justify-start"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Define the type for the custom properties added to DOM elements
interface PanelContextElement extends HTMLDivElement {
  __panelContext: ReturnType<typeof usePanel>;
}

interface PanelManagerProps {
  children: ReactNode;
}

// Main panel manager component
const PanelManager: React.FC<PanelManagerProps> = ({ children }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Get panel context inside the effect to ensure we have the latest state
      const panelContext = document.querySelector('[data-panel-context="true"]') as PanelContextElement | null;
      if (!panelContext) return;
      
      const {
        togglePanelOpen,
        togglePanelCollapsed,
        resetPanels,
        panels
      } = panelContext.__panelContext;
      
      // Toggle settings panel with Ctrl+,
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        togglePanelOpen('settings');
      }
      
      // Toggle console panel with Ctrl+`
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        togglePanelOpen('console');
      }
      
      // Reset panels with Ctrl+Alt+R
      if (e.ctrlKey && e.altKey && e.key === 'r') {
        e.preventDefault();
        resetPanels();
      }
      
      // Toggle panel collapse with Ctrl+[
      if (e.ctrlKey && e.key === '[') {
        e.preventDefault();
        // Toggle collapse for the active panel
        const activePanel = Object.keys(panels).find(id =>
          panels[id].isOpen && (!panels[id].groupId || panels[id].activeInGroup));
        if (activePanel) {
          togglePanelCollapsed(activePanel);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <PanelProvider>
      <div
        data-panel-context="true"
        ref={(el: HTMLDivElement | null) => {
          if (el) {
            // Store panel context on the DOM element for keyboard shortcuts
            (el as PanelContextElement).__panelContext = usePanel();
          }
        }}
        className="relative w-full h-full"
      >
        {/* Main content */}
        <div className="relative w-full h-full">
          {children}
        </div>
        
        {/* Panel controls */}
        <PanelControls />
        
        {/* Mobile indicator for responsive design */}
        {isMobile && (
          <div className="fixed bottom-4 right-4 z-50 p-2 bg-background/80 backdrop-blur-sm rounded-full shadow-lg">
            <MonitorSmartphone className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
    </PanelProvider>
  );
};

export default PanelManager;