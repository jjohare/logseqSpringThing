import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChevronDown, ChevronUp, Minimize, Maximize } from 'lucide-react';
import { Button } from './ui/button';
import { SettingsSubsection } from './SettingsSubsection';
import { useControlPanelContext } from './control-panel-context';
export function SettingsSection({ id, title, settings, advanced = false }) {
    const [isOpen, setIsOpen] = useState(true);
    const [isDetached, setIsDetached] = useState(false);
    const { advancedMode } = useControlPanelContext();
    // If advanced section and not in advanced mode, don't render
    if (advanced && !advancedMode) {
        return null;
    }
    // Split settings into subsections
    const subsections = Object.entries(settings).map(([key, subsection]) => ({
        key,
        title: key,
        settings: subsection,
        path: `${id}.${key}`
    }));
    const handleDetach = () => {
        setIsDetached(!isDetached);
    };
    if (isDetached) {
        return (_jsx(DetachedSection, { title: title, onReattach: handleDetach, sectionId: id, children: _jsx("div", { className: "space-y-4 p-2", children: subsections.map(subsection => (_jsx(SettingsSubsection, { title: subsection.title, settings: subsection.settings, path: subsection.path }, subsection.key))) }) }));
    }
    return (_jsx(Card, { className: "settings-section", children: _jsx(CardHeader, { className: "py-2 px-4", children: _jsxs(Collapsible, { open: isOpen, onOpenChange: setIsOpen, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(CollapsibleTrigger, { asChild: true, children: _jsxs(Button, { variant: "ghost", size: "sm", className: "h-8 p-0", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: title }), isOpen ? _jsx(ChevronUp, { className: "ml-2 h-4 w-4" }) : _jsx(ChevronDown, { className: "ml-2 h-4 w-4" })] }) }), _jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: handleDetach, title: "Detach section", children: _jsx(Maximize, { className: "h-3 w-3" }) })] }), _jsx(CollapsibleContent, { children: _jsx(CardContent, { className: "p-2 pt-2", children: _jsx("div", { className: "space-y-4", children: subsections.map(subsection => (_jsx(SettingsSubsection, { title: subsection.title, settings: subsection.settings, path: subsection.path }, subsection.key))) }) }) })] }) }) }));
}
// Detached floating section component
function DetachedSection({ children, title, onReattach, sectionId }) {
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const handleDrag = (e, data) => {
        setPosition({ x: data.x, y: data.y });
    };
    return (_jsxs("div", { className: "detached-panel absolute z-50 min-w-[250px]", style: {
            left: `${position.x}px`,
            top: `${position.y}px`,
        }, "data-section-id": sectionId, children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border p-2", children: [_jsx("div", { className: "cursor-move flex-1 text-sm font-medium", children: title }), _jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: onReattach, title: "Reattach section", children: _jsx(Minimize, { className: "h-3 w-3" }) })] }), _jsx("div", { className: "p-2", children: children })] }));
}
