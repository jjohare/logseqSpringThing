import {
    Scene,
    InstancedMesh,
    Matrix4,
    Vector3,
    Mesh,
    Object3D,
    Quaternion,
    BufferGeometry,
    Material,
    PerspectiveCamera
} from 'three';
import { NodeData } from '../core/types';
import { NodeMetadata } from '../types/metadata';
import { Settings } from '../types/settings/base';
import { MetadataVisualizer } from '../visualization/MetadataVisualizer';
import { XRHandWithHaptics } from '../types/xr';
import { GeometryFactory } from './factories/GeometryFactory';
import { MaterialFactory } from './factories/MaterialFactory';
import { HologramShaderMaterial } from './materials/HologramShaderMaterial';
import { platformManager } from '../platform/platformManager';

export class EnhancedNodeManager {
    private scene: Scene;
    private settings: Settings;
    private nodes: Map<string, Mesh> = new Map();
    private nodeGeometry: BufferGeometry;
    private nodeMaterial: Material;
    private instancedMesh: InstancedMesh | null = null;
    private geometryFactory: GeometryFactory;
    private materialFactory: MaterialFactory;
    private isInstanced: boolean;
    private isHologram: boolean = false;
    private hologramMaterial: HologramShaderMaterial | null = null;
    private metadataMaterial: Material | null = null;
    private metadataVisualizer: MetadataVisualizer;
    private quaternion = new Quaternion();
    private reusableMatrix = new Matrix4();
    private reusablePosition = new Vector3();
    private reusableScale = new Vector3();
    private camera: PerspectiveCamera;
    private updateFrameCount = 0;
    private readonly AR_UPDATE_FREQUENCY = 2;
    private readonly METADATA_DISTANCE_THRESHOLD = 50;
    private readonly ANIMATION_DISTANCE_THRESHOLD = 30;
    private nodeScales: Map<string, number> = new Map(); // Store node scales

    constructor(scene: Scene, settings: Settings) {
        this.scene = scene;
        this.settings = settings;

        let camera: PerspectiveCamera | null = null;
        scene.traverse((object) => {
            if (object instanceof PerspectiveCamera) {
                camera = object;
            }
        });
        if (!camera) {
            camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 5, 20);
            camera.lookAt(0, 0, 0);
            scene.add(camera);
        }
        this.camera = camera;

        this.geometryFactory = GeometryFactory.getInstance();
        this.materialFactory = MaterialFactory.getInstance();
        this.isInstanced = settings.visualization.nodes.enableInstancing && !platformManager.isXRMode;
        this.nodeGeometry = this.geometryFactory.getNodeGeometry(settings.visualization.nodes.quality);
        this.nodeMaterial = this.materialFactory.getNodeMaterial(settings);
        this.isHologram = settings.visualization.nodes.enableHologram;

        if (this.settings.visualization.nodes.enableHologram) {
            this.hologramMaterial = this.materialFactory.getHologramMaterial(settings);
        }

