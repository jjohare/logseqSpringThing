import React, { useState, lazy, Suspense } from 'react';
import { useSettingsStore } from '../lib/stores/settings-store';
import { createLogger } from '../lib/utils/logger';
import NostrAuthSection from './NostrAuthSection';
import { SettingsSection } from './SettingsSection';
import {
  Settings2,
  Palette,
  Layers,
  Cpu,
  VrHeadset,
  Network,
  KeyRound
} from 'lucide-react';
import Panel from './panel/Panel';
import { usePanel } from './panel/PanelContext';
import ThemeSelector from './ui/theme-selector';

const logger = createLogger('ControlPanel');

// Lazy load heavy components
const LazyThemeSelector = lazy(() => import('./ui/theme-selector'));

// Settings categories for the control panel
const PANEL_SECTIONS = [
  {
    id: 'visualization',
    title: 'Visualization',
    icon: <Layers className="h-4 w-4" />,
    subsections: [
      { id: 'rendering', title: 'Rendering' },
      { id: 'nodes', title: 'Nodes' },
      { id: 'edges', title: 'Edges' },
      { id: 'labels', title: 'Labels' },
      { id: 'physics', title: 'Physics' },
    ]
  },
  {
    id: 'appearance',
    title: 'Appearance',
    icon: <Palette className="h-4 w-4" />,
    subsections: []
  },
  {
    id: 'xr',
    title: 'VR/AR',
    icon: <VrHeadset className="h-4 w-4" />,
    subsections: [
      { id: 'controls', title: 'Controls' },
      { id: 'environment', title: 'Environment' },
    ]
  },
  {
    id: 'system',
    title: 'System',
    icon: <Cpu className="h-4 w-4" />,
    subsections: [
      { id: 'websocket', title: 'WebSocket' },
      { id: 'debug', title: 'Debug' },
    ]
  },
  {
    id: 'auth',
    title: 'Authentication',
    icon: <KeyRound className="h-4 w-4" />,
    subsections: []
  }
];

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-4 h-40">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
  </div>
);

const ControlPanel = () => {
  const [activeSection, setActiveSection] = useState('visualization');
  const [activeSubsection, setActiveSubsection] = useState('rendering');
  const settings = useSettingsStore(state => state.settings);
  const setSettings = useSettingsStore(state => state.set);
  const { panels } = usePanel();

  // Update settings
  const updateSettings = (path, value) => {
    setSettings(path, value);
  };

  // Handle section change
  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    // Set first subsection as active if available
    const section = PANEL_SECTIONS.find(s => s.id === sectionId);
    if (section && section.subsections.length > 0) {
      setActiveSubsection(section.subsections[0].id);
    }
    else {
      setActiveSubsection(null);
    }
  };

  // Handle subsection change
  const handleSubsectionChange = (subsectionId) => {
    setActiveSubsection(subsectionId);
  };

  // Get current active section
  const currentSection = PANEL_SECTIONS.find(s => s.id === activeSection);

  // Render content based on active section
  const renderContent = () => {
    if (activeSection === 'auth') {
      return <NostrAuthSection />;
    }
    
    if (activeSection === 'appearance') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <LazyThemeSelector />
        </Suspense>
      );
    }
    
    return (
      <>
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

        <SettingsSection
          id={activeSection}
          title={currentSection?.title || ''}
          settings={
            activeSubsection &&
            settings[activeSection] &&
            settings[activeSection][activeSubsection]
              ? settings[activeSection][activeSubsection]
              : {}
          }
        />
      </>
    );
  };

  return (
    <Panel id="settings" initialWidth={320} initialHeight={600} minWidth={250} minHeight={300}>
      <div className="flex flex-col h-full overflow-hidden">
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

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}
          </div>
        </div>
      </div>
    </Panel>
  );
};

export default ControlPanel;