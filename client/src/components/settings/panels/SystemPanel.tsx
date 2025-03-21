import { useState } from 'react';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import Panel from '../../panel/Panel';
import PanelToolbar from '../../panel/PanelToolbar';
import { formatSettingLabel } from '../../../lib/types/settings-schema';
import { FormGroup, FormGroupControl } from '../../ui/form-group';
import { createLogger } from '../../../lib/utils/logger';

const logger = createLogger('SystemPanel');

// Subsections for system settings
const SYSTEM_SUBSECTIONS = [
  { id: 'websocket', title: 'WebSocket' },
  { id: 'debug', title: 'Debug' }
];

interface SystemPanelProps {
  /**
   * Panel ID for the panel system
   */
  panelId: string;
}

/**
 * SystemPanel provides access to system-level settings and debug options.
 */
const SystemPanel = ({ 
  panelId 
}: SystemPanelProps) => {
  const [activeSubsection, setActiveSubsection] = useState('websocket');
  
  const settings = useSettingsStore(state => state.settings);
  const setSettings = useSettingsStore(state => state.set);
  
  // Get system settings for the active subsection
  const systemSettings = 
    settings.system && 
    settings.system[activeSubsection] ? 
    settings.system[activeSubsection] : {};
  
  // Update a specific setting
  const updateSetting = (path: string, value: any) => {
    const fullPath = `system.${activeSubsection}.${path}`;
    logger.debug(`Updating setting: ${fullPath}`, value);
    setSettings(fullPath, value);
  };
  
  // Toggle a boolean setting
  const toggleSetting = (path: string) => {
    const currentValue = systemSettings[path]?.value;
    if (typeof currentValue === 'boolean') {
      updateSetting(path, !currentValue);
    }
  };

  return (
    <Panel id={panelId}>
      {/* Panel Header */}
      <PanelToolbar 
        panelId={panelId}
        title="System Settings" 
        icon={
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      />
      
      {/* Panel Content */}
      <div className="flex flex-col h-full">
        {/* Subsection Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {SYSTEM_SUBSECTIONS.map(subsection => (
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
          {/* WebSocket Settings */}
          {activeSubsection === 'websocket' && (
            <div className="space-y-6">
              {/* Connection Settings */}
              {Object.entries(systemSettings).map(([key, setting]) => {
                if (typeof setting !== 'object' || setting === null) {
                  return null;
                }
                
                if (!('type' in setting)) {
                  return null;
                }
                
                // Format the label
                const label = formatSettingLabel(key);
                
                // Render appropriate control based on setting type
                return (
                  <FormGroup 
                    key={key} 
                    label={label}
                    id={key}
                    helpText={setting.description}
                  >
                    <FormGroupControl>
                      {setting.type === 'text' && (
                        <input
                          id={key}
                          type="text"
                          value={setting.value}
                          className="w-full rounded-md border border-input bg-transparent px-3 py-1"
                          onChange={(e) => updateSetting(key, e.target.value)}
                          placeholder={setting.placeholder}
                        />
                      )}
                      
                      {setting.type === 'number' && (
                        <input
                          id={key}
                          type="number"
                          value={setting.value}
                          min={setting.min}
                          max={setting.max}
                          step={setting.step || 1}
                          className="w-full rounded-md border border-input bg-transparent px-3 py-1"
                          onChange={(e) => updateSetting(key, parseFloat(e.target.value))}
                        />
                      )}
                      
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
                    </FormGroupControl>
                  </FormGroup>
                );
              })}
              
              {/* WebSocket Connection Status */}
              <div className="mt-6 p-4 bg-muted rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Connection Status</span>
                  <div className="flex items-center space-x-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm text-muted-foreground">Connected</span>
                  </div>
                </div>
                
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Last Message</div>
                  <div>10:25:36 AM</div>
                  
                  <div className="text-muted-foreground">Messages Received</div>
                  <div>256</div>
                  
                  <div className="text-muted-foreground">Messages Sent</div>
                  <div>48</div>
                </div>
                
                <div className="mt-4 flex justify-end">
                  <button 
                    className="px-3 py-1 text-xs bg-secondary rounded-md hover:bg-secondary/80"
                    onClick={() => logger.debug('Test connection clicked')}
                  >
                    Test Connection
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Debug Settings */}
          {activeSubsection === 'debug' && (
            <div className="space-y-6">
              {/* Debug Settings */}
              {Object.entries(systemSettings).map(([key, setting]) => {
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
                  >
                    <FormGroupControl>
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
                    </FormGroupControl>
                  </FormGroup>
                );
              })}
              
              {/* Debug Actions */}
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3">Debug Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    className="px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm"
                    onClick={() => logger.debug('Clear console clicked')}
                  >
                    Clear Console
                  </button>
                  
                  <button 
                    className="px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm"
                    onClick={() => logger.debug('Reset graph clicked')}
                  >
                    Reset Graph
                  </button>
                  
                  <button 
                    className="px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm"
                    onClick={() => logger.debug('Export logs clicked')}
                  >
                    Export Logs
                  </button>
                  
                  <button 
                    className="px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm"
                    onClick={() => logger.debug('Memory usage clicked')}
                  >
                    Memory Usage
                  </button>
                </div>
                
                <div className="mt-4 p-3 bg-muted rounded-md text-xs font-mono h-32 overflow-auto">
                  <div className="text-green-500">● Session started at 10:15:22</div>
                  <div className="text-muted-foreground">● Loaded configuration</div>
                  <div className="text-muted-foreground">● WebSocket connected</div>
                  <div className="text-muted-foreground">● Graph initialized with 24 nodes</div>
                  <div className="text-yellow-500">● Warning: Slow frame rate detected</div>
                  <div className="text-muted-foreground">● Physics simulation stabilized</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};

export default SystemPanel;