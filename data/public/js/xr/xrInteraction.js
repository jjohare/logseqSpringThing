// public/js/xr/xrInteraction.js

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

/**
 * Initializes XR controller interactions.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {THREE.Camera} camera - The Three.js camera.
 * @param {THREE.WebGLRenderer} renderer - The Three.js renderer.
 * @param {function} onSelect - Callback function when an object is selected.
 */
export function initXRInteraction(scene, camera, renderer, onSelect) {
    if (!renderer.xr) {
        console.error('WebXR not supported by the renderer');
        return;
    }

    try {
        const controller1 = renderer.xr.getController(0);
        const controller2 = renderer.xr.getController(1);

        controller1.addEventListener('select', onSelect);
        controller2.addEventListener('select', onSelect);

        scene.add(controller1);
        scene.add(controller2);

        // Add visual indicators for controllers
        const controllerModelFactory = new XRControllerModelFactory();

        addControllerModel(renderer, scene, 0, controllerModelFactory);
        addControllerModel(renderer, scene, 1, controllerModelFactory);

    } catch (error) {
        console.error('Error initializing XR interactions:', error);
    }
}

function addControllerModel(renderer, scene, index, factory) {
    try {
        const controllerGrip = renderer.xr.getControllerGrip(index);
        const model = factory.createControllerModel(controllerGrip);
        controllerGrip.add(model);
        scene.add(controllerGrip);
    } catch (error) {
        console.error(`Error adding controller model for index ${index}:`, error);
    }
}

/**
 * Handles controller selection events.
 * @param {THREE.Intersection[]} intersects - Array of intersected objects.
 * @param {function} onSelect - Callback function to handle selection.
 */
export function handleControllerSelection(intersects, onSelect) {
    if (intersects.length > 0) {
        const selectedObject = intersects[0].object;
        onSelect(selectedObject);
    }
}

/**
 * Adds labels as billboards to nodes.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {THREE.Camera} camera - The Three.js camera.
 * @param {Array} nodes - Array of node objects.
 */
export function addNodeLabels(scene, camera, nodes) {
    const loader = new THREE.FontLoader();
    const fallbackFont = 'Arial';
    const fontUrl = '/fonts/helvetiker_regular.typeface.json'; // Assuming the font is bundled locally

    loader.load(
        fontUrl,
        (font) => {
            createLabels(scene, camera, nodes, font);
        },
        undefined,
        (error) => {
            console.error('Error loading font:', error);
            createLabelsWithFallbackFont(scene, camera, nodes, fallbackFont);
        }
    );
}

function createLabels(scene, camera, nodes, font) {
    nodes.forEach(node => {
        try {
            const textGeometry = new THREE.TextGeometry(node.name, {
                font: font,
                size: 1,
                height: 0.1,
                curveSegments: 12,
                bevelEnabled: false,
            });

            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const textMesh = new THREE.Mesh(textGeometry, textMaterial);

            // Position the label above the node
            textMesh.position.set(node.x, node.y + 3, node.z);
            textMesh.lookAt(camera.position); // Make the label face the camera

            scene.add(textMesh);
            node.labelMesh = textMesh; // Store reference for updates
        } catch (error) {
            console.error(`Error creating label for node ${node.name}:`, error);
        }
    });
}

function createLabelsWithFallbackFont(scene, camera, nodes, fallbackFont) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    nodes.forEach(node => {
        try {
            context.font = `12px ${fallbackFont}`;
            const textWidth = context.measureText(node.name).width;

            canvas.width = textWidth;
            canvas.height = 20;

            context.font = `12px ${fallbackFont}`;
            context.fillStyle = 'white';
            context.fillText(node.name, 0, 15);

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);

            sprite.scale.set(0.1 * textWidth, 2, 1);
            sprite.position.set(node.x, node.y + 3, node.z);

            scene.add(sprite);
            node.labelMesh = sprite; // Store reference for updates
        } catch (error) {
            console.error(`Error creating fallback label for node ${node.name}:`, error);
        }
    });
}

/**
 * Updates label orientations to always face the camera.
 * @param {THREE.Camera} camera - The Three.js camera.
 * @param {Array} nodes - Array of node objects with label meshes.
 */
export function updateLabelOrientations(camera, nodes) {
    nodes.forEach(node => {
        if (node.labelMesh) {
            try {
                if (node.labelMesh instanceof THREE.Sprite) {
                    node.labelMesh.position.set(node.x, node.y + 3, node.z);
                } else {
                    node.labelMesh.lookAt(camera.position);
                }
            } catch (error) {
                console.error(`Error updating label orientation for node ${node.name}:`, error);
            }
        }
    });
}
