import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import Panel from '../../panel/Panel';
import PanelToolbar from '../../panel/PanelToolbar';
import { formatSettingLabel } from '../../../lib/types/settings-schema';
import { createLogger } from '../../../lib/utils/logger';
import { Eye, CircleDashed, Circle, BrushIcon, MoveHorizontal } from 'lucide-react';
const logger = createLogger('VisualizationPanel');
// Subsections for visualization settings
const VISUALIZATION_SUBSECTIONS = [
    { id: 'rendering', title: 'Rendering', icon: _jsx(Eye, { className: "h-4 w-4" }) },
    { id: 'nodes', title: 'Nodes', icon: _jsx(Circle, { className: "h-4 w-4" }) },
    { id: 'edges', title: 'Edges', icon: _jsx(MoveHorizontal, { className: "h-4 w-4" }) },
    { id: 'labels', title: 'Labels', icon: _jsx(BrushIcon, { className: "h-4 w-4" }) },
    { id: 'physics', title: 'Physics', icon: _jsx(CircleDashed, { className: "h-4 w-4" }) },
];
/**
 * VisualizationPanel provides a comprehensive interface for managing all visualization settings.
 * This includes rendering options, node/edge appearance, and physics simulation parameters.
 */
const VisualizationPanel = ({ panelId }) => {
    const [activeSubsection, setActiveSubsection] = useState('rendering');
    const settings = useSettingsStore(state => state.settings);
    const setSettings = useSettingsStore(state => state.set);
    // Get visualization settings for the active subsection
    const visualizationSettings = settings.visualization &&
        settings.visualization[activeSubsection] ?
        settings.visualization[activeSubsection] : {};
    // Update a specific setting
    const updateSetting = (path, value) => {
        const fullPath = `visualization.${activeSubsection}.${path}`;
        logger.debug(`Updating setting: ${fullPath}`, value);
        setSettings(fullPath, value);
    };
    return (_jsxs(Panel, { id: panelId, children: [_jsx(PanelToolbar, { panelId: panelId, title: "Visualization Settings", icon: _jsx(Eye, { className: "h-4 w-4" }) }), _jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "flex border-b border-border overflow-x-auto", children: VISUALIZATION_SUBSECTIONS.map(subsection => (_jsxs("button", { className: `flex items-center px-3 py-2 ${activeSubsection === subsection.id
                                ? 'border-b-2 border-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground'}`, onClick: () => setActiveSubsection(subsection.id), children: [subsection.icon && _jsx("span", { className: "mr-2", children: subsection.icon }), subsection.title] }, subsection.id))) }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 space-y-6", children: Object.entries(visualizationSettings).map(([key, setting]) => {
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
                            return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("label", { className: "text-sm font-medium", htmlFor: key, children: label }), setting.help && (_jsx("span", { className: "text-muted-foreground text-xs", children: setting.help }))] }), setting.type === 'slider' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "range", value: setting.value, min: setting.min || 0, max: setting.max || 100, step: setting.step || 1, className: "w-full", onChange: (e) => updateSetting(key, parseFloat(e.target.value)) }), _jsxs("span", { className: "text-sm text-muted-foreground w-12 text-right", children: [setting.value, setting.unit || ''] })] })), setting.type === 'checkbox' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "checkbox", checked: setting.value, className: "rounded", onChange: (e) => updateSetting(key, e.target.checked) }), _jsx("span", { className: "text-sm text-muted-foreground", children: setting.value ? 'Enabled' : 'Disabled' })] })), setting.type === 'color' && (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { id: key, type: "color", value: setting.value, className: "w-8 h-8 rounded cursor-pointer", onChange: (e) => updateSetting(key, e.target.value) }), _jsx("span", { className: "text-sm font-mono text-muted-foreground", children: setting.value })] })), setting.type === 'text' && (_jsx("input", { id: key, type: "text", value: setting.value, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, e.target.value) })), setting.type === 'select' && setting.options && (_jsx("select", { id: key, value: setting.value, className: "w-full rounded-md border border-input bg-transparent px-3 py-1", onChange: (e) => updateSetting(key, e.target.value), children: setting.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })), setting.description && (_jsx("p", { className: "text-xs text-muted-foreground", children: setting.description }))] }, key));
                        }) })] })] }));
};
export default VisualizationPanel;
