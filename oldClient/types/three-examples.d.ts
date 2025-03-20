declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, EventDispatcher } from 'three';
  export class OrbitControls extends EventDispatcher {
    constructor(camera: Camera, domElement?: HTMLElement);
    enabled: boolean;
    enableDamping: boolean;
    dampingFactor: number;
    screenSpacePanning: boolean;
    minDistance: number;
    maxDistance: number;
    enableRotate: boolean;
    enableZoom: boolean;
    enablePan: boolean;
    rotateSpeed: number;
    zoomSpeed: number;
    panSpeed: number;
    update(): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/postprocessing/EffectComposer' {
  import { WebGLRenderer, WebGLRenderTarget } from 'three';
  export class EffectComposer {
    constructor(renderer: WebGLRenderer);
    renderTarget1: WebGLRenderTarget;
    renderTarget2: WebGLRenderTarget;
    passes: any[];
    addPass(pass: any): void;
    render(): void;
    setSize(width: number, height: number): void;
  }
}

declare module 'three/examples/jsm/postprocessing/RenderPass' {
  import { Scene, Camera } from 'three';
  export class RenderPass {
    constructor(scene: Scene, camera: Camera);
  }
}

declare module 'three/examples/jsm/postprocessing/UnrealBloomPass' {
  import { Vector2 } from 'three';
  export class UnrealBloomPass {
    constructor(resolution: Vector2, strength: number, radius: number, threshold: number);
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
    resolution: Vector2;
  }
}

declare module 'three/examples/jsm/geometries/TextGeometry.js' {
  import { BufferGeometry, Vector3, Box3 } from 'three';
  export class TextGeometry extends BufferGeometry {
    constructor(text: string, parameters: TextGeometryParameters);
    boundingBox: Box3 | null;
    computeBoundingBox(): void;
  }
  
  export interface TextGeometryParameters {
    font: any;
    size?: number;
    depth?: number;
    curveSegments?: number;
    bevelEnabled?: boolean;
  }
}

declare module 'three/examples/jsm/loaders/FontLoader.js' {
  import { Loader } from 'three';
  export class FontLoader extends Loader {
    constructor();
    load(url: string, onLoad?: (font: Font) => void, onProgress?: (event: ProgressEvent) => void, onError?: (event: ErrorEvent) => void): void;
  }
  export class Font {
    constructor(data: any);
  }
}

declare module 'three/examples/jsm/webxr/XRControllerModelFactory' {
  import { Group } from 'three';
  export class XRControllerModelFactory {
    constructor();
    createControllerModel(controller: Group): Group;
  }
}