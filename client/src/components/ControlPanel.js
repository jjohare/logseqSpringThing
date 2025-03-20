import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useSettingsStore } from '../lib/stores/settings-store';
import { createLogger } from '../lib/utils/logger';
import NostrAuthSection from './NostrAuthSection';
import { SettingsSection } from './SettingsSection';
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from './ui/button';
const logger = createLogger('ControlPanel');
// Settings categories for the control panel
const PANEL_SECTIONS = [
    {
        id: 'visualization',
        title: 'Visualization',
        icon: _jsx(Settings2, { className: "h-4 w-4" }),
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
        icon: _jsx(Settings2, { className: "h-4 w-4" }),
        subsections: [
            { id: 'controls', title: 'Controls' },
            { id: 'environment', title: 'Environment' },
        ]
    },
    {
        id: 'system',
        title: 'System',
        icon: _jsx(Settings2, { className: "h-4 w-4" }),
        subsections: [
            { id: 'websocket', title: 'WebSocket' },
            { id: 'debug', title: 'Debug' },
        ]
    },
    {
        id: 'auth',
        title: 'Authentication',
        icon: _jsx(Settings2, { className: "h-4 w-4" }),
        subsections: []
    }
];
const ControlPanel = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [activeSection, setActiveSection] = useState('visualization');
    const [activeSubsection, setActiveSubsection] = useState('rendering');
    const settings = useSettingsStore(state => state.settings);
    const setSettings = useSettingsStore(state => state.set);
    // Toggle panel open/closed
    const togglePanel = () => {
        setIsOpen(!isOpen);
    };
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
    return (_jsxs("div", { className: `fixed right-0 top-0 h-full transition-all duration-300 bg-background border-l border-border ${isOpen ? 'w-80' : 'w-12'}`, children: [_jsx(Button, { variant: "ghost", size: "icon", className: "absolute -left-10 top-4 bg-background border border-border rounded-l-md rounded-r-none h-10 w-10", onClick: togglePanel, "aria-label": isOpen ? 'Close panel' : 'Open panel', children: isOpen ? _jsx(ChevronRight, { className: "h-4 w-4" }) : _jsx(ChevronLeft, { className: "h-4 w-4" }) }), isOpen && (_jsxs("div", { className: "flex flex-col h-full overflow-hidden", children: [_jsx("div", { className: "border-b border-border p-4", children: _jsx("h2", { className: "text-lg font-semibold", children: "Settings" }) }), _jsxs("div", { className: "flex flex-col md:flex-row h-full overflow-hidden", children: [_jsx("div", { className: "w-full md:w-1/3 border-r border-border p-2 overflow-y-auto", children: _jsx("nav", { className: "space-y-1", children: PANEL_SECTIONS.map(section => (_jsxs("button", { className: `w-full text-left px-3 py-2 rounded-md flex items-center space-x-2 ${activeSection === section.id
                                            ? 'bg-primary text-primary-foreground'
                                            : 'hover:bg-accent'}`, onClick: () => handleSectionChange(section.id), children: [section.icon, _jsx("span", { children: section.title })] }, section.id))) }) }), _jsx("div", { className: "flex-1 overflow-y-auto p-4", children: activeSection === 'auth' ? (_jsx(NostrAuthSection, {})) : (_jsxs(_Fragment, { children: [currentSection && currentSection.subsections.length > 0 && (_jsx("div", { className: "border-b border-border mb-4", children: _jsx("div", { className: "flex space-x-2 overflow-x-auto", children: currentSection.subsections.map(subsection => (_jsx("button", { className: `px-3 py-2 ${activeSubsection === subsection.id
                                                        ? 'border-b-2 border-primary font-medium'
                                                        : 'text-muted-foreground hover:text-foreground'}`, onClick: () => handleSubsectionChange(subsection.id), children: subsection.title }, subsection.id))) }) })), _jsx(SettingsSection, { id: activeSection, title: currentSection?.title || '', settings: activeSubsection &&
                                                settings[activeSection] &&
                                                settings[activeSection][activeSubsection] ?
                                                settings[activeSection][activeSubsection] : {} })] })) })] })] }))] }));
};
export default ControlPanel;
