import * as THREE from 'three';

// Position validation constants
export const VALIDATION = {
  MAX_POSITION: 1000,
  MIN_POSITION: -1000,
  MAX_VELOCITY: 50,
  MIN_VELOCITY: -50,
  POSITION_CHANGE_THRESHOLD: 0.01,
  EXPECTED_BINARY_SIZE: 24,
  UPDATE_INTERVAL: 200, // Increased to 200ms (5 FPS)
  BATCH_SIZE: 100
};

export const VISUALIZATION_CONSTANTS = {
  TRANSLATION_SPEED: 0.01,
  ROTATION_SPEED: 0.01,
  VR_MOVEMENT_SPEED: 0.05,
  MIN_CAMERA_DISTANCE: 50,
  MAX_CAMERA_DISTANCE: 500,
  DEFAULT_FOV: 50,
  NEAR_PLANE: 0.1,
  FAR_PLANE: 2000,
  DEFAULT_CAMERA_POSITION: [0, 75, 200] as [number, number, number],
  DEFAULT_CAMERA_TARGET: [0, 0, 0] as [number, number, number],
  TARGET_FRAMERATE: 5, // Reduced to 5 FPS
  MIN_FRAME_TIME: 200, // Increased to 200ms for 5 FPS
  POSITION_UPDATE_INTERVAL: 200, // Increased to 200ms (5 FPS)
  FORCE_DIRECTED_CLIENT: false // Force-directed graph permanently disabled
};

export const SCENE_SETTINGS = {
  fogNear: 1,
  fogFar: 5,
  gridSize: 2,
  gridDivisions: 20
};

export const CAMERA_SETTINGS = {
  fov: 60,
  near: 0.01,
  far: 10000,
  position: new THREE.Vector3(0, 0.5, 2),
  target: new THREE.Vector3(0, 0, 0)
};

export const WEBGL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: false,
  preserveDrawingBuffer: true,
  xrCompatible: true
};

export const RENDERER_SETTINGS = {
  clearColor: 0x000000,
  clearAlpha: 1,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.5,
  outputColorSpace: THREE.SRGBColorSpace
};

export const LIGHT_SETTINGS = {
  ambient: {
    color: 0xffffff,
    intensity: 1.5
  },
  directional: {
    color: 0xffffff,
    intensity: 2.0,
    position: [10, 20, 10] as [number, number, number]
  },
  hemisphere: {
    skyColor: 0xffffff,
    groundColor: 0x444444,
    intensity: 1.5
  },
  points: [
    {
      color: 0xffffff,
      intensity: 1.0,
      distance: 300,
      position: [100, 100, 100] as [number, number, number]
    },
    {
      color: 0xffffff,
      intensity: 1.0,
      distance: 300,
      position: [-100, -100, -100] as [number, number, number]
    }
  ]
};

export const CONTROLS_SETTINGS = {
  enableDamping: true,
  dampingFactor: 0.1,
  rotateSpeed: 0.4,
  panSpeed: 0.6,
  zoomSpeed: 1.2,
  minDistance: 50,
  maxDistance: 500
};