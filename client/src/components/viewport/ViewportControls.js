import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Home, ZoomIn, ZoomOut, Maximize, RotateCw, Minimize, PanelLeft, PanelRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { createLogger } from '../../lib/utils/logger';
import { useApplicationMode } from '../context/ApplicationModeContext';
const logger = createLogger('ViewportControls');
/**
 * ViewportControls provides a set of controls for navigating and interacting with the 3D viewport.
 */
const ViewportControls = ({ onReset, onZoomIn, onZoomOut, onToggleFullscreen, onRotate, onToggleLeftPanel, onToggleRightPanel, orientation = 'horizontal', position = 'bottom-right', className = '' }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { mode, isXRMode } = useApplicationMode();
    // Hide controls in XR mode
    if (isXRMode) {
        return null;
    }
    // Handle fullscreen toggle
    const handleToggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
        if (onToggleFullscreen) {
            onToggleFullscreen();
        }
    };
    // Position classes
    const getPositionClasses = () => {
        switch (position) {
            case 'top-left':
                return 'top-4 left-4';
            case 'top-right':
                return 'top-4 right-4';
            case 'bottom-left':
                return 'bottom-4 left-4';
            case 'bottom-right':
                return 'bottom-4 right-4';
            default:
                return 'bottom-4 right-4';
        }
    };
    // Orientation classes
    const orientationClasses = orientation === 'vertical' ? 'flex-col' : 'flex-row';
    return (_jsxs("div", { className: `viewport-controls fixed ${getPositionClasses()} flex items-center gap-2 backdrop-blur-sm bg-background/60 rounded-lg p-1 shadow-md z-10 ${orientationClasses} ${className}`, "aria-label": "Viewport Controls", children: [_jsx(Tooltip, { content: "Reset View (Shortcut: Home)", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onReset, "aria-label": "Reset View", className: "h-8 w-8", children: _jsx(Home, { className: "h-4 w-4" }) }) }), _jsxs("div", { className: `flex ${orientation === 'vertical' ? 'flex-col' : 'flex-row'} gap-1`, children: [_jsx(Tooltip, { content: "Zoom In (Shortcut: +)", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onZoomIn, "aria-label": "Zoom In", className: "h-8 w-8", children: _jsx(ZoomIn, { className: "h-4 w-4" }) }) }), _jsx(Tooltip, { content: "Zoom Out (Shortcut: -)", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onZoomOut, "aria-label": "Zoom Out", className: "h-8 w-8", children: _jsx(ZoomOut, { className: "h-4 w-4" }) }) })] }), _jsx(Tooltip, { content: "Rotate View (Shortcut: R)", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onRotate, "aria-label": "Rotate View", className: "h-8 w-8", children: _jsx(RotateCw, { className: "h-4 w-4" }) }) }), _jsx(Tooltip, { content: isFullscreen ? "Exit Fullscreen (Shortcut: F)" : "Enter Fullscreen (Shortcut: F)", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: handleToggleFullscreen, "aria-label": isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen", className: "h-8 w-8", children: isFullscreen ? (_jsx(Minimize, { className: "h-4 w-4" })) : (_jsx(Maximize, { className: "h-4 w-4" })) }) }), mode === 'desktop' && (_jsxs("div", { className: `flex ${orientation === 'vertical' ? 'flex-col' : 'flex-row'} gap-1`, children: [_jsx(Tooltip, { content: "Toggle Left Panel (Shortcut: [)", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onToggleLeftPanel, "aria-label": "Toggle Left Panel", className: "h-8 w-8", children: _jsx(PanelLeft, { className: "h-4 w-4" }) }) }), _jsx(Tooltip, { content: "Toggle Right Panel (Shortcut: ])", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onToggleRightPanel, "aria-label": "Toggle Right Panel", className: "h-8 w-8", children: _jsx(PanelRight, { className: "h-4 w-4" }) }) })] }))] }));
};
export default ViewportControls;
