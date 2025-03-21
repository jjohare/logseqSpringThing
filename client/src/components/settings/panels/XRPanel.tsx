import { useState } from 'react';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import Panel from '../../panel/Panel';
import PanelToolbar from '../../panel/PanelToolbar';
import { formatSettingLabel } from '../../../lib/types/settings-schema';
import { createLogger } from '../../../lib/utils/logger';
import { UISetting, isUISetting } from '../../../lib/types/ui-setting';
import { FormGroup, FormGroupControl } from '../../ui/form-group';

const logger = createLogger('XRPanel');

// Subsections for XR settings
const XR_SUBSECTIONS = [
  { id: 'controls', title: 'Controls' },
  { id: 'environment', title: 'Environment' }
];

interface XRPanelProps {
  /**
   * Panel ID for the panel system
   */
  panelId: string;
}

/**
 * XRPanel provides settings for XR (VR/AR) modes, including controls and environment settings.
 */
const XRPanel = ({ 
  panelId 
}: XRPanelProps) => {
  const [activeSubsection, setActiveSubsection] = useState('controls');
  
  const settings = useSettingsStore(state => state.settings);
  const setSettings = useSettingsStore(state => state.set);
  
  // Get XR settings for the active subsection
  const xrSettings: Record<string, UISetting> = 
    settings.xr && 
    settings.xr[activeSubsection] ? 
    settings.xr[activeSubsection] as Record<string, UISetting> : {};
  
  // Update a specific setting
  const updateSetting = (path: string, value: any) => {
    const fullPath = `xr.${activeSubsection}.${path}`;
    logger.debug(`Updating setting: ${fullPath}`, value);
    setSettings(fullPath, value);
  };
  
  // Toggle a boolean setting
  const toggleSetting = (path: string) => {
    const currentValue = xrSettings[path]?.value;
    if (typeof currentValue === 'boolean') {
      updateSetting(path, !currentValue);
    }
  };
  
  return (
    <Panel id={panelId}>
      {/* Panel Header */}
      <PanelToolbar 
        panelId={panelId}
        title="VR/AR Settings" 
        icon={
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />
      
      {/* Panel Content */}
      <div className="flex flex-col h-full">
        {/* Subsection Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {XR_SUBSECTIONS.map(subsection => (
            <button
              key={subsection.id}
              className={`px-3 py-2 ${
                activeSubsection === subsection.id
                  ? 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSubsection(subsection.id)}
            >
              {subsection.title}
            </button>
          ))}
        </div>
        
        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Controls Settings */}
          {activeSubsection === 'controls' && (
            <div className="space-y-6">
              {/* Use improved form groups for better styling */}
              {Object.entries(xrSettings).map(([key, setting]) => {
                if (typeof setting !== 'object' || setting === null) {
                  return null;
                }
                
                if (!('type' in setting)) {
                  return null;
                }
                
                // Format the label
                const label = formatSettingLabel(key);
                
                return (
                  <FormGroup 
                    key={key} 
                    label={label}
                    id={key}
                    helpText={setting.description}
                    advanced={setting.advanced}
                  >
                    <FormGroupControl>
                      {/* Render based on setting type */}
                      {setting.type === 'checkbox' && (
                        <div className="flex items-center space-x-2">
                          <input
                            id={key}
                            type="checkbox"
                            checked={setting.value}
                            className="rounded"
                            onChange={() => toggleSetting(key)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {setting.value ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
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
                    </FormGroupControl>
                  </FormGroup>
                );
              })}
              
              {/* XR Controls Information */}
              <div className="bg-muted p-4 rounded-md text-sm">
                <h4 className="font-medium mb-2">XR Control Information</h4>
                <p className="text-muted-foreground mb-2">
                  These settings control how interaction works in VR and AR modes.
                  When using a VR headset, you can use the controllers to interact with the visualization.
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Trigger button: Select</li>
                  <li>Grip button: Grab and move</li>
                  <li>Thumbstick: Navigate and rotate</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* Environment Settings */}
          {activeSubsection === 'environment' && (
            <div className="space-y-6">
              {/* Environment settings */}
              {Object.entries(xrSettings).map(([key, setting]) => {
                if (typeof setting !== 'object' || setting === null) {
                  return null;
                }
                
                if (!('type' in setting)) {
                  return null;
                }
                
                // Format the label
                const label = formatSettingLabel(key);
                
                return (
                  <FormGroup 
                    key={key} 
                    label={label}
                    id={key}
                    helpText={setting.description}
                    advanced={setting.advanced}
                  >
                    <FormGroupControl>
                      {/* Render specific controls for environment settings */}
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
                    </FormGroupControl>
                  </FormGroup>
                );
              })}
              
              {/* XR Environment Information */}
              <div className="bg-muted p-4 rounded-md text-sm">
                <h4 className="font-medium mb-2">XR Environment</h4>
                <p className="text-muted-foreground">
                  These settings control the visual environment in VR and AR modes,
                  including background, lighting, and scale.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};

export default XRPanel;