import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState } from 'react';
import { useSettingsStore } from '../../lib/stores/settings-store';
import { createLogger } from '../../lib/utils/logger';
const logger = createLogger('ViewportContainer');
/**
 * ViewportContainer serves as the main container for the Three.js visualization.
 * It handles resize events and coordinates with the panel system to adjust its dimensions
 * when panels are docked/undocked.
 */
const ViewportContainer = ({ children, onResize }) => {
    const viewportRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const { initialized } = useSettingsStore(state => ({
        initialized: state.initialized
    }));
    // Track resize events to update viewport dimensions
    useEffect(() => {
        const updateDimensions = () => {
            if (viewportRef.current) {
                const { width, height } = viewportRef.current.getBoundingClientRect();
                setDimensions({ width, height });
                if (onResize) {
                    onResize(width, height);
                }
                logger.debug('Viewport resized:', { width, height });
            }
        };
        // Initial size measurement
        updateDimensions();
        // Add resize event listener
        window.addEventListener('resize', updateDimensions);
        // Create ResizeObserver to track container size changes
        const resizeObserver = new ResizeObserver(updateDimensions);
        if (viewportRef.current) {
            resizeObserver.observe(viewportRef.current);
        }
        return () => {
            window.removeEventListener('resize', updateDimensions);
            resizeObserver.disconnect();
        };
    }, [onResize]);
    // Trigger resize notification when initialization completes
    useEffect(() => {
        if (initialized && viewportRef.current) {
            const { width, height } = viewportRef.current.getBoundingClientRect();
            if (onResize) {
                onResize(width, height);
            }
        }
    }, [initialized, onResize]);
    return (_jsxs("div", { ref: viewportRef, className: "relative w-full h-full bg-background", "data-testid": "viewport-container", children: [children, process.env.NODE_ENV === 'development' && (_jsx("div", { className: "absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-md z-10", children: `${Math.round(dimensions.width)} × ${Math.round(dimensions.height)}` }))] }));
};
export default ViewportContainer;
