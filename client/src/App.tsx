import { useEffect, useState } from 'react'
import AppInitializer from './components/AppInitializer'
import { ThemeProvider } from './components/ui/theme-provider'
import { ApplicationModeProvider } from './components/context/ApplicationModeContext'
import { Toaster } from './components/ui/toaster'
import GraphCanvas from './components/graph/GraphCanvas'
import ViewportContainer from './components/layout/ViewportContainer'
import MainLayout from './components/layout/MainLayout'
import DockingZone from './components/panel/DockingZone'
import ViewportControls from './components/viewport/ViewportControls'
import { PanelProvider } from './components/panel/PanelContext'
import VisualizationPanel from './components/settings/panels/VisualizationPanel'
import XRPanel from './components/settings/panels/XRPanel'
import SystemPanel from './components/settings/panels/SystemPanel'
import { useSettingsStore } from './lib/stores/settings-store'
import { createLogger } from './lib/utils/logger'
import './styles/tokens.css'
import './styles/layout.css'

const logger = createLogger('App')

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(false)
  const [showRightPanel, setShowRightPanel] = useState(true)
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

  return (
    <ThemeProvider defaultTheme="dark">
      <ApplicationModeProvider>
        <PanelProvider>
          <div className="app-container">
            <MainLayout
              viewportContent={
                <ViewportContainer>
                  <GraphCanvas />
                  
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
                    />
                  )}
                </ViewportContainer>
              }
              panels={
                !isLoading && (
                  <>
                    {/* Left Dock Zone */}
                    <DockingZone position="left" className={showLeftPanel ? 'active' : ''} />
                    
                    {/* Right Dock Zone */}
                    <DockingZone position="right" className={showRightPanel ? 'active' : ''}>
                      <div className="panel-group h-full">
                        <VisualizationPanel panelId="visualization" />
                        <XRPanel panelId="xr" />
                        <SystemPanel panelId="system" />
                      </div>
                    </DockingZone>
                  </>
                )
              }
            />
            <AppInitializer onInitialized={handleInitialized} />
          </div>
        </PanelProvider>
      </ApplicationModeProvider>
      <Toaster />
    </ThemeProvider>
  )
}

export default App