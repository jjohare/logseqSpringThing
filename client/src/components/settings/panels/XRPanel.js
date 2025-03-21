import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import Panel from '../../panel/Panel';
import PanelToolbar from '../../panel/PanelToolbar';
import { formatSettingLabel } from '../../../lib/types/settings-schema';
import { createLogger } from '../../../lib/utils/logger';
import { FormGroup, FormGroupControl } from '../../ui/form-group';
const logger = createLogger('XRPanel');
// Subsections for XR settings
const XR_SUBSECTIONS = [
    { id: 'controls', title: 'Controls' },
    { id: 'environment', title: 'Environment' }
];
/**
 * XRPanel provides settings for XR (VR/AR) modes, including controls and environment settings.
 */
const XRPanel = ({ panelId }) => {
    const [activeSubsection, setActiveSubsection] = useState('controls');
    const settings = useSettingsStore(state => state.settings);
    const setSettings = useSettingsStore(state => state.set);
    // Get XR settings for the active subsection
    const xrSettings = settings.xr &&
        settings.xr[activeSubsection] ?
        settings.xr[activeSubsection] : {};
    // Update a specific setting
    const updateSetting = (path, value) => {
        const fullPath = `xr.${activeSubsection}.${path}`;
        logger.debug(`Updating setting: ${fullPath}`, value);
        setSettings(fullPath, value);
    };
    // Toggle a boolean setting
    const toggleSetting = (path) => {
        const currentValue = xrSettings[path]?.value;
        if (typeof currentValue === 'boolean') {
            updateSetting(path, !currentValue);
        }
    };
    return (_jsxs(Panel, { id: panelId, children: [_jsx(PanelToolbar, { panelId: panelId, title: "VR/AR Settings", icon: _jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" }) }) }), _jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "flex border-b border-border overflow-x-auto", children: XR_SUBSECTIONS.map(subsection => (_jsx("button", { className: `px-3 py-2 ${activeSubsection === subsection.id
                                ? 'border-b-2 border-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground'}`, onClick: () => setActiveSubsection(subsection.id), children: subsection.title }, subsection.id))) }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-6", children: [activeSubsection === 'controls' && (_jsxs("div", { className: "space-y-6", children: [Object.entries(xrSettings).map(([key, setting]) => {
                                        if (typeof setting !== 'object' || setting === null) {
                                            return null;
                                        }
                                        if (!('type' in setting)) {
                                            return null;
                                        }
                                        // Format the label
                                        const label = formatSettingLabel(key);
                                        return (_jsx(FormGroup, { label: label, id: key, helpText: setting.description, advanced: setting.advanced, children: _jsxs(FormGroupControl, { children: [setting.type === 'checkbox' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "checkbox", checked: setting.value, className: "rounded", onChange: () => toggleSetting(key) }), _jsx("span", { className: "text-sm text-muted-foreground", children: setting.value ? 'Enabled' : 'Disabled' })] })), setting.type === 'select' && setting.options && (_jsx("select", { id: key, value: setting.value, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, e.target.value), children: setting.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })), setting.type === 'slider' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "range", value: setting.value, min: setting.min || 0, max: setting.max || 100, step: setting.step || 1, className: "w-full", onChange: (e) => updateSetting(key, parseFloat(e.target.value)) }), _jsxs("span", { className: "text-sm text-muted-foreground w-12 text-right", children: [setting.value, setting.unit || ''] })] }))] }) }, key));
                                    }), _jsxs("div", { className: "bg-muted p-4 rounded-md text-sm", children: [_jsx("h4", { className: "font-medium mb-2", children: "XR Control Information" }), _jsx("p", { className: "text-muted-foreground mb-2", children: "These settings control how interaction works in VR and AR modes. When using a VR headset, you can use the controllers to interact with the visualization." }), _jsxs("ul", { className: "list-disc list-inside text-muted-foreground space-y-1", children: [_jsx("li", { children: "Trigger button: Select" }), _jsx("li", { children: "Grip button: Grab and move" }), _jsx("li", { children: "Thumbstick: Navigate and rotate" })] })] })] })), activeSubsection === 'environment' && (_jsxs("div", { className: "space-y-6", children: [Object.entries(xrSettings).map(([key, setting]) => {
                                        if (typeof setting !== 'object' || setting === null) {
                                            return null;
                                        }
                                        if (!('type' in setting)) {
                                            return null;
                                        }
                                        // Format the label
                                        const label = formatSettingLabel(key);
                                        return (_jsx(FormGroup, { label: label, id: key, helpText: setting.description, advanced: setting.advanced, children: _jsxs(FormGroupControl, { children: [setting.type === 'color' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "color", value: setting.value, className: "w-8 h-8 rounded cursor-pointer", onChange: (e) => updateSetting(key, e.target.value) }), _jsx("span", { className: "text-sm font-mono text-muted-foreground", children: setting.value })] })), setting.type === 'select' && setting.options && (_jsx("select", { id: key, value: setting.value, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, e.target.value), children: setting.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }))] }) }, key));
                                    }), _jsxs("div", { className: "bg-muted p-4 rounded-md text-sm", children: [_jsx("h4", { className: "font-medium mb-2", children: "XR Environment" }), _jsx("p", { className: "text-muted-foreground", children: "These settings control the visual environment in VR and AR modes, including background, lighting, and scale." })] })] }))] })] })] }));
};
export default XRPanel;
