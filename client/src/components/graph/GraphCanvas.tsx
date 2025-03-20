import React, { useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import GraphManager from './GraphManager'

const BACKGROUND_COLOR = 0x000000;

const GraphCanvas = () => {
  const mesh = useRef<THREE.Mesh>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { scene, camera, gl, size } = useThree()
  const composer = useRef<any>(null)

  useEffect(() => {
    // Set background color
    scene.background = new THREE.Color(BACKGROUND_COLOR);

    // Set camera position
    camera.position.set(0, 10, 50);
    camera.lookAt(0, 0, 0);

    // Initialize renderer settings
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Setup lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Setup post processing
    let renderPass: any, bloomPass: any;

    Promise.all([
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    ]).then(([EffectComposerModule, RenderPassModule, UnrealBloomPassModule]) => {
      renderPass = new RenderPassModule.RenderPass(scene, camera);
      bloomPass = new UnrealBloomPassModule.UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        1.5,
        0.4,
        0.85
      );

      composer.current = new EffectComposerModule.EffectComposer(gl);
      composer.current.addPass(renderPass);
      composer.current.addPass(bloomPass);

      // Handle resize
      const handleResize = () => {
        (camera as THREE.PerspectiveCamera).aspect = window.innerWidth / window.innerHeight;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        gl.setSize(window.innerWidth, window.innerHeight);
        composer.current.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    });
  }, [scene, camera, gl, size])

  useFrame(() => {
    if (mesh.current) {
      mesh.current.rotation.x = mesh.current.rotation.y += 0.01
    }
    if (composer.current) {
      composer.current.render()
    } else {
      gl.render(scene, camera)
    }
  })

  return (
    <Canvas ref={canvasRef}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[-2, 5, 2]} intensity={1} />
      <mesh ref={mesh} rotation={[0, 0, 0]} scale={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        screenSpacePanning
        minDistance={1}
        maxDistance={2000}
        enableRotate
        enableZoom
        enablePan
        rotateSpeed={1.0}
        zoomSpeed={1.2}
        panSpeed={0.8}
      />
      <GraphManager />
    </Canvas>
  )
}

export default GraphCanvas