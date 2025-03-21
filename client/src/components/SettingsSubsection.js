import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSettingsStore } from '../lib/stores/settings-store';
import { formatSettingName } from './settings-config';
import { SettingControlComponent } from './SettingControlComponent';
export function SettingsSubsection({ title, settings, path }) {
    const settingsStore = useSettingsStore();
    // Check if this is a single setting or a group of settings
    // Fix: Check if settings is an object before using 'in' operator
    const isObject = settings !== null && typeof settings === 'object';
    const isSingleSetting = isObject && 'type' in settings;
    // Format the title for display
    const formattedTitle = formatSettingName(title);
    return (_jsxs("div", { className: "settings-subsection", children: [_jsx("h3", { className: "mb-2 text-sm font-medium text-muted-foreground", children: formattedTitle }), _jsx("div", { className: "space-y-2", children: isSingleSetting ? (
                // Render a single setting control
                _jsx(SettingControlComponent, { path: path, setting: settings, value: settingsStore.get(path), onChange: (value) => settingsStore.set(path, value) })) : (
                // Render multiple setting controls
                Object.entries(settings).map(([key, setting]) => {
                    const fullPath = `${path}.${key}`;
                    return (_jsx(SettingControlComponent, { path: fullPath, setting: setting, value: settingsStore.get(fullPath), onChange: (value) => settingsStore.set(fullPath, value) }, key));
                })) })] }));
}
