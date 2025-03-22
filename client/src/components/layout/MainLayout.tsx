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
  const { initialized } = useSettingsStore(state => ({
    initialized: state.initialized
  }));

  return (
    <PanelProvider>
      <div className="fixed inset-0 flex flex-col h-screen w-screen overflow-hidden bg-background">
        {/* Optional Header */}
        {header && (
          <header className="w-full border-b border-border bg-background z-10">
            {header}
          </header>
        )}
        
        {/* Main Content Area */}
        <main className="flex-1 flex relative overflow-hidden">
          {/* Left Dock Zone */}
          <div 
            id="left-dock-zone" 
            className="h-full flex-shrink-0 z-20"
            data-dock-zone="left"
          />
          
          {/* Central Viewport */}
          <div className="flex-1 relative">
            {/* Top Dock Zone */}
            <div 
              id="top-dock-zone" 
              className="w-full flex-shrink-0 z-20 transition-all duration-200"
              data-dock-zone="top"
            />
            
            {/* Viewport Content */}
            <div className="absolute inset-0">
              {viewportContent}
            </div>
            
            {/* Bottom Dock Zone */}
            <div 
              id="bottom-dock-zone" 
              className="w-full flex-shrink-0 absolute bottom-0 z-20"
              data-dock-zone="bottom"
            />
          </div>
          
          {/* Right Dock Zone */}
          <div 
            id="right-dock-zone" 
            className="h-full flex-shrink-0 z-20"
            data-dock-zone="right"
          />
        </main>
        
        {/* Optional Footer */}
        {footer && (
          <footer className="w-full border-t border-border bg-background z-10">
            {footer}
          </footer>
        )}
        
        {/* Floating Panel Layer */}
        <div 
          id="floating-panels-container" 
          className="absolute inset-0 pointer-events-none z-30"
        >
          {/* Panels are rendered here and become pointer-events-auto individually */}
          {panels}
        </div>
      </div>
    </PanelProvider>
  );
};

export default MainLayout;