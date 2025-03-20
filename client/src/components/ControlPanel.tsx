import React, { useState } from 'react'
import { useSettingsStore } from '../lib/stores/settings-store'
import { Settings } from '../lib/types/settings'
import { createLogger } from '../lib/utils/logger'
import NostrAuthSection from './NostrAuthSection'
import { SettingsSection } from './SettingsSection'
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { Button } from './ui/button'
import { SettingControl } from './types'

const logger = createLogger('ControlPanel')

// Settings categories for the control panel
const PANEL_SECTIONS = [
  {
    id: 'visualization',
    title: 'Visualization',
    icon: <Settings2 className="h-4 w-4" />,
    subsections: [
      { id: 'rendering', title: 'Rendering' },
      { id: 'nodes', title: 'Nodes' },
      { id: 'edges', title: 'Edges' },
      { id: 'labels', title: 'Labels' },
      { id: 'physics', title: 'Physics' },
    ]
  },
  {
    id: 'xr',
    title: 'VR/AR',
    icon: <Settings2 className="h-4 w-4" />,
    subsections: [
      { id: 'controls', title: 'Controls' },
      { id: 'environment', title: 'Environment' },
    ]
  },
  {
    id: 'system',
    title: 'System',
    icon: <Settings2 className="h-4 w-4" />,
    subsections: [
      { id: 'websocket', title: 'WebSocket' },
      { id: 'debug', title: 'Debug' },
    ]
  },
  {
    id: 'auth',
    title: 'Authentication',
    icon: <Settings2 className="h-4 w-4" />,
    subsections: []
  }
]

const ControlPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true)
  const [activeSection, setActiveSection] = useState('visualization')
  const [activeSubsection, setActiveSubsection] = useState<string | null>('rendering')
  const settings = useSettingsStore(state => state.settings)
  const setSettings = useSettingsStore(state => state.set)
  
  // Toggle panel open/closed
  const togglePanel = () => {
    setIsOpen(!isOpen)
  }
  
  // Update settings
  const updateSettings = <T extends unknown>(path: string, value: T) => {
    setSettings(path, value)
  }
  
  // Handle section change
  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId)
    
    // Set first subsection as active if available
    const section = PANEL_SECTIONS.find(s => s.id === sectionId)
    if (section && section.subsections.length > 0) {
      setActiveSubsection(section.subsections[0].id)
    } else {
      setActiveSubsection(null)
    }
  }
  
  // Handle subsection change
  const handleSubsectionChange = (subsectionId: string) => {
    setActiveSubsection(subsectionId)
  }
  
  // Get current active section
  const currentSection = PANEL_SECTIONS.find(s => s.id === activeSection)
  
  return (
    <div className={`fixed right-0 top-0 h-full transition-all duration-300 bg-background border-l border-border ${isOpen ? 'w-80' : 'w-12'}`}>
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-10 top-4 bg-background border border-border rounded-l-md rounded-r-none h-10 w-10"
        onClick={togglePanel}
        aria-label={isOpen ? 'Close panel' : 'Open panel'}
      >
        {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
      
      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Panel Header */}
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          
          {/* Panel Content */}
          <div className="flex flex-col md:flex-row h-full overflow-hidden">
            {/* Section Sidebar */}
            <div className="w-full md:w-1/3 border-r border-border p-2 overflow-y-auto">
              <nav className="space-y-1">
                {PANEL_SECTIONS.map(section => (
                  <button
                    key={section.id}
                    className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-2 ${
                      activeSection === section.id 
                        ? 'bg-primary text-primary-foreground' 
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => handleSectionChange(section.id)}
                  >
                    {section.icon}
                    <span>{section.title}</span>
                  </button>
                ))}
              </nav>
            </div>
            
            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeSection === 'auth' ? (
                <NostrAuthSection />
              ) : (
                <>
                  {/* Subsection Tabs if available */}
                  {currentSection && currentSection.subsections.length > 0 && (
                    <div className="border-b border-border mb-4">
                      <div className="flex space-x-2 overflow-x-auto">
                        {currentSection.subsections.map(subsection => (
                          <button
                            key={subsection.id}
                            className={`px-3 py-2 ${
                              activeSubsection === subsection.id
                                ? 'border-b-2 border-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() => handleSubsectionChange(subsection.id)}
                          >
                            {subsection.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Settings for current section/subsection */}
                  <SettingsSection
                    id={activeSection} 
                    title={currentSection?.title || ''}
                      settings={
                        activeSubsection && 
                      settings[activeSection] && 
                        settings[activeSection][activeSubsection] ? 
                          settings[activeSection][activeSubsection] as Record<string, SettingControl | Record<string, SettingControl>> : {}
                      }
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ControlPanel