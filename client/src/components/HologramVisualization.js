import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { HologramManager } from '../lib/rendering/HologramManager';
import { useSettingsStore } from '../lib/stores/settings-store';
/**
 * HologramVisualization - A component that renders a hologram visualization
 * using the modern approach based on @react-three/fiber and @react-three/drei
 *
 * Can be used in two ways:
 * 1. As a standalone component with its own canvas (standalone=true)
 * 2. As a component inside an existing canvas (standalone=false)
 */
export const HologramVisualization = ({ position = [0, 0, 0], size = 1, standalone = true, children }) => {
    const settings = useSettingsStore(state => state.settings?.visualization?.hologram);
    // Content that's rendered inside the hologram
    const HologramContent = () => (_jsx("group", { position: position, scale: size, children: children || (_jsxs(_Fragment, { children: [_jsx(HologramManager, {}), _jsxs("mesh", { position: [0, 0, 0], children: [_jsx("icosahedronGeometry", { args: [0.4, 1] }), _jsx("meshStandardMaterial", { color: settings?.color || '#00ffff', emissive: settings?.color || '#00ffff', emissiveIntensity: 0.5, transparent: true, opacity: 0.7 })] })] })) }));
    // For standalone use, provide a Canvas
    if (standalone) {
        return (_jsx("div", { className: "w-full h-full", style: { minHeight: '300px' }, children: _jsxs(Canvas, { camera: { position: [0, 0, 5], fov: 50 }, gl: { antialias: true, alpha: true }, children: [_jsx("ambientLight", { intensity: 0.5 }), _jsx("directionalLight", { position: [10, 10, 5], intensity: 1 }), _jsx(HologramContent, {}), _jsx(OrbitControls, { enableDamping: true, dampingFactor: 0.1 })] }) }));
    }
    // For embedded use, just render the content
    return _jsx(HologramContent, {});
};
/**
 * Hologram Overlay - Creates a floating hologram effect for UI elements
 * This component provides a hologram-styled container for regular React components
 */
export const HologramOverlay = ({ children, className = '', glowColor = '#00ffff' }) => {
    return (_jsxs("div", { className: `relative rounded-lg overflow-hidden ${className}`, style: {
            background: 'rgba(0, 10, 20, 0.7)',
            boxShadow: `0 0 15px ${glowColor}, inset 0 0 8px ${glowColor}`,
            border: `1px solid ${glowColor}`,
        }, children: [_jsx("div", { className: "absolute inset-0 pointer-events-none z-10", style: {
                    background: 'linear-gradient(transparent 50%, rgba(0, 255, 255, 0.05) 50%)',
                    backgroundSize: '100% 4px',
                    animation: 'hologramScanline 1s linear infinite',
                } }), _jsx("div", { className: "absolute inset-0 pointer-events-none opacity-20 z-20", style: {
                    animation: 'hologramFlicker 4s linear infinite',
                } }), _jsx("div", { className: "relative z-30 p-4 text-cyan-400", children: children }), _jsx("style", { children: `
          @keyframes hologramScanline {
            0% {
              transform: translateY(0%);
            }
            100% {
              transform: translateY(100%);
            }
          }
          
          @keyframes hologramFlicker {
            0% { opacity: 0.1; }
            5% { opacity: 0.2; }
            10% { opacity: 0.1; }
            15% { opacity: 0.3; }
            20% { opacity: 0.1; }
            25% { opacity: 0.2; }
            30% { opacity: 0.1; }
            35% { opacity: 0.15; }
            40% { opacity: 0.2; }
            45% { opacity: 0.15; }
            50% { opacity: 0.1; }
            55% { opacity: 0.2; }
            60% { opacity: 0.25; }
            65% { opacity: 0.15; }
            70% { opacity: 0.2; }
            75% { opacity: 0.1; }
            80% { opacity: 0.15; }
            85% { opacity: 0.1; }
            90% { opacity: 0.2; }
            95% { opacity: 0.15; }
            100% { opacity: 0.1; }
          }
        ` })] }));
};
// Example usage component to demonstrate both 3D and UI hologram effects
export const HologramExample = () => {
    return (_jsxs("div", { className: "flex flex-col md:flex-row gap-6 p-6 min-h-screen bg-gray-900", children: [_jsx("div", { className: "flex-1 h-[500px] rounded-lg overflow-hidden", children: _jsx(HologramVisualization, { standalone: true, size: 1.2 }) }), _jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsxs(HologramOverlay, { className: "max-w-md", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Hologram System Status" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Power Level:" }), _jsx("span", { children: "87%" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Signal Strength:" }), _jsx("span", { children: "Optimal" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Data Transmission:" }), _jsx("span", { children: "Active" })] }), _jsx("div", { className: "w-full h-2 bg-blue-900 mt-4 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-cyan-400", style: {
                                            width: '87%',
                                            animation: 'hologramPulse 3s infinite'
                                        } }) })] })] }) }), _jsx("style", { children: `
          @keyframes hologramPulse {
            0% { opacity: 0.8; }
            50% { opacity: 1; }
            100% { opacity: 0.8; }
          }
        ` })] }));
};
export default HologramVisualization;
