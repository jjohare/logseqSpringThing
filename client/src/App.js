import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import AppInitializer from './components/AppInitializer';
import { ThemeProvider } from './components/ui/theme-provider';
import { Toaster } from './components/ui/toaster';
import GraphCanvas from './components/graph/GraphCanvas';
import ControlPanel from './components/ControlPanel';
import { useSettingsStore } from './lib/settings-store';
import { createLogger } from './lib/utils/logger';
const logger = createLogger('App');
function App() {
    const [isLoading, setIsLoading] = useState(true);
    const { initialized } = useSettingsStore(state => ({
        initialized: state.initialized
    }));
    useEffect(() => {
        // If settings are already initialized (e.g., from localStorage via zustand-persist),
        // we can skip the loading state
        if (initialized) {
            setIsLoading(false);
        }
    }, [initialized]);
    const handleInitialized = () => {
        setIsLoading(false);
    };
    return (_jsxs(ThemeProvider, { defaultTheme: "dark", children: [_jsxs("main", { className: "relative h-screen w-screen overflow-hidden bg-background text-foreground", children: [isLoading ? (_jsx("div", { className: "flex h-full w-full items-center justify-center", children: _jsxs("div", { className: "flex flex-col items-center space-y-4", children: [_jsx("div", { className: "text-2xl", children: "Loading Graph Visualization" }), _jsx("div", { className: "h-2 w-48 overflow-hidden rounded-full bg-gray-700", children: _jsx("div", { className: "animate-pulse h-full bg-primary" }) })] }) })) : (_jsxs(_Fragment, { children: [_jsx(GraphCanvas, {}), _jsx(ControlPanel, {})] })), _jsx(AppInitializer, { onInitialized: handleInitialized })] }), _jsx(Toaster, {})] }));
}
export default App;
