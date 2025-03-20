import { SettingControl } from './types'

// Configuration for the settings panel
// This is a direct adaptation of the existing controlPanelConfig.ts

// Define the category types
interface SettingsCategory {
  title: string
  settings: Record<string, SettingControl | Record<string, SettingControl>>
  advanced: boolean
}

// Format a setting name for display (convert camelCase to Title Case)
export function formatSettingName(name: string): string {
  // Handle special case acronyms (e.g., "XR" should remain uppercase)
  if (name === 'xr') return 'XR';
  
  // Replace camelCase with spaces
  const spacedName = name.replace(/([A-Z])/g, ' $1').trim();
  
  // Capitalize first letter of each word
  return spacedName.charAt(0).toUpperCase() + spacedName.slice(1);
}

// Define the settings configuration
export const settingsConfig: Record<string, SettingsCategory> = {
  visualization: {
    title: 'Visualization',
    advanced: false,
    settings: {
      nodes: {
        baseColor: { label: 'Base Color', type: 'color', tooltip: 'The base color of the nodes.' },
        metalness: { label: 'Metalness', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The metalness of the nodes.' },
        opacity: { label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The opacity of the nodes.' },
        roughness: { label: 'Roughness', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The roughness of the nodes.' },
        sizeRange: { label: 'Size Range', type: 'text', tooltip: 'Min and max size of the nodes (e.g., "200.0, 700.0").' },
        quality: { label: 'Quality', type: 'select', options: ['low', 'medium', 'high'], tooltip: 'The quality level of the node geometry.' },
        enableInstancing: { label: 'Enable Instancing', type: 'toggle', tooltip: 'Enable instanced rendering for improved performance.' },
        enableHologram: { label: 'Enable Hologram', type: 'toggle', tooltip: 'Enable the hologram effect around nodes.' },
        enableMetadataShape: { label: 'Enable Metadata Shape', type: 'toggle', tooltip: 'Enable a shape based on node metadata.' },
        enableMetadataVisualization: { label: 'Enable Metadata Visualization', type: 'toggle', tooltip: 'Enable visualization of node metadata.' },
      },
      edges: {
        arrowSize: { label: 'Arrow Size', type: 'number', min: 0, tooltip: 'The size of the arrowheads on edges.' },
        baseWidth: { label: 'Base Width', type: 'number', min: 0, tooltip: 'The base width of the edges.' },
        color: { label: 'Color', type: 'color', tooltip: 'The color of the edges.' },
        enableArrows: { label: 'Enable Arrows', type: 'toggle', tooltip: 'Enable arrowheads on edges.' },
        opacity: { label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The opacity of the edges.' },
        widthRange: { label: 'Width Range', type: 'text', tooltip: 'Min and max width of the edges (e.g., "2.0, 3.0").' },
        quality: { label: 'Quality', type: 'select', options: ['low', 'medium', 'high'], tooltip: 'The quality level of the edge geometry.' },
        enableFlowEffect: { label: 'Flow Effect', type: 'toggle', tooltip: 'Enable flowing animation on edges.' },
        flowSpeed: { label: 'Flow Speed', type: 'slider', min: 0, max: 2, step: 0.1, tooltip: 'Speed of the flow animation.' },
        flowIntensity: { label: 'Flow Intensity', type: 'slider', min: 0, max: 1, step: 0.1, tooltip: 'Intensity of the flow effect.' },
        glowStrength: { label: 'Glow Strength', type: 'slider', min: 0, max: 1, step: 0.1, tooltip: 'Strength of the edge glow effect.' },
        distanceIntensity: { label: 'Distance Intensity', type: 'slider', min: 0, max: 1, step: 0.1, tooltip: 'How edge appearance changes with distance.' },
        useGradient: { label: 'Use Gradient', type: 'toggle', tooltip: 'Enable gradient coloring on edges.' },
        gradientColors: { label: 'Gradient Colors', type: 'text', tooltip: 'Start and end colors for the gradient (e.g., "#ff0000, #00ff00").' },
      },
      labels: {
        desktopFontSize: { label: 'Font Size', type: 'number', min: 1, tooltip: 'The font size for labels on desktop.' },
        enableLabels: { label: 'Enable Labels', type: 'toggle', tooltip: 'Enable/disable node labels.' },
        textColor: { label: 'Text Color', type: 'color', tooltip: 'The color of the label text.' },
        textOutlineColor: { label: 'Outline Color', type: 'color', tooltip: 'The color of the label text outline.' },
        textOutlineWidth: { label: 'Outline Width', type: 'number', min: 0, tooltip: 'The width of the label text outline.' },
        textResolution: { label: 'Resolution', type: 'number', min: 1, tooltip: 'The resolution of the label text.' },
        textPadding: { label: 'Padding', type: 'number', min: 0, tooltip: 'Padding around label text.' },
        billboardMode: { label: 'Billboard Mode', type: 'select', options: ['camera', 'vertical'], tooltip: 'Orientation of labels.' },
      },
      bloom: {
        edgeBloomStrength: { label: 'Edge Bloom', type: 'slider', min: 0, max: 5, step: 0.1, tooltip: 'The strength of the bloom effect on edges.' },
        enabled: { label: 'Enable Bloom', type: 'toggle', tooltip: 'Enable/disable the bloom effect.' },
        environmentBloomStrength: { label: 'Environment Bloom', type: 'slider', min: 0, max: 5, step: 0.1, tooltip: 'The strength of the bloom effect on the environment.' },
        nodeBloomStrength: { label: 'Node Bloom', type: 'slider', min: 0, max: 5, step: 0.1, tooltip: 'The strength of the bloom effect on nodes.' },
        radius: { label: 'Radius', type: 'slider', min: 0, max: 5, step: 0.1, tooltip: 'The radius of the bloom effect.' },
        strength: { label: 'Strength', type: 'slider', min: 0, max: 5, step: 0.1, tooltip: 'The overall strength of the bloom effect.' },
        threshold: { label: 'Threshold', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The brightness threshold for the bloom effect.' },
      },
      animations: {
        enableMotionBlur: { label: 'Motion Blur', type: 'toggle', tooltip: 'Enable motion blur for smoother animations.' },
        enableNodeAnimations: { label: 'Node Animations', type: 'toggle', tooltip: 'Enable animations on the nodes.' },
        motionBlurStrength: { label: 'Motion Blur Strength', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The strength of the motion blur effect.' },
        selectionWaveEnabled: { label: "Selection Wave", type: "toggle", tooltip: 'Enable wave effect on node selection.' },
        pulseEnabled: { label: "Pulse", type: "toggle", tooltip: 'Enable node pulsing.' },
        pulseSpeed: { label: "Pulse Speed", type: 'slider', min: 0, max: 2, step: 0.1, tooltip: 'Speed of node pulsing.' },
        pulseStrength: { label: "Pulse Strength", type: 'slider', min: 0, max: 1, step: 0.1, tooltip: 'Strength of node pulsing.' },
        waveSpeed: { label: "Wave Speed", type: 'slider', min: 0, max: 2, step: 0.1, tooltip: 'Speed of the selection wave.' },
      },
      hologram: {
        ringCount: { label: 'Ring Count', type: 'number', min: 0, tooltip: 'The number of rings in the hologram effect.' },
        ringColor: { label: 'Ring Color', type: 'color', tooltip: 'The color of the hologram rings.' },
        ringOpacity: { label: 'Ring Opacity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The opacity of the hologram rings.' },
        sphereSizes: { label: 'Sphere Sizes', type: 'text', tooltip: 'Sizes of the hologram spheres (e.g., "40.0, 80.0").' },
        ringRotationSpeed: { label: 'Ring Speed', type: 'number', min: 0, tooltip: 'The rotation speed of the hologram rings.' },
        enableBuckminster: { label: 'Buckminster', type: 'toggle', tooltip: 'Enable the Buckminsterfullerene hologram effect.' },
        buckminsterSize: { label: 'Buckminster Size', type: 'number', min: 0, tooltip: 'The size of the Buckminsterfullerene hologram.' },
        buckminsterOpacity: { label: 'Buckminster Opacity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The opacity of the Buckminsterfullerene hologram.' },
        enableGeodesic: { label: 'Geodesic', type: 'toggle', tooltip: 'Enable the geodesic sphere hologram effect.' },
        geodesicSize: { label: 'Geodesic Size', type: 'number', min: 0, tooltip: 'The size of the geodesic sphere hologram.' },
        geodesicOpacity: { label: 'Geodesic Opacity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The opacity of the geodesic sphere hologram.' },
        enableTriangleSphere: { label: 'Triangle Sphere', type: 'toggle', tooltip: 'Enable the triangle sphere hologram effect.' },
        triangleSphereSize: { label: 'Triangle Size', type: 'number', min: 0, tooltip: 'The size of the triangle sphere hologram.' },
        triangleSphereOpacity: { label: 'Triangle Opacity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The opacity of the triangle sphere hologram.' },
        globalRotationSpeed: { label: 'Global Speed', type: 'number', min: 0, tooltip: 'The global rotation speed of the hologram.' },
      },
    },
  },
  physics: {
    title: 'Physics',
    advanced: true,
    settings: {
      attractionStrength: { label: 'Attraction Strength', type: 'slider', min: 0, max: 0.1, step: 0.001, tooltip: 'The strength of the attraction force between connected nodes.' },
      boundsSize: { label: 'Bounds Size', type: 'number', min: 0, tooltip: 'The size of the bounding box that contains the nodes.' },
      collisionRadius: { label: 'Collision Radius', type: 'number', min: 0, tooltip: 'The radius within which nodes will collide.' },
      damping: { label: 'Damping', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The damping factor that slows down node movement.' },
      enableBounds: { label: 'Enable Bounds', type: 'toggle', tooltip: 'Enable a bounding box to contain the nodes.' },
      enabled: { label: 'Enabled', type: 'toggle', tooltip: 'Enable/disable the physics simulation.' },
      iterations: { label: 'Iterations', type: 'number', min: 1, tooltip: 'The number of physics simulation iterations per frame.' },
      maxVelocity: { label: 'Max Velocity', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The maximum velocity of the nodes.' },
      repulsionStrength: { label: 'Repulsion Strength', type: 'number', min: 0, tooltip: 'The strength of the repulsion force between nodes.' },
      springStrength: { label: 'Spring Strength', type: 'slider', min: 0, max: 0.1, step: 0.001, tooltip: 'The strength of the spring force that keeps connected nodes together.' },
      repulsionDistance: { label: 'Repulsion Distance', type: 'slider', min: 0, max: 100, step: 0.1, tooltip: 'The distance at which nodes start repelling each other.' },
      massScale: { label: 'Mass Scale', type: 'slider', min: 0, max: 10, step: 0.1, tooltip: 'Scales the mass of nodes, affecting their inertia.' },
      boundaryDamping: { label: 'Boundary Damping', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'Damping factor applied when nodes hit the boundary.' },
    },
  },
  rendering: {
    title: 'Rendering',
    advanced: true,
    settings: {
      ambientLightIntensity: { label: 'Ambient Light', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The intensity of the ambient light.' },
      backgroundColor: { label: 'Background Color', type: 'color', tooltip: 'The background color of the scene.' },
      directionalLightIntensity: { label: 'Directional Light', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The intensity of the directional light.' },
      enableAmbientOcclusion: { label: 'Ambient Occlusion', type: 'toggle', tooltip: 'Enable ambient occlusion for more realistic shadows.' },
      enableAntialiasing: { label: 'Antialiasing', type: 'toggle', tooltip: 'Enable antialiasing for smoother edges.' },
      enableShadows: { label: 'Shadows', type: 'toggle', tooltip: 'Enable shadows (can be performance-intensive).' },
      environmentIntensity: { label: 'Environment Light', type: 'slider', min: 0, max: 1, step: 0.01, tooltip: 'The intensity of the environment lighting.' },
      shadowMapSize: { label: 'Shadow Map Size', type: 'select', options: ['1024', '2048', '4096'], tooltip: 'Resolution of shadow maps.' },
      shadowBias: { label: 'Shadow Bias', type: 'slider', min: -0.01, max: 0.01, step: 0.0001, tooltip: 'Bias value to prevent shadow acne.' },
      context: { label: 'Context', type: 'select', options: ['desktop', 'ar'], tooltip: 'Rendering context (desktop or AR).' },
    },
  },
  system: {
    title: 'System',
    advanced: true,
    settings: {
      websocket: {
        reconnectAttempts: { label: 'Reconnect Attempts', type: 'number', min: 0, tooltip: 'Number of reconnection attempts.' },
        reconnectDelay: { label: 'Reconnect Delay', type: 'number', min: 1000, tooltip: 'Delay between reconnection attempts (ms).' },
        binaryChunkSize: { label: 'Binary Chunk Size', type: 'number', min: 1, tooltip: 'Size of binary message chunks.' },
        compressionEnabled: { label: 'Enable Compression', type: 'toggle', tooltip: 'Enable WebSocket message compression.' },
        compressionThreshold: { label: 'Compression Threshold', type: 'number', min: 0, tooltip: 'Message size threshold for compression.' },
        updateRate: { label: 'Update Rate', type: 'number', min: 1, tooltip: 'Rate of WebSocket updates (Hz).' },
      },
      debug: {
        enabled: { label: 'Enable Debug', type: 'toggle', tooltip: 'Enable debug mode.' },
        enableDataDebug: { label: 'Data Debug', type: 'toggle', tooltip: 'Enable data debugging.' },
        enableWebsocketDebug: { label: 'WebSocket Debug', type: 'toggle', tooltip: 'Enable WebSocket debugging.' },
        logBinaryHeaders: { label: 'Log Binary Headers', type: 'toggle', tooltip: 'Log binary message headers.' },
        logFullJson: { label: 'Log Full JSON', type: 'toggle', tooltip: 'Log complete JSON messages.' },
        enablePhysicsDebug: { label: 'Physics Debug', type: 'toggle', tooltip: 'Enable physics/force calculations debugging.' },
        enableNodeDebug: { label: 'Node Debug', type: 'toggle', tooltip: 'Enable node position/velocity tracking.' },
        enableShaderDebug: { label: 'Shader Debug', type: 'toggle', tooltip: 'Enable shader compilation/linking debugging.' },
        enableMatrixDebug: { label: 'Matrix Debug', type: 'toggle', tooltip: 'Enable matrix transformations debugging.' },
        enablePerformanceDebug: { label: 'Performance Debug', type: 'toggle', tooltip: 'Enable performance monitoring.' },
      },
    },
  },
  xr: {
    title: 'XR',
    advanced: false,
    settings: {
      enabled: { label: 'Enable XR', type: 'toggle', tooltip: 'Enable/disable XR mode.' },
      handTracking: { label: 'Hand Tracking', type: 'toggle', tooltip: 'Enable hand tracking in XR.' },
      controllerModel: { label: 'Controller Model', type: 'select', options: ['default', 'hands', 'none'], tooltip: 'The controller model to use in XR.' },
      renderScale: { label: 'Render Scale', type: 'slider', min: 0.5, max: 2, step: 0.1, tooltip: 'The render scale in XR.' },
      interactionDistance: { label: 'Interaction Distance', type: 'slider', min: 0.1, max: 5, step: 0.1, tooltip: 'The maximum distance for interaction in XR.' },
      locomotionMethod: { label: 'Locomotion Method', type: 'select', options: ['teleport', 'continuous'], tooltip: 'The locomotion method in XR.' },
      teleportRayColor: { label: 'Teleport Ray Color', type: 'color', tooltip: 'The color of the teleport ray in XR.' },
      enableHaptics: { label: 'Enable Haptics', type: 'toggle', tooltip: 'Enable haptic feedback in XR.' },
      displayMode: { label: 'Display Mode', type: 'select', options: ['stereo', 'mono'], tooltip: 'The display mode in XR.' },
    },
  },
}