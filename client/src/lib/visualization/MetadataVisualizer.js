import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { usePlatform } from '../platform/platform-manager';
import { useSettingsStore } from '../stores/settings-store';
import { createLogger } from '../utils/logger';
const logger = createLogger('MetadataVisualizer');
/**
 * MetadataVisualizer component using React Three Fiber
 * This is a modernized version of the original MetadataVisualizer class
 */
export const MetadataVisualizer = ({ children, renderLabels = true, renderIcons = true, renderMetrics = false }) => {
    const { scene, camera } = useThree();
    const groupRef = useRef(null);
    const { isXRMode } = usePlatform();
    const labelSettings = useSettingsStore(state => state.settings?.visualization?.labels);
    // Layer management for XR mode
    useEffect(() => {
        if (!groupRef.current)
            return;
        // Set layers based on XR mode
        const group = groupRef.current;
        if (isXRMode) {
            // In XR mode, use layer 1 to ensure labels are visible in XR
            group.traverse(obj => {
                obj.layers.set(1);
            });
        }
        else {
            // In desktop mode, use default layer
            group.traverse(obj => {
                obj.layers.set(0);
            });
        }
    }, [isXRMode]);
    // Render optimization - only update label positions at 30fps
    useFrame((state, delta) => {
        // Potential optimization logic here
    }, 2); // Lower priority than regular rendering
    return (_jsxs("group", { ref: groupRef, name: "metadata-container", children: [children, renderLabels && _jsx(LabelSystem, {}), renderIcons && _jsx(IconSystem, {}), renderMetrics && _jsx(MetricsDisplay, {})] }));
};
// Component to display node labels with proper positioning and formatting
const LabelSystem = () => {
    const labelManagerRef = useTextLabelManager();
    const { labels } = labelManagerRef.current;
    const labelSettings = useSettingsStore(state => state.settings?.visualization?.labels);
    // Don't render if labels are disabled
    if (!labelSettings?.enabled)
        return null;
    return (_jsx("group", { name: "label-system", children: labels.map(label => (_jsx(NodeLabel, { id: label.id, position: label.position, text: label.text, color: labelSettings.color || '#ffffff', size: labelSettings.size || 1, backgroundColor: labelSettings.backgroundColor, showDistance: labelSettings.showDistance, fadeDistance: labelSettings.fadeDistance }, label.id))) }));
};
const NodeLabel = ({ id, position, text, color = '#ffffff', size = 1, backgroundColor, showDistance = 0, fadeDistance = 0 }) => {
    // Skip rendering empty labels
    if (!text?.trim())
        return null;
    const { camera } = useThree();
    const [opacity, setOpacity] = useState(1);
    const labelPos = useMemo(() => {
        if (position instanceof THREE.Vector3) {
            // Handle THREE.Vector3
            return position;
        }
        else if (Array.isArray(position) && position.length >= 3) {
            // Handle array position [x, y, z]
            return new THREE.Vector3(position[0], position[1], position[2]);
        }
        else {
            // Handle object with x, y, z properties
            return new THREE.Vector3(position.x, position.y, position.z);
        }
    }, [position]);
    // Handle distance-based opacity
    useFrame(() => {
        if (!fadeDistance)
            return;
        const distance = camera.position.distanceTo(labelPos);
        if (distance > fadeDistance) {
            setOpacity(0);
        }
        else if (distance > showDistance) {
            // Linear fade from showDistance to fadeDistance
            const fadeRatio = 1 - ((distance - showDistance) / (fadeDistance - showDistance));
            setOpacity(Math.max(0, Math.min(1, fadeRatio)));
        }
        else {
            setOpacity(1);
        }
    });
    // Don't render if fully transparent
    if (opacity <= 0)
        return null;
    return (_jsx(Billboard, { position: labelPos, follow: true, lockX: false, lockY: false, lockZ: false, children: _jsxs(Text, { fontSize: size, color: color, anchorX: "center", anchorY: "middle", outlineWidth: 0.02, outlineColor: "#000000", outlineOpacity: 0.8, overflowWrap: "normal", maxWidth: 10, textAlign: "center", renderOrder: 10, "material-depthTest": false, "material-transparent": true, "material-opacity": opacity, children: [text, backgroundColor && (_jsx("meshBasicMaterial", { color: backgroundColor, opacity: opacity * 0.7, transparent: true, side: THREE.DoubleSide }))] }) }));
};
// System to display icons next to nodes
const IconSystem = () => {
    // Implement if needed
    return null;
};
// System to display performance metrics
const MetricsDisplay = () => {
    // Implement if needed
    return null;
};
// Hook to manage text labels
export function useTextLabelManager() {
    const labelManagerRef = useRef({
        labels: [],
        updateLabel: (id, text, position) => {
            const labels = labelManagerRef.current.labels;
            const pos = position instanceof THREE.Vector3
                ? position
                : new THREE.Vector3(position.x, position.y, position.z);
            const existingLabelIndex = labels.findIndex(label => label.id === id);
            if (existingLabelIndex >= 0) {
                // Update existing label
                labels[existingLabelIndex] = {
                    ...labels[existingLabelIndex],
                    text: text || labels[existingLabelIndex].text,
                    position: pos
                };
            }
            else {
                // Add new label
                labels.push({ id, text, position: pos });
            }
            // Force update by creating a new array
            labelManagerRef.current.labels = [...labels];
        },
        removeLabel: (id) => {
            labelManagerRef.current.labels = labelManagerRef.current.labels.filter(label => label.id !== id);
        },
        clearLabels: () => {
            labelManagerRef.current.labels = [];
        }
    });
    return labelManagerRef;
}
// Factory function to create SDF font texture for high-quality text rendering
export const createSDFFont = async (fontUrl, fontSize = 64) => {
    // This would be an implementation of SDF font generation
    // For now, we use drei's Text component which provides high-quality text
    return null;
};
// Class-based API for backwards compatibility
export class MetadataVisualizerManager {
    constructor() {
        this.labels = new Map();
        this.updateCallback = null;
    }
    static getInstance() {
        if (!MetadataVisualizerManager.instance) {
            MetadataVisualizerManager.instance = new MetadataVisualizerManager();
        }
        return MetadataVisualizerManager.instance;
    }
    setUpdateCallback(callback) {
        this.updateCallback = callback;
    }
    updateNodeLabel(nodeId, text, position) {
        try {
            const pos = position instanceof THREE.Vector3
                ? position.clone()
                : new THREE.Vector3(position.x, position.y, position.z);
            this.labels.set(nodeId, { text, position: pos });
            if (this.updateCallback) {
                this.updateCallback();
            }
        }
        catch (error) {
            logger.error('Error updating node label:', error);
        }
    }
    clearLabel(nodeId) {
        this.labels.delete(nodeId);
        if (this.updateCallback) {
            this.updateCallback();
        }
    }
    clearAllLabels() {
        this.labels.clear();
        if (this.updateCallback) {
            this.updateCallback();
        }
    }
    getAllLabels() {
        return Array.from(this.labels.entries()).map(([id, label]) => ({
            id,
            text: label.text,
            position: label.position
        }));
    }
    dispose() {
        this.labels.clear();
        this.updateCallback = null;
        // Reset singleton instance
        MetadataVisualizerManager.instance = null;
    }
}
// Export singleton instance for backwards compatibility
export const metadataVisualizer = MetadataVisualizerManager.getInstance();
export default MetadataVisualizer;
