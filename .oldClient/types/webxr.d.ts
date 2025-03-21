/**
 * WebXR API type extensions
 */

declare module 'three' {
  interface Object3DEventMap {
    connected: XRControllerEvent;
    disconnected: XRControllerEvent;
  }
}

interface XRControllerEvent extends THREE.Event {
  type: 'connected' | 'disconnected';
  data: XRInputSource;
}

interface XRLightEstimate {
  primaryLightIntensity?: { value: number };
  primaryLightDirection?: { x: number; y: number; z: number };
}

// Extend existing WebXR types
declare global {
  interface XRFrame {
    // Make getLightEstimate optional
    getLightEstimate?(): XRLightEstimate | null;
    getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[];
    getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null;
    getPose(space: XRSpace, baseSpace: XRReferenceSpace): XRPose | null;
  }

  interface XRSession {
    requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
    // Make requestHitTestSource non-optional
    requestHitTestSource(options: XRHitTestOptionsInit): Promise<XRHitTestSource>;
    end(): Promise<void>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface XRHitTestOptionsInit {
    space: XRSpace;
    offsetRay?: XRRay;
  }

  interface XRHitTestSource {
    cancel(): void;
  }

  interface XRHitTestResult {
    getPose(baseSpace: XRSpace): XRPose | null;
  }

  interface XRPose {
    transform: XRRigidTransform;
  }

  interface XRViewerPose extends XRPose {
    views: XRView[];
  }

  interface XRView {
    projectionMatrix: Float32Array;
    transform: XRRigidTransform;
  }

  interface XRRigidTransform {
    matrix: Float32Array;
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  }

  interface XRReferenceSpace extends XRSpace {
    getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace;
  }

  interface XRSpace {}

  interface XRRay {
    origin: DOMPointReadOnly;
    direction: DOMPointReadOnly;
    matrix: Float32Array;
  }

  type XRReferenceSpaceType = 
    | 'viewer'
    | 'local'
    | 'local-floor'
    | 'bounded-floor'
    | 'unbounded';

  interface XRInputSource {
    handedness: 'none' | 'left' | 'right';
    targetRayMode: 'gaze' | 'tracked-pointer' | 'screen';
    targetRaySpace: XRSpace;
    gripSpace?: XRSpace;
    profiles: string[];
    gamepad?: Gamepad;
    hand?: XRHand;
  }

  interface XRHand extends Map<XRHandJoint, XRJointSpace> {
    get(joint: XRHandJoint): XRJointSpace | undefined;
  }

  export type XRHandJoint =
    | 'wrist'
    | 'thumb-metacarpal'
    | 'thumb-phalanx-proximal'
    | 'thumb-phalanx-distal'
    | 'thumb-tip'
    | 'index-finger-metacarpal'
    | 'index-finger-phalanx-proximal'
    | 'index-finger-phalanx-intermediate'
    | 'index-finger-phalanx-distal'
    | 'index-finger-tip';

  export interface XRJointSpace extends XRSpace {
    jointRadius: number | undefined;
    position: { x: number; y: number; z: number };
    matrixWorld: THREE.Matrix4;
  }

  interface Navigator {
    xr?: {
      isSessionSupported(mode: string): Promise<boolean>;
      requestSession(mode: string, options?: XRSessionInit): Promise<XRSession>;
    };
  }

  interface XRSessionInit {
    requiredFeatures?: string[];
    optionalFeatures?: string[];
  }
}

// Prevent conflicts with @types/webxr
declare module '@types/webxr' {
  export {};
}
