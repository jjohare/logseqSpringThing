import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import Panel from '../../panel/Panel';
import PanelToolbar from '../../panel/PanelToolbar';
import { formatSettingLabel } from '../../../lib/types/settings-schema';
import { FormGroup, FormGroupControl } from '../../ui/form-group';
import { isUISetting } from '../../../lib/types/ui-setting';
import { createLogger } from '../../../lib/utils/logger';
const logger = createLogger('SystemPanel');
// Subsections for system settings
const SYSTEM_SUBSECTIONS = [
    { id: 'websocket', title: 'WebSocket' },
    { id: 'debug', title: 'Debug' }
];
/**
 * SystemPanel provides access to system-level settings and debug options.
 */
const SystemPanel = ({ panelId }) => {
    const [activeSubsection, setActiveSubsection] = useState('websocket');
    const settings = useSettingsStore(state => state.settings);
    const setSettings = useSettingsStore(state => state.set);
    // Get system settings for the active subsection
    const systemSettings = settings.system &&
        settings.system[activeSubsection] ?
        settings.system[activeSubsection] : {};
    // Update a specific setting
    const updateSetting = (path, value) => {
        const fullPath = `system.${activeSubsection}.${path}`;
        logger.debug(`Updating setting: ${fullPath}`, value);
        setSettings(fullPath, value);
    };
    // Toggle a boolean setting
    const toggleSetting = (path) => {
        const currentValue = systemSettings[path]?.value;
        if (typeof currentValue === 'boolean') {
            updateSetting(path, !currentValue);
        }
    };
    return (_jsxs(Panel, { id: panelId, children: [_jsx(PanelToolbar, { panelId: panelId, title: "System Settings", icon: _jsxs("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" })] }) }), _jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "flex border-b border-border overflow-x-auto", children: SYSTEM_SUBSECTIONS.map(subsection => (_jsx("button", { className: `px-3 py-2 ${activeSubsection === subsection.id
                                ? 'border-b-2 border-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground'}`, onClick: () => setActiveSubsection(subsection.id), children: subsection.title }, subsection.id))) }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-6", children: [activeSubsection === 'websocket' && (_jsxs("div", { className: "space-y-6", children: [Object.entries(systemSettings).map(([key, setting]) => {
                                        if (typeof setting !== 'object' || setting === null) {
                                            return null;
                                        }
                                        if (!isUISetting(setting)) {
                                            return null;
                                        }
                                        // Format the label
                                        const label = formatSettingLabel(key);
                                        // Render appropriate control based on setting type
                                        return (_jsx(FormGroup, { label: label, id: key, helpText: setting.description, children: _jsxs(FormGroupControl, { children: [setting.type === 'text' && (_jsx("input", { id: key, type: "text", value: setting.value, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, e.target.value), placeholder: setting.placeholder })), setting.type === 'number' && (_jsx("input", { id: key, type: "number", value: setting.value, min: setting.min, max: setting.max, step: setting.step || 1, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, parseFloat(e.target.value)) })), setting.type === 'checkbox' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "checkbox", checked: setting.value, className: "rounded", onChange: () => toggleSetting(key) }), _jsx("span", { className: "text-sm text-muted-foreground", children: setting.value ? 'Enabled' : 'Disabled' })] }))] }) }, key));
                                    }), _jsxs("div", { className: "mt-6 p-4 bg-muted rounded-md", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-medium", children: "Connection Status" }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("span", { className: "inline-block w-2 h-2 rounded-full bg-green-500" }), _jsx("span", { className: "text-sm text-muted-foreground", children: "Connected" })] })] }), _jsxs("div", { className: "mt-2 grid grid-cols-2 gap-2 text-sm", children: [_jsx("div", { className: "text-muted-foreground", children: "Last Message" }), _jsx("div", { children: "10:25:36 AM" }), _jsx("div", { className: "text-muted-foreground", children: "Messages Received" }), _jsx("div", { children: "256" }), _jsx("div", { className: "text-muted-foreground", children: "Messages Sent" }), _jsx("div", { children: "48" })] }), _jsx("div", { className: "mt-4 flex justify-end", children: _jsx("button", { className: "px-3 py-1 text-xs bg-secondary rounded-md hover:bg-secondary/80", onClick: () => logger.debug('Test connection clicked'), children: "Test Connection" }) })] })] })), activeSubsection === 'debug' && (_jsxs("div", { className: "space-y-6", children: [Object.entries(systemSettings).map(([key, setting]) => {
                                        if (typeof setting !== 'object' || setting === null) {
                                            return null;
                                        }
                                        if (!('type' in setting)) {
                                            return null;
                                        }
                                        // Format the label
                                        const label = formatSettingLabel(key);
                                        return (_jsx(FormGroup, { label: label, id: key, helpText: setting.description, children: _jsxs(FormGroupControl, { children: [setting.type === 'checkbox' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "checkbox", checked: setting.value, className: "rounded", onChange: () => toggleSetting(key) }), _jsx("span", { className: "text-sm text-muted-foreground", children: setting.value ? 'Enabled' : 'Disabled' })] })), setting.type === 'select' && setting.options && (_jsx("select", { id: key, value: setting.value, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, e.target.value), children: setting.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }))] }) }, key));
                                    }), _jsxs("div", { className: "mt-6", children: [_jsx("h3", { className: "text-sm font-medium mb-3", children: "Debug Actions" }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx("button", { className: "px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm", onClick: () => logger.debug('Clear console clicked'), children: "Clear Console" }), _jsx("button", { className: "px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm", onClick: () => logger.debug('Reset graph clicked'), children: "Reset Graph" }), _jsx("button", { className: "px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm", onClick: () => logger.debug('Export logs clicked'), children: "Export Logs" }), _jsx("button", { className: "px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 text-sm", onClick: () => logger.debug('Memory usage clicked'), children: "Memory Usage" })] }), _jsxs("div", { className: "mt-4 p-3 bg-muted rounded-md text-xs font-mono h-32 overflow-auto", children: [_jsx("div", { className: "text-green-500", children: "\u25CF Session started at 10:15:22" }), _jsx("div", { className: "text-muted-foreground", children: "\u25CF Loaded configuration" }), _jsx("div", { className: "text-muted-foreground", children: "\u25CF WebSocket connected" }), _jsx("div", { className: "text-muted-foreground", children: "\u25CF Graph initialized with 24 nodes" }), _jsx("div", { className: "text-yellow-500", children: "\u25CF Warning: Slow frame rate detected" }), _jsx("div", { className: "text-muted-foreground", children: "\u25CF Physics simulation stabilized" })] })] })] }))] })] })] }));
};
export default SystemPanel;
