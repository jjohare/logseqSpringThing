import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { SettingsSection } from './SettingsSection'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/utils/logger'
import { settingsConfig } from './settings-config'
import { ActionButtons } from './ActionButtons'
import { NostrAuthSection } from './NostrAuthSection'
import { ControlPanelProvider } from './control-panel-context'

const logger = createLogger('ControlPanel')

export default function ControlPanel() {
  const [isVisible, setIsVisible] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const { settings } = useSettingsStore()

  useEffect(() => {
    // Check if Control Panel should be visible based on platform
    const checkPlatform = () => {
      // In a real implementation, we would check the platform
      // For now, always show on desktop, hide in XR mode
      const isXrMode = false
      const isQuest = false
      
      if (isXrMode || isQuest) {
        setIsVisible(false)
      } else {
        setIsVisible(true)
      }
    }

    checkPlatform()
    setInitialized(true)

    // Listen for platform changes
    window.addEventListener('platformchange', checkPlatform)
    window.addEventListener('xrmodechange', (e: any) => {
      if (e.detail?.isXrMode) {
        setIsVisible(false)
      } else {
        checkPlatform()
      }
    })

    return () => {
      window.removeEventListener('platformchange', checkPlatform)
      window.removeEventListener('xrmodechange', checkPlatform)
    }
  }, [])

  const toggleVisibility = () => {
    setIsVisible(!isVisible)
  }

  if (!initialized) {
    return null
  }

  return (
    <ControlPanelProvider>
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full p-2"
          onClick={toggleVisibility}
          aria-label={isVisible ? 'Hide settings' : 'Show settings'}
        >
          {isVisible ? 'Hide Settings' : '⚙️'}
        </Button>
      </div>

      {isVisible && (
        <div
          id="control-panel"
          className="settings-panel overflow-auto"
          style={{ maxHeight: 'calc(100vh - 100px)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Settings</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleVisibility}
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Authentication Section */}
          <NostrAuthSection />

          {/* Actions Section */}
          <ActionButtons />

          {/* Settings Sections */}
          <div className="space-y-4">
            {Object.entries(settingsConfig).map(([category, config]) => (
              <SettingsSection 
                key={category}
                id={category}
                title={config.title}
                settings={config.settings}
                advanced={config.advanced}
              />
            ))}
          </div>
        </div>
      )}
    </ControlPanelProvider>
  )
}