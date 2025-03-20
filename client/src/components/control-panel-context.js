import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from 'react';
const ControlPanelContext = createContext(null);
export function useControlPanelContext() {
    const context = useContext(ControlPanelContext);
    if (!context) {
        throw new Error('useControlPanelContext must be used within a ControlPanelProvider');
    }
    return context;
}
export function ControlPanelProvider({ children }) {
    const [advancedMode, setAdvancedMode] = useState(false);
    const value = {
        advancedMode,
        setAdvancedMode
    };
    return (_jsx(ControlPanelContext.Provider, { value: value, children: children }));
}
