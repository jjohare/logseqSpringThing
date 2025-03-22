// This file extends the THREE namespace with all the types and properties
// that are needed but not properly exported in the @types/three package

import * as ThreeOriginal from 'three';

declare module 'three' {
  // Re-export all original THREE types
  export * from 'three';

  // Core Three.js objects
  export class Vector2 extends ThreeOriginal.Vector2 {}
  export class Vector3 extends ThreeOriginal.Vector3 {}
  export class Color extends ThreeOriginal.Color {}
  export class Quaternion extends ThreeOriginal.Quaternion {}
  export class Matrix4 extends ThreeOriginal.Matrix4 {}
  export class Group extends ThreeOriginal.Group {}
  export class Line extends ThreeOriginal.Line {}
  export class InstancedMesh extends ThreeOriginal.InstancedMesh {}
  export class Raycaster extends ThreeOriginal.Raycaster {
    near: number;
    far: number;
    params: {
      Line?: { threshold: number };
      Points?: { threshold: number };
      [key: string]: any;
    };
    ray: {
      origin: Vector3;
      direction: Vector3;
    };
    intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[];
  }
  export class Material extends ThreeOriginal.Material {}
  export class BufferGeometry extends ThreeOriginal.BufferGeometry {}
  export class Object3D extends ThreeOriginal.Object3D {}

  // Geometries
  export class SphereGeometry extends ThreeOriginal.SphereGeometry {}
  export class BoxGeometry extends ThreeOriginal.BoxGeometry {}
  export class PlaneGeometry extends ThreeOriginal.PlaneGeometry {}

  // Materials
  export class MeshStandardMaterial extends ThreeOriginal.MeshStandardMaterial {}
  export class MeshBasicMaterial extends ThreeOriginal.MeshBasicMaterial {}
  export class MeshPhysicalMaterial extends ThreeOriginal.MeshPhysicalMaterial {}
  export class LineBasicMaterial extends ThreeOriginal.LineBasicMaterial {}

  // Lights
  export class AmbientLight extends ThreeOriginal.AmbientLight {}
  export class DirectionalLight extends ThreeOriginal.DirectionalLight {}
  export class PointLight extends ThreeOriginal.PointLight {}

  // Cameras
  export class PerspectiveCamera extends ThreeOriginal.PerspectiveCamera {}
  export class OrthographicCamera extends ThreeOriginal.OrthographicCamera {}

  // WebGLRenderer with XR support
  export interface WebGLRenderer extends ThreeOriginal.WebGLRenderer {
    xr: {
      enabled: boolean;
      setReferenceSpaceType: (type: string) => void;
      getCamera: (camera: Camera) => Camera;
      getReferenceSpace: () => any;
      getSession: () => any;
      isPresenting: boolean;
    };
    setClearColor: (color: Color | string | number, alpha?: number) => void;
  }

  // Constants
  export const FrontSide: number;
  export const BackSide: number;
  export const DoubleSide: number;

  // Interfaces
  export interface XRTargetRaySpace extends Object3D {}
  
  export interface Intersection {
    distance: number;
    point: Vector3;
    object: Object3D;
    face?: any;
    uv?: any;
    instanceId?: number;
  }
  
  // Ensure the namespace includes all these types
  export namespace THREE {
    export type Vector2 = ThreeOriginal.Vector2;
    export type Vector3 = ThreeOriginal.Vector3;
    export type Color = ThreeOriginal.Color;
    export type Quaternion = ThreeOriginal.Quaternion;
    export type Matrix4 = ThreeOriginal.Matrix4;
    export type Group = ThreeOriginal.Group;
    export type Line = ThreeOriginal.Line;
    export type InstancedMesh = ThreeOriginal.InstancedMesh;
    export type Raycaster = ThreeOriginal.Raycaster;
    export type Material = ThreeOriginal.Material;
    export type Object3D = ThreeOriginal.Object3D;
    export type BufferGeometry = ThreeOriginal.BufferGeometry;
    export type SphereGeometry = ThreeOriginal.SphereGeometry;
    export type BoxGeometry = ThreeOriginal.BoxGeometry;
    export type PlaneGeometry = ThreeOriginal.PlaneGeometry;
    export type MeshStandardMaterial = ThreeOriginal.MeshStandardMaterial;
    export type MeshBasicMaterial = ThreeOriginal.MeshBasicMaterial;
    export type MeshPhysicalMaterial = ThreeOriginal.MeshPhysicalMaterial;
    export type LineBasicMaterial = ThreeOriginal.LineBasicMaterial;
    export type AmbientLight = ThreeOriginal.AmbientLight;
    export type DirectionalLight = ThreeOriginal.DirectionalLight;
    export type PointLight = ThreeOriginal.PointLight;
    export type PerspectiveCamera = ThreeOriginal.PerspectiveCamera;
    export type OrthographicCamera = ThreeOriginal.OrthographicCamera;
    export type WebGLRenderer = ThreeOriginal.WebGLRenderer;
    export type XRTargetRaySpace = XRTargetRaySpace;
    export const FrontSide: typeof ThreeOriginal.FrontSide;
    export const BackSide: typeof ThreeOriginal.BackSide;
    export const DoubleSide: typeof ThreeOriginal.DoubleSide;
  }
}