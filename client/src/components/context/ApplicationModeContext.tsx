import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('ApplicationModeContext');

/**
 * Available application modes
 */
export type ApplicationMode = 'desktop' | 'mobile' | 'xr';

interface ApplicationModeContextType {
  /**
   * Current application mode
   */
  mode: ApplicationMode;
  
  /**
   * Previous mode before the current one
   */
  previousMode: ApplicationMode | null;
  
  /**
   * Whether the application is currently in XR mode
   */
  isXRMode: boolean;
  
  /**
   * Whether the application is in mobile view
   */
  isMobileView: boolean;
  
  /**
   * Set application mode
   */
  setMode: (mode: ApplicationMode) => void;
  
  /**
   * Layout settings specific to the current mode
   */
  layoutSettings: {
    /**
     * Whether to show panels in the current mode
     */
    showPanels: boolean;
    
    /**
     * Whether to show the viewport in the current mode
     */
    showViewport: boolean;
    
    /**
     * Whether to show UI controls in the current mode
     */
    showControls: boolean;
  };
}

const defaultContext: ApplicationModeContextType = {
  mode: 'desktop',
  previousMode: null,
  isXRMode: false,
  isMobileView: false,
  setMode: () => {},
  layoutSettings: {
    showPanels: true,
    showViewport: true,
    showControls: true
  }
};

// Create the context
const ApplicationModeContext = createContext<ApplicationModeContextType>(defaultContext);

/**
 * Provider component for application mode
 */
export const ApplicationModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ApplicationMode>('desktop');
  const [previousMode, setPreviousMode] = useState<ApplicationMode | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  
  // Check for mobile view on mount and resize
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768; // Breakpoint for mobile view
      setIsMobileView(isMobile);
      
      // Auto-switch to mobile mode based on screen size
      // but don't override XR mode
      if (isMobile && mode !== 'xr') {
        setMode('mobile');
      } else if (!isMobile && mode === 'mobile') {
        setMode('desktop');
      }
    };
    
    // Initial check
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mode]);
  
  // Handle mode change
  const handleModeChange = (newMode: ApplicationMode) => {
    logger.info(`Changing mode: ${mode} -> ${newMode}`);
    setPreviousMode(mode);
    setMode(newMode);
  };
  
  // Compute layout settings based on current mode
  const getLayoutSettings = () => {
    switch (mode) {
      case 'desktop':
        return {
          showPanels: true,
          showViewport: true,
          showControls: true
        };
      case 'mobile':
        return {
          showPanels: true,
          showViewport: true,
          showControls: true
        };
      case 'xr':
        return {
          showPanels: false,
          showViewport: true,
          showControls: false
        };
      default:
        return {
          showPanels: true,
          showViewport: true,
          showControls: true
        };
    }
  };
  
  const contextValue: ApplicationModeContextType = {
    mode,
    previousMode,
    isXRMode: mode === 'xr',
    isMobileView,
    setMode: handleModeChange,
    layoutSettings: getLayoutSettings()
  };
  
  return (
    <ApplicationModeContext.Provider value={contextValue}>
      {children}
    </ApplicationModeContext.Provider>
  );
};

/**
 * Hook to use the application mode context
 */
export const useApplicationMode = () => {
  const context = useContext(ApplicationModeContext);
  if (!context) {
    throw new Error('useApplicationMode must be used within an ApplicationModeProvider');
  }
  return context;
};