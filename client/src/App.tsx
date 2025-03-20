import { useEffect, useState } from 'react'
import AppInitializer from './components/AppInitializer'
import { ThemeProvider } from './components/ui/theme-provider'
import { Toaster } from './components/ui/toaster'
import GraphCanvas from './components/graph/GraphCanvas'
import ControlPanel from './components/ControlPanel'
import { useSettingsStore } from './lib/settings-store'
import { createLogger } from './lib/utils/logger'

const logger = createLogger('App')

function App() {
  const [isLoading, setIsLoading] = useState(true)
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
          <>
            <GraphCanvas />
            <ControlPanel />
          </>
        )}
        
        {/* AppInitializer is always rendered but doesn't show anything */}
        <AppInitializer onInitialized={handleInitialized} />
      </main>
      <Toaster />
    </ThemeProvider>
  )
}

export default App