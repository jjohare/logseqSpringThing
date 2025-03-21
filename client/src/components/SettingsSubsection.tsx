import { useSettingsStore } from '../lib/stores/settings-store'
import { SettingsSubsectionProps } from './types'
import { SettingControl } from './types'
import { formatSettingName } from './settings-config'
import { SettingControlComponent } from './SettingControlComponent'

export function SettingsSubsection({ title, settings, path }: SettingsSubsectionProps) {
  const settingsStore = useSettingsStore()

  // Check if this is a single setting or a group of settings
  // Fix: Check if settings is an object before using 'in' operator
  const isObject = settings !== null && typeof settings === 'object';
  const isSingleSetting = isObject && 'type' in settings;
  
  // Format the title for display
  const formattedTitle = formatSettingName(title);
  
  return (
    <div className="settings-subsection">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        {formattedTitle}
      </h3>
      
      <div className="space-y-2">
        {isSingleSetting ? (
          // Render a single setting control
          <SettingControlComponent
            path={path}
            setting={settings as SettingControl}
            value={settingsStore.get(path)}
            onChange={(value) => settingsStore.set(path, value)}
          />
        ) : (
          // Render multiple setting controls
          Object.entries(settings as Record<string, SettingControl>).map(([key, setting]) => {
            const fullPath = `${path}.${key}`;
            return (
              <SettingControlComponent
                key={key}
                path={fullPath}
                setting={setting}
                value={settingsStore.get(fullPath)}
                onChange={(value) => settingsStore.set(fullPath, value)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}