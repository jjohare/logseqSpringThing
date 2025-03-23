import { type ReactNode } from 'react';
import { useSettingsStore } from '../../lib/stores/settings-store';
import { PanelProvider } from '../panel/PanelContext';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('MainLayout');

interface MainLayoutProps {
  /**
   * Main viewport content (typically Three.js canvas)
   */
  viewportContent: ReactNode;
  
  /**
   * UI panels and controls to be placed around the viewport
   */
  panels?: ReactNode;
  
  /**
   * Optional header content
   */
  header?: ReactNode;
  
  /**
   * Optional footer content
   */
  footer?: ReactNode;
}

/**
 * MainLayout serves as the primary layout component for the application.
 * It organizes the central viewport and surrounding panel system.
 */
const MainLayout = ({
  viewportContent,
  panels,
  header,
  footer
}: MainLayoutProps) => {
  const { initialized, settings } = useSettingsStore(state => ({
    initialized: state.initialized,
    settings: state.settings
  }));
  
  const debugEnabled = settings?.debug?.enabled === true;

  // Only log if debug is enabled
  if (debugEnabled) {
    logger.debug("Rendering MainLayout");
  }

  return (
    <PanelProvider>
      <div className="fixed inset-0 flex flex-col h-screen w-screen overflow-hidden bg-background" 
           data-testid="main-layout">
        {/* Optional Header - z-index: 10 */}
        {header && (
          <header className="w-full border-b border-border bg-background z-10">
            {header}
          </header>
        )}
        
        {/* 
          Main Content Area - This is the flex container that holds the docking zones and viewport 
          flex-1: take up all remaining space
          flex: use flexbox for layout
          relative: for absolute positioning of children
          overflow-hidden: prevent scrolling
        */}
        <main className="flex-1 flex relative overflow-hidden" data-testid="main-content-area">
          {/* Left Dock Zone - Initially hidden, visible when panels are docked left */}
          <div
            id="left-dock-zone"
            className="h-full flex-shrink-0 z-20 transition-all duration-200"
            data-dock-zone="left"
          />
          
          {/* Central Viewport - Flex container for top/bottom dock zones and the viewport content */}
          <div className="flex-1 relative" data-testid="central-viewport-container">
            {/* Top Dock Zone - Initially visible with visualization panel */}
            <div 
              id="top-dock-zone" 
              className="w-full flex-shrink-0 z-20 transition-all duration-200"
              data-dock-zone="top"
            />
            
            {/* 
              Viewport Content - The container for the Three.js canvas 
              absolute inset-0: fill parent completely
              overflow-hidden: prevent scrolling
              z-index: 5: ensure it's above background but below controls
            */}
            <div className="absolute inset-0 overflow-hidden"
                 style={{ zIndex: 5 }}
                 data-testid="viewport-content-container">
              {viewportContent}
            </div>
            
            {/* Bottom Dock Zone - Initially hidden, visible when panels are docked bottom */}
            <div 
              id="bottom-dock-zone" 
              className="w-full flex-shrink-0 absolute bottom-0 z-20"
              data-dock-zone="bottom"
            />
          </div>
          
          {/* Right Dock Zone - Initially visible with XR and System panels */}
          <div 
            id="right-dock-zone" 
            className="h-full flex-shrink-0 z-20 transition-all duration-200"
            data-dock-zone="right"
          />
        </main>
        
        {/* Optional Footer - z-index: 10 */}
        {footer && (
          <footer className="w-full border-t border-border bg-background z-10">
            {footer}
          </footer>
        )}
        
        {/* Floating Panel Layer - z-index: 30, highest layer for floating panels */}
        <div
          id="floating-panels-container"
          className="absolute inset-0 pointer-events-none z-30 floating-panels-container"
          data-testid="floating-panels-container"
        >
          {/* Panels are rendered here and become pointer-events-auto individually */}
          {panels}
        </div>
      </div>
    </PanelProvider>
  );
};

export default MainLayout;