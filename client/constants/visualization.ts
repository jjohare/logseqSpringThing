import * as THREE from 'three';

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
  DEFAULT_CAMERA_TARGET: [0, 0, 0] as [number, number, number]
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
