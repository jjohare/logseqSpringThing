import { Texture, BufferGeometry, BufferAttribute, Camera, Scene, WebGLRenderer, Object3D, Material, Vector2 } from 'three';

declare module 'three' {
    export const NearestFilter: TextureFilter;
    export const LinearFilter: TextureFilter;
    export const ClampToEdgeWrapping: TextureWrapping;
    
    export type TextureFilter = number;
    export type TextureWrapping = number;
    
    export interface Texture {
        minFilter: TextureFilter;
        magFilter: TextureFilter;
        wrapS: TextureWrapping;
        wrapT: TextureWrapping;
    }
    
    export interface BufferGeometry {
        getAttribute(name: string): BufferAttribute;
    }
    
    export interface Color {
        toArray(array?: number[], offset?: number): number[];
    }
    
    export interface PlaneGeometry extends BufferGeometry {
        getAttribute(name: string): BufferAttribute;
    }

    // OrbitControls
    export class OrbitControls {
        constructor(camera: Camera, domElement: HTMLElement);
        enabled: boolean;
        target: Vector3;
        minDistance: number;
        maxDistance: number;
        enableDamping: boolean;
        dampingFactor: number;
        update(): void;
        dispose(): void;
    }

    // Effect Composer
    export class EffectComposer {
        constructor(renderer: WebGLRenderer);
        addPass(pass: Pass): void;
        render(deltaTime?: number): void;
        setSize(width: number, height: number): void;
        dispose(): void;
    }

    export class Pass {
        enabled: boolean;
        needsSwap: boolean;
        clear: boolean;
        renderToScreen: boolean;
    }

    export class RenderPass extends Pass {
        constructor(scene: Scene, camera: Camera);
    }

    export class UnrealBloomPass extends Pass {
        constructor(resolution: Vector2, strength: number, radius: number, threshold: number);
        strength: number;
        radius: number;
        threshold: number;
        resolution: Vector2;
    }

    // XR Controller Model Factory
    export class XRControllerModelFactory {
        constructor();
        createControllerModel(controller: Object3D): Object3D;
    }

    // Grip Space
    export interface Group {
        grip?: Object3D;
    }

    // WebXR Manager
    export interface WebGLRenderer {
        xr: {
            enabled: boolean;
            isPresenting: boolean;
            setReferenceSpaceType(type: string): void;
            setSession(session: any): Promise<void>;
            getCamera(): Camera;
        };
    }
}

// Declare modules for examples
declare module 'three/examples/jsm/controls/OrbitControls' {
    export { OrbitControls } from 'three';
}

declare module 'three/examples/jsm/postprocessing/EffectComposer' {
    export { EffectComposer } from 'three';
}

declare module 'three/examples/jsm/postprocessing/RenderPass' {
    export { RenderPass } from 'three';
}

declare module 'three/examples/jsm/postprocessing/UnrealBloomPass' {
    export { UnrealBloomPass } from 'three';
}

declare module 'three/examples/jsm/webxr/XRControllerModelFactory' {
    export { XRControllerModelFactory } from 'three';
}
