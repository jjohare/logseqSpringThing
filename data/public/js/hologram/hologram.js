import * as THREE from 'three';

export class Hologram {
    constructor(scene, color, scale, opacity) {
        this.scene = scene;
        this.color = color;
        this.scale = scale;
        this.opacity = opacity;
        this.group = new THREE.Group();
        this.init();
    }

    init() {
        // Add an Icosahedron
        const geometry = new THREE.IcosahedronGeometry(40 * this.scale, 1);
        const material = new THREE.MeshBasicMaterial({
            color: this.color,
            wireframe: true,
            transparent: true,
            opacity: this.opacity
        });
        const icosahedron = new THREE.Mesh(geometry, material);
        icosahedron.userData.rotationSpeed = 0.0001;
        this.group.add(icosahedron);

        // Add more hologram elements as needed

        this.scene.add(this.group);
    }

    animate() {
        this.group.children.forEach(child => {
            child.rotation.x += child.userData.rotationSpeed;
            child.rotation.y += child.userData.rotationSpeed;
        });
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }

    updateScale(newScale) {
        this.scale = newScale;
        this.group.scale.set(newScale, newScale, newScale);
    }

    updateColor(newColor) {
        this.color = newColor;
        this.group.children.forEach(child => {
            child.material.color.set(newColor);
        });
    }

    updateOpacity(newOpacity) {
        this.opacity = newOpacity;
        this.group.children.forEach(child => {
            child.material.opacity = newOpacity;
        });
    }
}
