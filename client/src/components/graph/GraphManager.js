import { useRef, useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { graphDataManager } from '../../lib/managers/graph-data-manager';
import { createLogger } from '../../lib/utils/logger';
import { debugState } from '../../lib/utils/debug-state';
import { useSettingsStore } from '../../lib/settings-store';
const logger = createLogger('GraphManager');
const GraphManager = () => {
    const { scene, camera, gl } = useThree();
    const nodes = useRef(null);
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const edges = useRef(new Map());
    const settings = useSettingsStore(state => state.settings);
    // Memoize settings to avoid unnecessary updates
    const nodeSettings = settings?.visualization?.nodes;
    const edgeSettings = settings?.visualization?.edges;
    // Create and set up the instanced mesh for nodes
    useEffect(() => {
        // Create node geometry based on settings
        const size = nodeSettings?.defaultSize || 1;
        const geometry = new THREE.SphereGeometry(size, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: nodeSettings?.color || '#ff4500',
            emissive: nodeSettings?.color || '#ff4500',
            emissiveIntensity: 0.3,
            roughness: 0.7,
            metalness: 0.2
        });
        // Create a dummy for maximum nodes, will update count as needed
        const maxNodes = 1000; // Initial allocation, will resize if needed
        const instancedMesh = new THREE.InstancedMesh(geometry, material, maxNodes);
        instancedMesh.count = 0; // Start with 0 instances
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        scene.add(instancedMesh);
        nodes.current = instancedMesh;
        // Set up subscription to graph data changes
        const unsubscribe = graphDataManager.onGraphDataChange((data) => {
            setGraphData(data);
            updateNodeInstances(data.nodes);
            updateEdges(data.edges, data.nodes);
        });
        // Set up subscription to binary position updates
        const unsubscribePositions = graphDataManager.onPositionUpdate((positions) => {
            updateNodePositions(positions);
        });
        if (debugState.isEnabled()) {
            logger.info('GraphManager initialized');
        }
        return () => {
            // Clean up
            geometry.dispose();
            material.dispose();
            scene.remove(instancedMesh);
            unsubscribe();
            unsubscribePositions();
            // Clean up edges
            edges.current.forEach((line) => {
                line.geometry.dispose();
                if (line.material instanceof THREE.Material) {
                    line.material.dispose();
                }
                else if (Array.isArray(line.material)) {
                    line.material.forEach(mat => mat.dispose());
                }
                scene.remove(line);
            });
            edges.current.clear();
            if (debugState.isEnabled()) {
                logger.info('GraphManager disposed');
            }
        };
    }, [scene]);
    // Update node instances when graph data changes
    const updateNodeInstances = (graphNodes) => {
        if (!nodes.current)
            return;
        // Resize instanced mesh if needed
        if (graphNodes.length > nodes.current.count) {
            const oldMesh = nodes.current;
            const newCount = Math.max(graphNodes.length, oldMesh.count * 2); // Double capacity
            if (debugState.isDataDebugEnabled()) {
                logger.debug(`Resizing instanced mesh from ${oldMesh.count} to ${newCount} nodes`);
            }
            const newMesh = new THREE.InstancedMesh(oldMesh.geometry, oldMesh.material, newCount);
            // Copy existing instances
            for (let i = 0; i < oldMesh.count; i++) {
                const matrix = new THREE.Matrix4();
                oldMesh.getMatrixAt(i, matrix);
                newMesh.setMatrixAt(i, matrix);
            }
            newMesh.count = graphNodes.length;
            newMesh.instanceMatrix.needsUpdate = true;
            scene.remove(oldMesh);
            scene.add(newMesh);
            nodes.current = newMesh;
        }
        else {
            nodes.current.count = graphNodes.length;
        }
        // Update node positions and matrices
        graphNodes.forEach((node, index) => {
            if (!nodes.current)
                return;
            const matrix = new THREE.Matrix4().makeTranslation(node.position.x, node.position.y, node.position.z);
            // Apply scale based on settings or metadata
            const size = node.metadata?.size || nodeSettings?.defaultSize || 1;
            matrix.scale(new THREE.Vector3(size, size, size));
            nodes.current.setMatrixAt(index, matrix);
        });
        if (nodes.current) {
            nodes.current.instanceMatrix.needsUpdate = true;
        }
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Updated ${graphNodes.length} node instances`);
        }
    };
    // Update edges when graph data changes
    const updateEdges = (graphEdges, graphNodes) => {
        // Keep track of active edges
        const activeEdges = new Set();
        // Create or update edges
        graphEdges.forEach(edge => {
            activeEdges.add(edge.id);
            // Find source and target nodes
            const sourceNode = graphNodes.find(n => n.id === edge.source);
            const targetNode = graphNodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) {
                if (debugState.isDataDebugEnabled()) {
                    logger.debug(`Edge ${edge.id} has missing nodes: source=${edge.source}, target=${edge.target}`);
                }
                return;
            }
            const source = new THREE.Vector3(sourceNode.position.x, sourceNode.position.y, sourceNode.position.z);
            const target = new THREE.Vector3(targetNode.position.x, targetNode.position.y, targetNode.position.z);
            // Create or update line
            if (edges.current.has(edge.id)) {
                // Update existing edge
                const line = edges.current.get(edge.id);
                const points = [source, target];
                line.geometry.setFromPoints(points);
                line.geometry.attributes.position.needsUpdate = true;
            }
            else {
                // Create new edge
                const material = new THREE.LineBasicMaterial({
                    color: edgeSettings?.color || '#ffffff',
                    linewidth: edgeSettings?.width || 1,
                    opacity: edgeSettings?.opacity || 0.8,
                    transparent: true,
                });
                const geometry = new THREE.BufferGeometry().setFromPoints([source, target]);
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                edges.current.set(edge.id, line);
            }
        });
        // Remove deleted edges
        edges.current.forEach((line, id) => {
            if (!activeEdges.has(id)) {
                scene.remove(line);
                line.geometry.dispose();
                if (line.material instanceof THREE.Material) {
                    line.material.dispose();
                }
                edges.current.delete(id);
            }
        });
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Updated ${graphEdges.length} edges`);
        }
    };
    // Update node positions from binary data
    const updateNodePositions = (positions) => {
        if (!nodes.current || positions.length === 0)
            return;
        // Process positions (id, x, y, z for each node)
        for (let i = 0; i < positions.length; i += 4) {
            const nodeId = positions[i].toString();
            const x = positions[i + 1];
            const y = positions[i + 2];
            const z = positions[i + 3];
            // Find node index in our current data
            const nodeIndex = graphData.nodes.findIndex(n => n.id === nodeId);
            if (nodeIndex < 0 || nodeIndex >= nodes.current.count)
                continue;
            // Update node position in our data model
            graphData.nodes[nodeIndex].position = { x, y, z };
            // Update instanced mesh matrix
            const matrix = new THREE.Matrix4();
            nodes.current.getMatrixAt(nodeIndex, matrix);
            // Extract scale from the current matrix
            const scale = new THREE.Vector3();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            matrix.decompose(position, quaternion, scale);
            // Create new matrix with updated position but same scale
            const newMatrix = new THREE.Matrix4()
                .compose(new THREE.Vector3(x, y, z), quaternion, scale);
            nodes.current.setMatrixAt(nodeIndex, newMatrix);
        }
        if (nodes.current) {
            nodes.current.instanceMatrix.needsUpdate = true;
        }
        // Update edge positions
        updateEdgePositions();
    };
    // Update edge positions based on current node positions
    const updateEdgePositions = () => {
        graphData.edges.forEach(edge => {
            if (!edges.current.has(edge.id))
                return;
            const sourceNode = graphData.nodes.find(n => n.id === edge.source);
            const targetNode = graphData.nodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode)
                return;
            const source = new THREE.Vector3(sourceNode.position.x, sourceNode.position.y, sourceNode.position.z);
            const target = new THREE.Vector3(targetNode.position.x, targetNode.position.y, targetNode.position.z);
            const line = edges.current.get(edge.id);
            const points = [source, target];
            line.geometry.setFromPoints(points);
            line.geometry.attributes.position.needsUpdate = true;
        });
    };
    // Update when settings change
    useEffect(() => {
        if (!nodes.current || !nodeSettings || !edgeSettings)
            return;
        // Update node material
        if (nodes.current.material instanceof THREE.Material) {
            const material = nodes.current.material;
            material.color.set(nodeSettings.color);
            material.emissive.set(nodeSettings.color);
            material.needsUpdate = true;
        }
        // Update edge materials
        edges.current.forEach((line) => {
            if (line.material instanceof THREE.LineBasicMaterial) {
                line.material.color.set(edgeSettings.color);
                line.material.linewidth = edgeSettings.width;
                line.material.opacity = edgeSettings.opacity;
                line.material.needsUpdate = true;
            }
        });
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Updated graph visualization with new settings');
        }
    }, [nodeSettings, edgeSettings]);
    return null; // This component doesn't render directly
};
export default GraphManager;
