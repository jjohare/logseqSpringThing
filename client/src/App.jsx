import { useEffect, useState, lazy, Suspense } from 'react';
import AppInitializer from './components/AppInitializer';
import { ThemeProvider } from './components/ui/theme-provider';
import { Toaster } from './components/ui/toaster';
import GraphCanvas from './components/graph/GraphCanvas';
import { useSettingsStore } from './lib/stores/settings-store';
import { createLogger } from './lib/utils/logger';
import PanelManager from './components/panel/PanelManager';
import { usePanel } from './components/panel/PanelContext';

// Lazy load panels for better performance
const LazyControlPanel = lazy(() => import('./components/ControlPanel'));
const LazyConsolePanel = lazy(() => import('./components/ConsolePanel'));

// Create a placeholder for the ConsolePanel component if it doesn't exist
const ConsolePanelPlaceholder = () => {
  return (
    <div className="p-4">
      <h2 className="text-lg font-medium mb-4">Console</h2>
      <div className="text-muted-foreground">Console output will appear here.</div>
    </div>
  );
};

// Dynamically import the ConsolePanel component if it exists, otherwise use placeholder
const ConsolePanel = lazy(() =>
  import('./components/ConsolePanel')
    .catch(() => ({ default: ConsolePanelPlaceholder }))
);

const logger = createLogger('App');

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex h-full w-full items-center justify-center p-4">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
  </div>
);

// Responsive layout handler
const ResponsiveLayoutHandler = () => {
  const { applyLayout } = usePanel();
  const [prevWidth, setPrevWidth] = useState(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      
      // Apply different layouts based on screen size
      if (currentWidth < 640 && prevWidth >= 640) {
        // Small screens (mobile)
        applyLayout('mobile');
        setPrevWidth(currentWidth);
      } else if (currentWidth >= 640 && currentWidth < 1024 && (prevWidth < 640 || prevWidth >= 1024)) {
        // Medium screens (tablet)
        applyLayout('compact');
        setPrevWidth(currentWidth);
      } else if (currentWidth >= 1024 && prevWidth < 1024) {
        // Large screens (desktop)
        applyLayout('default');
        setPrevWidth(currentWidth);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Initial layout based on screen size
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, [applyLayout, prevWidth]);
  
  return null;
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const { initialized } = useSettingsStore(state => ({
    initialized: state.initialized
  }));

  useEffect(() => {
    // If settings are already initialized (e.g., from localStorage via zustand-persist),
    // we can skip the loading state
    if (initialized) {
      setIsLoading(false);
    }
    
    // Check for mobile devices
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initialized]);

  const handleInitialized = () => {
    setIsLoading(false);
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="text-2xl">Loading Graph Visualization</div>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-700">
                <div className="animate-pulse h-full bg-primary"></div>
              </div>
            </div>
          </div>
        ) : (
          <PanelManager>
            {/* Responsive layout handler */}
            <ResponsiveLayoutHandler />
            
            {/* Main Visualization Area - Takes full screen */}
            <div className="absolute inset-0">
              <GraphCanvas />
            </div>
            
            {/* Lazy-loaded Panels */}
            <Suspense fallback={<LoadingSpinner />}>
              <LazyControlPanel />
            </Suspense>
            
            <Suspense fallback={<LoadingSpinner />}>
              <LazyConsolePanel />
            </Suspense>
            
            {/* Mobile-specific UI elements */}
            {isMobile && (
              <div className="fixed bottom-16 left-0 right-0 z-40 flex justify-center pointer-events-none">
                <div className="bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg pointer-events-auto">
                  <div className="text-xs text-center text-muted-foreground">
                    Mobile view active
                  </div>
                </div>
              </div>
            )}
          </PanelManager>
        )}
        
        <AppInitializer onInitialized={handleInitialized} />
      </main>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;