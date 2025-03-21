import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { Vector3 } from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Interactive } from '@react-three/xr';
import { useSettingsStore } from '../../../lib/stores/settings-store';
import { createLogger } from '../../../lib/utils/logger';
const logger = createLogger('XRControlPanel');
/**
 * XRControlPanel provides an interactive interface for controlling settings in XR mode.
 * It's attached to a controller and follows its movement while providing touch/pointer interaction.
 */
const XRControlPanel = ({ distance = 0.3, size = { width: 0.3, height: 0.2 }, visible = true, controller = 0, faceUser = true, }) => {
    const groupRef = useRef(null);
    const { camera } = useThree();
    const [hovered, setHovered] = useState(false);
    const [selectedTab, setSelectedTab] = useState('visualization');
    const { settings } = useSettingsStore();
    // Position the panel relative to the controller
    useFrame((state, delta) => {
        if (!groupRef.current)
            return;
        // If we have controller data, position the panel relative to it
        const controllers = state.controllers;
        if (controllers && controllers[controller]) {
            const controllerObj = controllers[controller];
            // Get controller position and orientation
            const position = new Vector3();
            controllerObj.getWorldPosition(position);
            const quaternion = controllerObj.getWorldQuaternion();
            // Position the panel in front of the controller
            const forward = new Vector3(0, 0, -1).applyQuaternion(quaternion);
            position.addScaledVector(forward, distance);
            groupRef.current.position.copy(position);
            // Either match controller orientation or face the user
            if (faceUser) {
                // Make the panel face the user
                groupRef.current.lookAt(camera.position);
            }
            else {
                // Match controller orientation
                groupRef.current.quaternion.copy(quaternion);
            }
        }
    });
    // Handle tab selection
    const handleTabSelect = (tab) => {
        setSelectedTab(tab);
        logger.debug(`Selected XR panel tab: ${tab}`);
    };
    if (!visible)
        return null;
    return (_jsxs("group", { ref: groupRef, children: [_jsx(Interactive, { onSelect: () => { }, onHover: () => setHovered(true), onBlur: () => setHovered(false), children: _jsxs("mesh", { position: [0, 0, 0], children: [_jsx("planeGeometry", { args: [size.width, size.height] }), _jsx("meshStandardMaterial", { color: hovered ? '#2a2a2a' : '#1a1a1a', transparent: true, opacity: 0.8 })] }) }), _jsxs("group", { position: [0, size.height / 2 - 0.02, 0.001], children: [_jsx(Interactive, { onSelect: () => handleTabSelect('visualization'), children: _jsxs("mesh", { position: [-size.width / 4, 0, 0], children: [_jsx("planeGeometry", { args: [size.width / 3.5, 0.03] }), _jsx("meshStandardMaterial", { color: selectedTab === 'visualization' ? '#4a86e8' : '#333333' })] }) }), _jsx(Interactive, { onSelect: () => handleTabSelect('xr'), children: _jsxs("mesh", { position: [size.width / 4, 0, 0], children: [_jsx("planeGeometry", { args: [size.width / 3.5, 0.03] }), _jsx("meshStandardMaterial", { color: selectedTab === 'xr' ? '#4a86e8' : '#333333' })] }) })] }), _jsxs("group", { position: [0, 0, 0.001], children: [selectedTab === 'visualization' && (_jsxs("group", { children: [_jsxs("mesh", { position: [0, 0.05, 0], scale: [0.9, 0.1, 1], children: [_jsx("planeGeometry", {}), _jsx("meshStandardMaterial", { color: "#333333" })] }), _jsxs("mesh", { position: [0, -0.05, 0], scale: [0.9, 0.1, 1], children: [_jsx("planeGeometry", {}), _jsx("meshStandardMaterial", { color: "#333333" })] })] })), selectedTab === 'xr' && (_jsx("group", { children: _jsxs("mesh", { position: [0, 0, 0], scale: [0.9, 0.15, 1], children: [_jsx("planeGeometry", {}), _jsx("meshStandardMaterial", { color: "#333333" })] }) }))] })] }));
};
export default XRControlPanel;
