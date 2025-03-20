import React, { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const GraphManager = () => {
  const { scene, camera, gl } = useThree()
  const nodes = useRef<THREE.InstancedMesh>(null);
  const edges = useRef<THREE.Line[]>([]);
  const nodePositions = useRef([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(10, 0, 0),
    new THREE.Vector3(0, 10, 0),
  ]);
  const nodeCount = 3;

  useEffect(() => {
    // Create geometry and material
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 'red' });

    // Create instanced mesh
    nodes.current = new THREE.InstancedMesh(geometry, material, nodeCount);
    scene.add(nodes.current);

    // Set initial positions
    nodePositions.current.forEach((position, index) => {
      const matrix = new THREE.Matrix4().makeTranslation(position.x, position.y, position.z);
      nodes.current?.setMatrixAt(index, matrix);
    });

    nodes.current.instanceMatrix.needsUpdate = true;

    // Create edges
    const createEdge = (sourceIndex: number, targetIndex: number) => {
      const lineMaterial = new THREE.LineBasicMaterial({ color: 'white' });
      const points = [
        nodePositions.current[sourceIndex],
        nodePositions.current[targetIndex],
      ];

      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);
      edges.current.push(line);
    };

    createEdge(0, 1);
    createEdge(0, 2);

    return () => {
      // Dispose of resources
      geometry.dispose();
      material.dispose();
      if (nodes.current) {
        scene.remove(nodes.current);
      }
      edges.current.forEach((edge) => {
        edge.geometry.dispose();
        (edge.material as THREE.Material).dispose();
        scene.remove(edge);
      });
    }
  }, [scene, camera, gl])

  useFrame(() => {
    // Update node positions (for example, animate them)
    if (nodes.current) {
      for (let i = 0; i < nodeCount; i++) {
        nodePositions.current[i].set(
          Math.random() * 20 - 10,
          Math.random() * 20 - 10,
          Math.random() * 20 - 10
        );
        const matrix = new THREE.Matrix4().makeTranslation(
          nodePositions.current[i].x,
          nodePositions.current[i].y,
          nodePositions.current[i].z
        );
        nodes.current.setMatrixAt(i, matrix);
      }
      nodes.current.instanceMatrix.needsUpdate = true;
    }

    // Update edge positions
    edges.current.forEach((line, index) => {
      let sourceIndex = 0;
      let targetIndex = 0;

      if (index === 0) {
        sourceIndex = 0;
        targetIndex = 1;
      } else if (index === 1) {
        sourceIndex = 0;
        targetIndex = 2;
      }

      const points = [
        nodePositions.current[sourceIndex],
        nodePositions.current[targetIndex],
      ];
      line.geometry.setFromPoints(points);
      line.geometry.attributes.position.needsUpdate = true;
    });
  })

  return null
}

export default GraphManager