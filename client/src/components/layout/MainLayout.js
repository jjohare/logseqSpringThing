import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSettingsStore } from '../../lib/stores/settings-store';
import { PanelProvider } from '../panel/PanelContext';
import { createLogger } from '../../lib/utils/logger';
const logger = createLogger('MainLayout');
/**
 * MainLayout serves as the primary layout component for the application.
 * It organizes the central viewport and surrounding panel system.
 */
const MainLayout = ({ viewportContent, panels, header, footer }) => {
    const { initialized } = useSettingsStore(state => ({
        initialized: state.initialized
    }));
    return (_jsx(PanelProvider, { children: _jsxs("div", { className: "fixed inset-0 flex flex-col h-screen w-screen overflow-hidden bg-background", children: [header && (_jsx("header", { className: "w-full border-b border-border bg-background z-10", children: header })), _jsxs("main", { className: "flex-1 flex relative overflow-hidden", children: [_jsx("div", { id: "left-dock-zone", className: "h-full flex-shrink-0 z-20", "data-dock-zone": "left" }), _jsxs("div", { className: "flex-1 relative", children: [_jsx("div", { id: "top-dock-zone", className: "w-full flex-shrink-0 z-20", "data-dock-zone": "top" }), _jsx("div", { className: "absolute inset-0", children: viewportContent }), _jsx("div", { id: "bottom-dock-zone", className: "w-full flex-shrink-0 absolute bottom-0 z-20", "data-dock-zone": "bottom" })] }), _jsx("div", { id: "right-dock-zone", className: "h-full flex-shrink-0 z-20", "data-dock-zone": "right" })] }), footer && (_jsx("footer", { className: "w-full border-t border-border bg-background z-10", children: footer })), _jsx("div", { id: "floating-panels-container", className: "absolute inset-0 pointer-events-none z-30", children: panels })] }) }));
};
export default MainLayout;
