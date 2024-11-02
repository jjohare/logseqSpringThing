import * as THREE from 'three';

export class VRControlPanel {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.panel = new THREE.Group();
        this.controls = new Map();
        this.initPanel();
    }

    initPanel() {
        // Create a background panel
        const panelGeometry = new THREE.PlaneGeometry(1, 1.5);
        const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.7 });
        const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
        this.panel.add(panelMesh);

        // Position the panel in front of the camera
        this.panel.position.set(0, 0, -2);
        this.panel.lookAt(this.camera.position);

        this.scene.add(this.panel);
    }

    createSlider(name, min, max, value, y) {
        const sliderGroup = new THREE.Group();
        sliderGroup.name = name;

        // Create slider track
        const trackGeometry = new THREE.PlaneGeometry(0.8, 0.05);
        const trackMaterial = new THREE.MeshBasicMaterial({ color: 0x505050 });
        const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
        sliderGroup.add(trackMesh);

        // Create slider handle
        const handleGeometry = new THREE.SphereGeometry(0.03);
        const handleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const handleMesh = new THREE.Mesh(handleGeometry, handleMaterial);
        handleMesh.position.x = this.mapValue(value, min, max, -0.4, 0.4);
        sliderGroup.add(handleMesh);

        // Create label
        const labelGeometry = new THREE.PlaneGeometry(0.4, 0.1);
        const labelMaterial = new THREE.MeshBasicMaterial({ map: this.createTextTexture(name) });
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.set(-0.6, 0, 0);
        sliderGroup.add(labelMesh);

        sliderGroup.position.set(0, y, 0.01);
        this.panel.add(sliderGroup);
        this.controls.set(name, { group: sliderGroup, min, max, value });
    }

    createColorPicker(name, value, y) {
        const pickerGroup = new THREE.Group();
        pickerGroup.name = name;

        // Create color swatch
        const swatchGeometry = new THREE.PlaneGeometry(0.1, 0.1);
        const swatchMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(value) });
        const swatchMesh = new THREE.Mesh(swatchGeometry, swatchMaterial);
        pickerGroup.add(swatchMesh);

        // Create label
        const labelGeometry = new THREE.PlaneGeometry(0.4, 0.1);
        const labelMaterial = new THREE.MeshBasicMaterial({ map: this.createTextTexture(name) });
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.set(-0.3, 0, 0);
        pickerGroup.add(labelMesh);

        pickerGroup.position.set(0, y, 0.01);
        this.panel.add(pickerGroup);
        this.controls.set(name, { group: pickerGroup, value });
    }

    createTextTexture(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.font = '48px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 128, 32);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    mapValue(value, inMin, inMax, outMin, outMax) {
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    updateControl(name, value) {
        const control = this.controls.get(name);
        if (control) {
            if (control.min !== undefined && control.max !== undefined) {
                // It's a slider
                const handle = control.group.children[1];
                handle.position.x = this.mapValue(value, control.min, control.max, -0.4, 0.4);
            } else {
                // It's a color picker
                const swatch = control.group.children[0];
                swatch.material.color.set(value);
            }
            control.value = value;
        }
    }

    handleInteraction(intersection) {
        const controlName = intersection.object.parent.name;
        const control = this.controls.get(controlName);
        if (control) {
            if (control.min !== undefined && control.max !== undefined) {
                // It's a slider
                const newValue = this.mapValue(intersection.point.x, -0.4, 0.4, control.min, control.max);
                this.updateControl(controlName, newValue);
                return { name: controlName, value: newValue };
            } else {
                // It's a color picker
                // For simplicity, we'll just cycle through a few preset colors
                const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
                const currentIndex = colors.indexOf(control.value);
                const newValue = colors[(currentIndex + 1) % colors.length];
                this.updateControl(controlName, newValue);
                return { name: controlName, value: '#' + newValue.toString(16).padStart(6, '0') };
            }
        }
        return null;
    }
}
