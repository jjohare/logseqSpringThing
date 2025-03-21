import React, { useState } from 'react'
import { useSettingsStore } from '../lib/stores/settings-store'
import { createLogger } from '../lib/utils/logger'
import NostrAuthSection from './NostrAuthSection'
import { ControlPanelProvider } from './control-panel-context'
import { SettingsSection } from './SettingsSection'
import TabPanel from './panel/TabPanel'
import Tabs from './panel/PanelTabs'
import { X, ChevronDown, ChevronUp } from 'lucide-react'

const logger = createLogger('ControlPanel')

// Settings categories for the control panel
const PANEL_SECTIONS = [
  {
    id: 'visualization',
    title: 'Visualization',
    icon: '⚙️',
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
    icon: '🥽',
    subsections: [
      { id: 'controls', title: 'Controls' },
      { id: 'environment', title: 'Environment' },
    ]
  },
  {
    id: 'system',
    title: 'System',
    icon: '🖥️',
    subsections: [
      { id: 'websocket', title: 'WebSocket' },
      { id: 'debug', title: 'Debug' },
    ]
  },
  {
    id: 'auth',
    title: 'Authentication',
    icon: '🔒',
    subsections: []
  }
]

const ControlPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true)
  const [activeSection, setActiveSection] = useState('visualization')
  const [activeSubsection, setActiveSubsection] = useState<string | null>('rendering')
  const settings = useSettingsStore(state => state.settings)
  
  // Toggle panel open/closed
  const togglePanel = () => {
    setIsOpen(!isOpen)
  }
  
  // Handle section change
  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId)
    
    // Set first subsection as active if available
    const section = PANEL_SECTIONS.find(s => s.id === sectionId)
    
    // For Authentication, we don't need subsections
    if (sectionId === 'auth') {
      setActiveSubsection(null)
    } else if (section && section.subsections.length > 0) {
      // Set the first subsection as active
      const subsectionId = section.subsections[0].id
      setActiveSubsection(subsectionId)
    } else {
      setActiveSubsection(null)
    }
  }
  
  // Create tabs based on the current section's subsections
  const createTabs = () => {
    const section = PANEL_SECTIONS.find(s => s.id === activeSection)
    
    if (!section || section.subsections.length === 0) {
      return []
    }
    
    return section.subsections.map(subsection => ({
      id: subsection.id,
      title: subsection.title,
      content: (
        <SettingsSection
          id={activeSection}
          title={section.title}
          settings={
            settings[activeSection] && 
            settings[activeSection][subsection.id] ? 
              settings[activeSection][subsection.id] as Record<string, any> : 
              {}
          }
        />
      )
    }))
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
      <button
        className="absolute -left-10 top-4 bg-background border border-border rounded-l-md rounded-r-none h-10 w-10"
        onClick={togglePanel}
        aria-label={isOpen ? 'Close panel' : 'Open panel'}
      >
        {isOpen ? '→' : '←'}
      </button>
      
      {isOpen && (
        <ControlPanelProvider>
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
                      <span>{section.icon}</span>
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
                    {/* Modern tab navigation for subsections */}
                    {currentSection && currentSection.subsections.length > 0 ? (
                      <div className="w-full h-full">
                        <Tabs
                          tabs={createTabs()}
                          defaultTabId={activeSubsection || undefined}
                          orientation="horizontal"
                        />
                      </div>
                    ) : (
                      <SettingsSection 
                        id={activeSection} 
                        title={currentSection?.title || ''} 
                        settings={settings[activeSection] as Record<string, any> || {}} 
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </ControlPanelProvider>
      )}
    </div>
  )
}

export default ControlPanel