import { useState } from 'react';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import Panel from '../../panel/Panel';
import PanelToolbar from '../../panel/PanelToolbar';
import { formatSettingLabel } from '../../../lib/types/settings-schema';
import { UISetting, isUISetting } from '../../../lib/types/ui-setting';
import { createLogger } from '../../../lib/utils/logger';
import { Eye, CircleDashed, Circle, BrushIcon, MoveHorizontal } from 'lucide-react';

const logger = createLogger('VisualizationPanel');

// Subsections for visualization settings
const VISUALIZATION_SUBSECTIONS = [
  { id: 'rendering', title: 'Rendering', icon: <Eye className="h-4 w-4" /> },
  { id: 'nodes', title: 'Nodes', icon: <Circle className="h-4 w-4" /> },
  { id: 'edges', title: 'Edges', icon: <MoveHorizontal className="h-4 w-4" /> },
  { id: 'labels', title: 'Labels', icon: <BrushIcon className="h-4 w-4" /> },
  { id: 'physics', title: 'Physics', icon: <CircleDashed className="h-4 w-4" /> },
];

interface VisualizationPanelProps {
  /**
   * Panel ID for the panel system
   */
  panelId: string;
  
  /**
   * Whether this panel is displayed in a horizontal layout (top/bottom)
   * Automatically detected from panel ID if not specified
   */
  horizontal?: boolean;
}

/**
 * VisualizationPanel provides a comprehensive interface for managing all visualization settings.
 * This includes rendering options, node/edge appearance, and physics simulation parameters.
 */
const VisualizationPanel = ({ 
  panelId,
  horizontal = panelId.includes('-top') || panelId.includes('horizontal') 
}: VisualizationPanelProps) => {
  const [activeSubsection, setActiveSubsection] = useState('rendering');
  
  const settings = useSettingsStore(state => state.settings);
  const setSettings = useSettingsStore(state => state.set);
  
  // Get visualization settings for the active subsection
  const visualizationSettings: Record<string, UISetting> = 
    settings.visualization && 
    settings.visualization[activeSubsection] ? 
    settings.visualization[activeSubsection] as Record<string, UISetting> : {};
  
  // Update a specific setting
  const updateSetting = (path: string, value: any) => {
    const fullPath = `visualization.${activeSubsection}.${path}`;
    logger.debug(`Updating setting: ${fullPath}`, value);
    setSettings(fullPath, value);
  };
  
  return (
    <Panel id={panelId}>
      {/* Panel Header */}
      <PanelToolbar 
        panelId={panelId}
        title="Visualization Settings" 
        icon={<Eye className="h-4 w-4" />}
      />
      
      {/* Panel Content */}
      <div className={`${horizontal ? 'flex flex-row h-full' : 'flex flex-col h-full'}`}>
        {/* Subsection Tabs - Horizontal layout when in top panel */}
        <div className={`flex ${horizontal ? 'flex-col border-r' : 'border-b'} border-border overflow-auto`}>
          {VISUALIZATION_SUBSECTIONS.map(subsection => (
            <button
              key={subsection.id}
              className={`flex items-center px-3 py-2 ${
                activeSubsection === subsection.id
                  ? horizontal 
                    ? 'border-r-2 border-primary font-medium' 
                    : 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSubsection(subsection.id)}
            >
              {subsection.icon && <span className="mr-2">{subsection.icon}</span>}
              {subsection.title}
            </button>
          ))}
        </div>
        
        {/* Settings Content */}
        <div className={`flex-1 overflow-auto p-4 ${horizontal ? 'grid grid-cols-2 gap-4' : 'space-y-6'}`}>
          {/* Dynamic Settings Renderer */}
          {Object.entries(visualizationSettings).map(([key, setting]) => {
            if (typeof setting !== 'object' || setting === null) {
              return null;
            }
            
            // Skip if this is a nested object of settings (handled separately)
            if (!('type' in setting)) {
              return null;
            }
            
            // Format the label
            const label = formatSettingLabel(key);
            
            // Render appropriate control based on setting type
            return (
              <div key={key} className={`${horizontal ? 'mb-4' : 'space-y-2'} setting-container`}>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium" htmlFor={key}>
                    {label}
                  </label>
                  
                  {/* Optional help text rendered as tooltip icon */}
                  {setting.help && (
                    <span className="text-muted-foreground text-xs">
                      {setting.help}
                    </span>
                  )}
                </div>
                
                {/* Type-specific control rendering */}
                {setting.type === 'slider' && (
                  <div className="flex items-center space-x-2">
                    <input
                      id={key}
                      type="range"
                      value={setting.value}
                      min={setting.min || 0}
                      max={setting.max || 100}
                      step={setting.step || 1}
                      className="w-full"
                      onChange={(e) => updateSetting(key, parseFloat(e.target.value))}
                    />
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {setting.value}{setting.unit || ''}
                    </span>
                  </div>
                )}
                
                {setting.type === 'checkbox' && (
                  <div className="flex items-center space-x-2">
                    <input
                      id={key}
                      type="checkbox"
                      checked={setting.value}
                      className="rounded"
                      onChange={(e) => updateSetting(key, e.target.checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {setting.value ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                )}
                
                {setting.type === 'color' && (
                  <div className="flex items-center space-x-2">
                    <input
                      id={key}
                      type="color"
                      value={setting.value}
                      className="w-8 h-8 rounded cursor-pointer"
                      onChange={(e) => updateSetting(key, e.target.value)}
                    />
                    <span className="text-sm font-mono text-muted-foreground">
                      {setting.value}
                    </span>
                  </div>
                )}
                
                {setting.type === 'text' && (
                  <input
                    id={key}
                    type="text"
                    value={setting.value}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-1"
                    onChange={(e) => updateSetting(key, e.target.value)}
                  />
                )}
                
                {setting.type === 'select' && setting.options && (
                  <select
                    id={key}
                    value={setting.value}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-1"
                    onChange={(e) => updateSetting(key, e.target.value)}
                  >
                    {setting.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                
                {/* Setting description */}
                {setting.description && (
                  <p className="text-xs text-muted-foreground">
                    {setting.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
};

export default VisualizationPanel;