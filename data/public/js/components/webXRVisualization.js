import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

export class WebXRVisualization {
    constructor(graphDataManager) {
        this.graphDataManager = graphDataManager;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.vrButton = null;
        this.controller1 = null;
        this.controller2 = null;
        this.nodes = [];
        this.edges = [];
        this.raycaster = new THREE.Raycaster();
        this.tempMatrix = new THREE.Matrix4();

        this.onSelectStart = this.onSelectStart.bind(this);
        this.onSelectEnd = this.onSelectEnd.bind(this);
        this.animate = this.animate.bind(this);
        this.render = this.render.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
    }

    initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x505050);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.6, 3);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.vrButton = VRButton.createButton(this.renderer);
        document.body.appendChild(this.vrButton);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.6, 0);
        this.controls.update();

        this.controller1 = this.renderer.xr.getController(0);
        this.controller1.addEventListener('selectstart', this.onSelectStart);
        this.controller1.addEventListener('selectend', this.onSelectEnd);
        this.scene.add(this.controller1);

        this.controller2 = this.renderer.xr.getController(1);
        this.controller2.addEventListener('selectstart', this.onSelectStart);
        this.controller2.addEventListener('selectend', this.onSelectEnd);
        this.scene.add(this.controller2);

        const controllerModelFactory = new XRControllerModelFactory();

        const controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
        this.scene.add(controllerGrip1);

        const controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
        this.scene.add(controllerGrip2);

        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        light.position.set(0.5, 1, 0.25);
        this.scene.add(light);

        window.addEventListener('resize', this.onWindowResize, false);

        this.renderer.setAnimationLoop(this.render);

        this.initializeGraph();
    }

    initializeGraph() {
        this.nodes.forEach(node => this.scene.remove(node));
        this.edges.forEach(edge => this.scene.remove(edge));
        this.nodes = [];
        this.edges = [];

        const graphData = this.graphDataManager.getGraphData();

        if (!graphData) {
            console.warn('Graph data not available yet');
            return;
        }

        graphData.nodes.forEach(nodeData => {
            const geometry = new THREE.SphereGeometry(0.05, 32, 32);
            const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
            const nodeMesh = new THREE.Mesh(geometry, material);
            nodeMesh.position.set(
                nodeData.x || (Math.random() * 2 - 1),
                nodeData.y || (Math.random() * 2 - 1),
                nodeData.z || (Math.random() * 2 - 1)
            );
            nodeMesh.userData = nodeData;
            this.scene.add(nodeMesh);
            this.nodes.push(nodeMesh);
        });

        graphData.edges.forEach(edgeData => {
            const sourceNode = this.nodes.find(node => node.userData.id === edgeData.source);
            const targetNode = this.nodes.find(node => node.userData.id === edgeData.target_node);
            if (sourceNode && targetNode) {
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    sourceNode.position,
                    targetNode.position
                ]);
                const material = new THREE.LineBasicMaterial({ color: 0xffffff });
                const edgeLine = new THREE.Line(geometry, material);
                this.scene.add(edgeLine);
                this.edges.push(edgeLine);
            }
        });

        console.log(`Graph initialized with ${this.nodes.length} nodes and ${this.edges.length} edges`);
    }

    updateVisualization() {
        this.initializeGraph();
    }

    onSelectStart(event) {
        const controller = event.target;
        
        this.tempMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

        const intersects = this.raycaster.intersectObjects(this.nodes);

        if (intersects.length > 0) {
            const intersectedObject = intersects[0].object;
            intersectedObject.material.color.setHex(0xff0000);
            console.log('Selected node:', intersectedObject.userData);
        }
    }

    onSelectEnd(event) {
        // Handle end of selection if needed
    }

    animate() {
        this.controls.update();
        this.render();
        requestAnimationFrame(this.animate);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateVisualFeatures(features) {
        console.log('Updating visual features:', features);
        // Implement visual feature updates here
    }

    updateLayout(params) {
        console.log('Updating layout with params:', params);
        // Implement layout update logic here
    }

    handleSpacemouseInput(x, y, z) {
        console.log('Handling Spacemouse input:', x, y, z);
        // Implement Spacemouse input handling here
    }
}