        this.metadataMaterial = this.materialFactory.getMetadataMaterial();
        this.metadataVisualizer = new MetadataVisualizer(this.camera, this.scene, settings);
        this.setupInstancedMesh();
    }

    private setupInstancedMesh() {
        if (this.isInstanced) {
            this.instancedMesh = new InstancedMesh(this.nodeGeometry, this.nodeMaterial, 2000);
            this.instancedMesh.count = 0;
            this.instancedMesh.layers.set(platformManager.isXRMode ? 1 : 0);
            this.scene.add(this.instancedMesh);
        }
    }

    public handleSettingsUpdate(settings: Settings): void {
        this.settings = settings;
        
        this.nodeMaterial = this.materialFactory.getNodeMaterial(settings);
        if (!this.isInstanced) {
            this.nodes.forEach(node => {
                node.material = this.nodeMaterial;
            });
        }

        const newGeometry = this.geometryFactory.getNodeGeometry(settings.visualization.nodes.quality);
        if (this.nodeGeometry !== newGeometry) {
            this.nodeGeometry = newGeometry;
            if (this.instancedMesh) {
                this.instancedMesh.geometry = this.nodeGeometry;
            }
            if (!this.isInstanced) {
                this.nodes.forEach(node => {
                    node.geometry = this.nodeGeometry;
                });
            }
        }

        this.materialFactory.updateMaterial('node-basic', settings);
        this.materialFactory.updateMaterial('node-phong', settings);
        this.materialFactory.updateMaterial('edge', settings);
        if (this.isHologram) {
            this.materialFactory.updateMaterial('hologram', settings);
        }

        const newIsInstanced = settings.visualization.nodes.enableInstancing;
        const newIsHologram = settings.visualization.nodes.enableHologram;

        if (newIsInstanced !== this.isInstanced || newIsHologram !== this.isHologram) {
            this.isInstanced = newIsInstanced;
            this.isHologram = newIsHologram;
            this.rebuildInstancedMesh();
        }

        if (settings.visualization.nodes.enableMetadataVisualization) {
            const cameraPosition = this.camera.position;
            const shouldShowMetadata = (position: Vector3) => {
                return position.distanceTo(cameraPosition) < this.METADATA_DISTANCE_THRESHOLD;
            };

            this.nodes.forEach((node) => {
                node.children.slice().forEach((child: Object3D) => {
                    if (child instanceof Object3D && (child.userData as any).isMetadata) {
                        node.remove(child);
                    }
                });

                const metadata = node.userData as NodeMetadata;
                if (metadata && shouldShowMetadata(node.position)) {
                    this.metadataVisualizer.createMetadataLabel(metadata).then((group) => {
                        if (shouldShowMetadata(node.position)) {
                            node.add(group);
                        }
                    });
                }
            });
        } else {
            this.nodes.forEach(node => {
                node.children.slice().forEach((child: Object3D) => {
                    if (child instanceof Object3D && (child.userData as any).isMetadata) {
                        node.remove(child);
                    }
                });
            });
        }
    }

    updateNodes(nodes: { id: string, data: NodeData }[]) {
        if (this.isInstanced && this.instancedMesh) {
            this.instancedMesh.count = nodes.length;
        }

        nodes.forEach((node, index) => {
            const metadata: NodeMetadata = {
                id: node.id,
                name: node.data.metadata?.name || '',
                commitAge: this.calculateCommitAge(node.data.metadata?.lastModified || Date.now()),
                hyperlinkCount: node.data.metadata?.links?.length || 0,
                importance: this.calculateImportance({ id: node.id, data: node.data }),
                position: {
                    x: node.data.position.x,
                    y: node.data.position.y,
                    z: node.data.position.z
                }
            };

            const scale = this.calculateNodeScale(metadata.importance);
            this.nodeScales.set(node.id, scale); // Store the scale

            const existingNode = this.nodes.get(node.id);
            if (existingNode && !this.isInstanced) {
                existingNode.position.set(
                    node.data.position.x,
                    node.data.position.y,
                    node.data.position.z
                );
                existingNode.scale.setScalar(scale);
                existingNode.userData = metadata;
            } else {
                let nodeMesh: Mesh;

                if (this.settings.visualization.nodes.enableMetadataShape) {
                    nodeMesh = this.metadataVisualizer.createNodeVisual(metadata);
                    nodeMesh.position.set(metadata.position.x, metadata.position.y, metadata.position.z);
                    nodeMesh.userData = metadata;

                    if (this.settings.visualization.nodes.enableMetadataVisualization) {
                        this.metadataVisualizer.createMetadataLabel(metadata).then((group) => {
                            nodeMesh.add(group);
                        });
                    }

                    this.scene.add(nodeMesh);
                    this.nodes.set(node.id, nodeMesh);
                } else {
                    const position = new Vector3(metadata.position.x, metadata.position.y, metadata.position.z);

                    if (this.isInstanced && this.instancedMesh) {
                        this.reusablePosition.copy(position);
                        this.reusableScale.set(scale, scale, scale);
                        const matrix = this.reusableMatrix.compose(this.reusablePosition, this.quaternion, this.reusableScale);
                        this.instancedMesh.setMatrixAt(index, matrix);
                    } else {
                        nodeMesh = new Mesh(this.nodeGeometry, this.nodeMaterial);
                        nodeMesh.position.copy(position);
                        nodeMesh.scale.set(scale, scale, scale);
                        nodeMesh.layers.enable(0);
                        nodeMesh.layers.enable(1);
                        nodeMesh.userData = metadata;

                        if (this.settings.visualization.nodes.enableMetadataVisualization && 
                            position.distanceTo(this.camera.position) < this.METADATA_DISTANCE_THRESHOLD) {
                            this.metadataVisualizer.createMetadataLabel(metadata).then((group) => {
                                if (position.distanceTo(this.camera.position) < this.METADATA_DISTANCE_THRESHOLD)
                                    nodeMesh.add(group);
                            });
                        }

                        this.scene.add(nodeMesh);
                        this.nodes.set(node.id, nodeMesh);
                    }
                }
            }
        });

        if (this.isInstanced && this.instancedMesh) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    private calculateCommitAge(timestamp: number): number {
        const now = Date.now();
        return (now - timestamp) / (1000 * 60 * 60 * 24);
    }

    private calculateImportance(node: { id: string, data: NodeData }): number {
        const linkFactor = node.data.metadata?.links ? node.data.metadata.links.length / 20 : 0;
        const referenceFactor = node.data.metadata?.references ? node.data.metadata.references.length / 10 : 0;
        return Math.min(linkFactor + referenceFactor, 1);
    }

    private calculateNodeScale(importance: number): number {
        const [min, max] = this.settings.visualization.nodes.sizeRange;
        return min + (max - min) * importance;
    }

    private rebuildInstancedMesh() {
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
            this.scene.remove(this.instancedMesh);
        }
        if (this.isInstanced) {
            this.instancedMesh = new InstancedMesh(this.nodeGeometry, this.nodeMaterial, 1000);
            this.instancedMesh.count = 0;
            this.instancedMesh.layers.set(platformManager.isXRMode ? 1 : 0);
            this.scene.add(this.instancedMesh);
        }
    }

    update(deltaTime: number) {
        this.updateFrameCount++;
        const isARMode = platformManager.isXRMode;

        if (isARMode && this.updateFrameCount % this.AR_UPDATE_FREQUENCY !== 0) {
            return;
        }

        if (this.isHologram && this.hologramMaterial) {
            this.hologramMaterial.update(deltaTime);
        }

        if (this.settings.visualization.animations.enableNodeAnimations) {
            const cameraPosition = this.camera.position;
            if (this.instancedMesh) {
                this.instancedMesh.instanceMatrix.needsUpdate = true;
            }
            this.scene.traverse((child: Object3D) => {
                if (child instanceof Mesh && (child.material as any).type === 'LineBasicMaterial' && child.position.distanceTo(cameraPosition) < this.ANIMATION_DISTANCE_THRESHOLD) {
                    child.rotateY(0.001 * deltaTime);
                }
            });
        }
    }

    public updateNodePositions(nodes: { id: string, data: { position: [number, number, number], velocity: [number, number, number] } }[]): void {
        nodes.forEach((node, index) => {
            const existingNode = this.nodes.get(node.id);
            const scale = this.nodeScales.get(node.id) || this.calculateNodeScale(0.5); // Default importance of 0.5

            if (existingNode) {
                existingNode.position.set(
                    node.data.position[0],
                    node.data.position[1],
                    node.data.position[2]
                );
            } else {
                // Create a new node if it doesn't exist
                if (!this.isInstanced) {
                    const nodeMesh = new Mesh(this.nodeGeometry, this.nodeMaterial);
                    nodeMesh.position.set(
                        node.data.position[0],
                        node.data.position[1],
                        node.data.position[2]
                    );
                    nodeMesh.scale.setScalar(scale);
                    nodeMesh.layers.enable(0);
                    nodeMesh.layers.enable(1);
                    this.scene.add(nodeMesh);
                    this.nodes.set(node.id, nodeMesh);
                } else if (this.instancedMesh) {
                this.reusablePosition.set(
                    node.data.position[0],
                    node.data.position[1],
                    node.data.position[2]
                );
                this.reusableScale.setScalar(scale);
                this.reusableMatrix.compose(
                    this.reusablePosition,
                    this.quaternion,
                    this.reusableScale
                );
                this.instancedMesh.setMatrixAt(index, this.reusableMatrix);
                }
            }
        });

        if (this.isInstanced && this.instancedMesh) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    handleHandInteraction(hand: XRHandWithHaptics) {
        const indexTip = hand.hand.joints['index-finger-tip'] as Object3D | undefined;
        if (indexTip) {
            if (this.isHologram && this.hologramMaterial) {
                this.reusablePosition.setFromMatrixPosition(indexTip.matrixWorld);
                this.hologramMaterial.handleInteraction(this.reusablePosition);
            }
        }
    }

    dispose() {
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
            this.scene.remove(this.instancedMesh);
        }
        if (this.isHologram && this.hologramMaterial) {
            this.hologramMaterial.dispose();
        }
        if (this.metadataMaterial) {
            this.metadataMaterial.dispose();
        }
        this.nodes.forEach(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
            this.scene.remove(node);
        });
        this.nodes.clear();
        this.nodeScales.clear();
    }

    public setXRMode(enabled: boolean): void {
        if (this.instancedMesh) {
            this.instancedMesh.layers.set(enabled ? 1 : 0);
        }
        this.nodes.forEach(node => {
            node.layers.set(enabled ? 1 : 0);
            node.traverse((child: Object3D) => {
                child.layers.set(enabled ? 1 : 0);
            });
        });
    }
}
