import { useEffect, useState } from 'react'
import AppInitializer from '@/components/AppInitializer'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import GraphCanvas from '@/components/graph/GraphCanvas'
import ControlPanel from '@/components/control-panel/ControlPanel'
import { useSettingsStore } from '@/lib/stores/settings-store'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const { initialize } = useSettingsStore()

  /*useEffect(() => {
    const initApp = async () => {
      try {
        await initialize()
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to initialize application:', error)
      }
    }

    initApp()
  }, [initialize])*/

  return (
    <ThemeProvider defaultTheme="dark">
      <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-xl">Loading...</div>
          </div>
        ) : (
          <>
            <GraphCanvas />
            <AppInitializer onInitialized={() => setIsLoading(false)} />
            <ControlPanel />
          </>
        )}
      </main>
      <Toaster />
    </ThemeProvider>
  )
}

export default App