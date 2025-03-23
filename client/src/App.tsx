import { useEffect, useState, Component, ReactNode } from 'react'
import AppInitializer from './components/AppInitializer'
import { ThemeProvider } from './components/ui/theme-provider'
import { ApplicationModeProvider } from './components/context/ApplicationModeContext'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'
import GraphCanvas from './components/graph/GraphCanvas'
import ViewportContainer from './components/layout/ViewportContainer'
import SafeXRProvider from './lib/xr/SafeXRProvider'
import MainLayout from './components/layout/MainLayout'
import DockingZone from './components/panel/DockingZone'
import ViewportControls from './components/viewport/ViewportControls'
import { PanelProvider } from './components/panel/PanelContext'
import VisualizationPanel from './components/settings/panels/VisualizationPanel'
import XRPanel from './components/settings/panels/XRPanel'
import SystemPanel from './components/settings/panels/SystemPanel'
import { WindowSizeProvider } from './lib/contexts/WindowSizeContext'
import { useSettingsStore } from './lib/stores/settings-store'
import { createLogger, createErrorMetadata } from './lib/utils/logger'
import './styles/tokens.css'
import './styles/layout.css'

const logger = createLogger('App')

// Error boundary component to catch rendering errors
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean; error: any; errorInfo: any }> {
  state = { hasError: false, error: null, errorInfo: null };  
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: any, errorInfo: any) {
    logger.error('React error boundary caught error:', {
      ...createErrorMetadata(error),
      component: errorInfo?.componentStack 
        ? errorInfo.componentStack.split('\n')[1]?.trim() 
        : 'Unknown component'
    });
    this.setState({ errorInfo });
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-destructive text-destructive-foreground rounded-md">
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="mb-4">The application encountered an error. Try refreshing the page.</p>
          {process.env.NODE_ENV === 'development' && (
            <pre className="bg-muted p-2 rounded text-sm overflow-auto">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(false)
  const [showTopPanel, setShowTopPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [topPanelDense, setTopPanelDense] = useState(true)
  const { initialized } = useSettingsStore(state => ({
    initialized: state.initialized
  }))

  useEffect(() => {
    // If settings are already initialized (e.g., from localStorage via zustand-persist),
    // we can skip the loading state
    if (initialized) {
      setIsLoading(false)
    }
  }, [initialized])

  const handleInitialized = () => {
    const settings = useSettingsStore.getState().settings;
    const debugEnabled = settings?.debug?.enabled === true;
    if (debugEnabled) {
      logger.debug('Application initialized');
    }
    setIsLoading(false)
  }
  
  // Viewport control handlers
  const handleResetCamera = () => {
    logger.debug('Reset camera')
    // TODO: Implement camera reset
  }
  
  const handleZoomIn = () => {
    logger.debug('Zoom in')
    // TODO: Implement zoom in
  }
  
  const handleZoomOut = () => {
    logger.debug('Zoom out')
    // TODO: Implement zoom out
  }
  
  const handleToggleFullscreen = () => {
    logger.debug('Toggle fullscreen')
    // TODO: Implement fullscreen toggle
  }
  
  const handleRotateView = () => {
    logger.debug('Rotate view')
    // TODO: Implement view rotation
  }
  
  const handleToggleLeftPanel = () => {
    setShowLeftPanel(!showLeftPanel)
  }
  
  const handleToggleRightPanel = () => {
    setShowRightPanel(!showRightPanel)
  }
  
  // Toggle top visualization panel
  const handleToggleTopPanel = () => {
    setShowTopPanel(!showTopPanel)
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <WindowSizeProvider>
        <ErrorBoundary>
        <ApplicationModeProvider> {/* Application-wide mode context */}
          <PanelProvider> {/* Panel system management */}
            <TooltipProvider> {/* UI tooltips */}
              <SafeXRProvider> {/* XR context with fallbacks */}
                <div className="app-container"> {/* Main application container */}
                  <MainLayout
                    viewportContent={
                      <ViewportContainer onResize={(width, height) => {
                        const settings = useSettingsStore.getState().settings;
                        const debugEnabled = settings?.debug?.enabled === true;
                        if (debugEnabled) {
                          logger.debug(`ViewportContainer resized: ${Math.round(width)}×${Math.round(height)}`);
                        }
                      }}>
                        {/* Error boundary for 3D visualization */}
                        <ErrorBoundary fallback={
                          <div className="flex items-center justify-center h-full">
                            <div className="p-4 bg-destructive/20 text-destructive-foreground rounded-md max-w-md">
                              <h2 className="text-xl font-bold mb-2">Visualization Error</h2>
                              <p>The 3D visualization component could not be loaded.</p>
                              <p className="text-sm mt-2">This may be due to WebGL compatibility issues or problems with the graph data.</p>
                            </div>
                          </div>
                        }>
                          <GraphCanvas />
                        </ErrorBoundary>
                        
                        {/* Loading Overlay */}
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                            <div className="flex flex-col items-center space-y-4">
                              <div className="text-2xl">Loading Graph Visualization</div>
                              <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-700">
                                <div className="animate-pulse h-full bg-primary"></div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Viewport Controls */}
                        {!isLoading && (
                          <ViewportControls
                            onReset={handleResetCamera}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onToggleFullscreen={handleToggleFullscreen}
                            onRotate={handleRotateView}
                            onToggleLeftPanel={handleToggleLeftPanel}
                            onToggleRightPanel={handleToggleRightPanel}
                            onToggleTopPanel={handleToggleTopPanel}
                          />
                        )}
                      </ViewportContainer>
                   }
                    panels={
                      !isLoading && (
                        <>
                          {/* Left Dock Zone */}
                          <DockingZone 
                            position="left" 
                            className={showLeftPanel ? 'active' : ''}
                          defaultSize={300}
                          />
                          
                          {/* Top Dock Zone - Visualization Controls */}
                          <DockingZone 
                            position="top" 
                            className={showTopPanel ? 'active' : ''} 
                            defaultSize={topPanelDense ? 300 : 450}
                            expandable={true}
                          autoSize={false}
                          >
                            <div className="panel-group h-full flex">
                              <VisualizationPanel panelId="visualization-top" horizontal={true} />
                              <div className="flex-1"></div>
                            </div>
                          </DockingZone>
                          
                          {/* Right Dock Zone */}
                          <DockingZone 
                            position="right" 
                            className={showRightPanel ? 'active' : ''}
                            expandable={true}
                          defaultSize={300}
                          autoSize={false}
                          >
                            <div className="panel-group h-full">
                              <XRPanel panelId="xr" />
                              <SystemPanel panelId="system" />
                            </div>
                          </DockingZone>
                        </>
                      )
                    }
                  />
                  <AppInitializer onInitialized={handleInitialized} />
                </div> {/* End app-container */}
              </SafeXRProvider> {/* End SafeXRProvider */}
            </TooltipProvider> {/* End TooltipProvider */}
          </PanelProvider> {/* End PanelProvider */}
        </ApplicationModeProvider> {/* End ApplicationModeProvider */}
        <Toaster />
        </ErrorBoundary>
      </WindowSizeProvider>
    </ThemeProvider>
  )
}

export default App