import * as THREE from 'three';

export interface XRHandWithHaptics {
    hand: {
        joints: {
            [key: string]: THREE.Object3D;
        };
    };
    hapticActuators: any[];
    pinchStrength: number;
    gripStrength: number;
}

export interface XRControllerState {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    hapticActuator?: any;
}

export interface XRHandState {
    position: THREE.Vector3;
    joints: Map<string, THREE.Object3D>;
    pinchStrength: number;
    gripStrength: number;
}
