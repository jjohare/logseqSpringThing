import { Settings } from '@/lib/types/settings'

export const defaultSettings: Settings = {
  visualization: {
    nodes: {
      color: '#3e82f7',
      defaultSize: 500,
      minSize: 200,
      maxSize: 700,
      highlightColor: '#4f90ff',
      outlineWidth: 2,
      outlineColor: '#ffffff',
      selectedColor: '#ff9900',
    },
    edges: {
      width: 2,
      color: '#ffffff',
      highlightColor: '#4f90ff',
      opacity: 0.7,
      showLabels: false,
      arrowSize: 1,
      dashSize: 1,
      gapSize: 0.5,
    },
    physics: {
      enabled: true,
      attraction: 0.01, 
      repulsion: 5,
      damping: 0.9,
      friction: 0.9,
      gravity: 0,
      springLength: 100,
      iterations: 3,
    },
    rendering: {
      shadows: false,
      antialias: true,
      pixelRatio: 1,
      enableBloom: true,
      bloomStrength: 1.2,
      bloomThreshold: 0.4,
      bloomRadius: 0.8,
    },
    labels: {
      enabled: true,
      size: 14,
      color: '#ffffff',
      backgroundColor: '#000000',
      showDistance: 1000,
      fadeDistance: 2000,
    },
    bloom: {
      enabled: true,
      strength: 1.2,
      radius: 0.8,
      threshold: 0.4,
    },
    hologram: {
      color: '#3e82f7',
      opacity: 0.7,
      ringOpacity: 0.7,
      sphereSizes: [40, 80],
      enableTriangleSphere: false,
      triangleSphereSize: 100,
      triangleSphereOpacity: 0.5,
      ringRotationSpeed: 0.5,
      globalRotationSpeed: 0.5,
    },
  },
  system: {
    websocket: {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      protocol: 'json',
    },
    debug: {
      enabled: true,
      enableDataDebug: false,
      enableWebsocketDebug: false,
      logBinaryHeaders: false,
      logFullJson: false,
      showPerformance: false,
      showDataUpdates: false,
      logLevel: 'info',
    },
    persistSettings: true,
  },
  xr: {
    enabled: false,
    handInteraction: true,
    controllerModel: 'default',
    movementSpeed: 1.0,
    teleportEnabled: true,
    roomScale: true,
    showFloor: true,
  }
}