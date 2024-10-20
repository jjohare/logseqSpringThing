// TODO: These color utility functions are currently unused in the project.
// Consider integrating them into nodeManager.js and edgeManager.js when implementing dynamic color schemes.

import * as THREE from 'three';

export function getNodeColor(hyperlinkCount, maxHyperlinks) {
    const t = Math.min(hyperlinkCount / maxHyperlinks, 1);
    return new THREE.Color(t, 0, 1 - t).getHex();
}

export function getEdgeColor(weight, maxWeight) {
    const t = Math.min(weight / maxWeight, 1);
    return new THREE.Color(1 - t, t, 0).getHex();
}
