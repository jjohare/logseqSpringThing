// TODO: This label utility function is currently unused in the project.
// Consider integrating it into graph/nodeManager.js when implementing
// node labeling functionality in the visualization.

import * as THREE from 'three';

/**
 * Creates a sprite label for a node.
 * @param {string} text - The text to display.
 * @param {THREE.Font} font - Loaded Three.js font.
 * @param {number} fontSize - Size of the font.
 * @returns {THREE.Sprite} - The sprite containing the label.
 */
export function createNodeLabel(text, font, fontSize) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set canvas size
    context.font = `${fontSize}px Arial`;
    const metrics = context.measureText(text);
    canvas.width = metrics.width + 20;
    canvas.height = fontSize + 20;

    // Draw background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.fillStyle = 'white';
    context.font = `${fontSize}px Arial`;
    context.fillText(text, 10, fontSize + 10);

    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
    return sprite;
}
