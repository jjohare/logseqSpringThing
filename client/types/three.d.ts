declare module 'three' {
  export interface Event {
    type: string;
    target: Group;
  }

  export interface XRControllerEvent extends Event {
    type: 'connected' | 'disconnected';
    target: Group;
    data: XRInputSource;
  }

  export interface Object3DEventMap {
    connected: XRControllerEvent;
    disconnected: XRControllerEvent;
  }

  export interface EventDispatcher<E extends Event = Event> {
    addEventListener<T extends E['type']>(type: T, listener: (event: E & { type: T }) => void): void;
    removeEventListener<T extends E['type']>(type: T, listener: (event: E & { type: T }) => void): void;
    dispatchEvent(event: E): void;
  }

  export class Layers {
    mask: number;
    set(layer: number): void;
    enable(layer: number): void;
    disable(layer: number): void;
    toggle(layer: number): void;
    test(layers: Layers): boolean;
  }

  export class Object3D implements EventDispatcher<Event & XRControllerEvent> {
    position: Vector3;
    quaternion: Quaternion;
    scale: Vector3;
    matrix: Matrix4;
    matrixWorld: Matrix4;
    children: Object3D[];
    parent: Object3D | null;
    userData: any;
    visible: boolean;
    renderOrder: number;
    frustumCulled: boolean;
    matrixAutoUpdate: boolean;
    layers: Layers;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    traverse(callback: (object: Object3D) => void): void;
    lookAt(x: number | Vector3, y?: number, z?: number): void;
    addEventListener<K extends keyof Object3DEventMap>(
      type: K,
      listener: (event: Object3DEventMap[K]) => void
    ): void;
    addEventListener(
      type: string,
      listener: (event: Event) => void
    ): void;
    removeEventListener<K extends keyof Object3DEventMap>(
      type: K,
      listener: (event: Object3DEventMap[K]) => void
    ): void;
    removeEventListener(
      type: string,
      listener: (event: Event) => void
    ): void;
    dispatchEvent(event: Event): void;
  }

  export class Group extends Object3D {
    constructor();
  }

  export class Scene extends Object3D {
    constructor();
    fog: FogExp2 | null;
    background: Color | Texture | null;
  }

  export class Material {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    depthTest: boolean;
    side: Side;
    color: Color;
    dispose(): void;
  }

  export class Mesh extends Object3D {
    constructor(geometry: BufferGeometry, material: Material);
    geometry: BufferGeometry;
    material: Material;
  }

  export class GridHelper extends Object3D {
    constructor(size: number, divisions: number, color1?: ColorRepresentation, color2?: ColorRepresentation);
    material: Material;
    geometry: BufferGeometry;
  }

  export class Light extends Object3D {
    constructor(color?: ColorRepresentation, intensity?: number);
    intensity: number;
  }

  export class DirectionalLight extends Light {
    constructor(color?: ColorRepresentation, intensity?: number);
    intensity: number;
  }

  export class AmbientLight extends Light {
    constructor(color?: ColorRepresentation, intensity?: number);
  }

  export class BufferAttribute {
    array: ArrayLike<number>;
    itemSize: number;
    count: number;
    normalized: boolean;
    needsUpdate: boolean;
    constructor(array: ArrayLike<number>, itemSize: number, normalized?: boolean);
    setX(index: number, x: number): this;
    setY(index: number, y: number): this;
    setZ(index: number, z: number): this;
    setW(index: number, w: number): this;
    setXY(index: number, x: number, y: number): this;
    setXYZ(index: number, x: number, y: number, z: number): this;
    setXYZW(index: number, x: number, y: number, z: number, w: number): this;
  }

  export class InstancedBufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number, normalized?: boolean, meshPerAttribute?: number);
    meshPerAttribute: number;
  }

  export class InstancedMesh extends Mesh {
    constructor(geometry: BufferGeometry, material: Material | Material[], count: number);
    count: number;
    instanceMatrix: InstancedBufferAttribute;
    instanceColor: InstancedBufferAttribute | null;
    frustumCulled: boolean;
    setColorAt(index: number, color: Color): void;
    setMatrixAt(index: number, matrix: Matrix4): void;
    getMatrixAt(index: number, matrix: Matrix4): void;
    getColorAt(index: number, color: Color): void;
    dispose(): void;
  }

  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MeshBasicMaterialParameters);
  }

  export class LineBasicMaterial extends Material {
    constructor(parameters?: MaterialParameters);
  }

  export class MeshPhongMaterial extends Material {
    constructor(parameters?: MeshPhongMaterialParameters);
    shininess: number;
    specular: Color;
  }

  export class MeshStandardMaterial extends Material {
    constructor(parameters?: MeshStandardMaterialParameters);
    metalness: number;
    roughness: number;
    map: Texture | null;
    emissive: Color;
  }

  export class SpriteMaterial extends Material {
    constructor(parameters?: SpriteMaterialParameters);
    map: Texture | null;
    color: Color;
    sizeAttenuation: boolean;
    rotation: number;
  }

  export class BufferGeometry {
    dispose(): void;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    setAttribute(name: string, attribute: BufferAttribute): this;
    setIndex(index: BufferAttribute): this;
    computeBoundingSphere(): void;
    boundingSphere: { center: Vector3; radius: number } | null;
    boundingBox: { min: Vector3; max: Vector3 } | null;
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number);
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class CylinderGeometry extends BufferGeometry {
    constructor(
      radiusTop?: number,
      radiusBottom?: number,
      height?: number,
      radialSegments?: number
    );
  }

  export class RingGeometry extends BufferGeometry {
    constructor(
      innerRadius?: number,
      outerRadius?: number,
      thetaSegments?: number
    );
  }

  export class Vector2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
    set(x: number, y: number): this;
  }

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    multiply(v: Vector3): this;
    multiplyScalar(s: number): this;
    normalize(): this;
    dot(v: Vector3): number;
    cross(v: Vector3): this;
    length(): number;
    lengthSq(): number;
    clone(): Vector3;
    fromArray(array: number[] | ArrayLike<number>, offset?: number): this;
    subVectors(a: Vector3, b: Vector3): this;
    addVectors(a: Vector3, b: Vector3): this;
    crossVectors(a: Vector3, b: Vector3): this;
    setFromMatrixPosition(m: Matrix4): this;
    distanceTo(v: Vector3): number;
    applyMatrix4(m: Matrix4): this;
    lookAt(v: Vector3): this;
  }

  export class Matrix4 {
    elements: number[];
    constructor();
    set(...elements: number[]): this;
    identity(): this;
    copy(m: Matrix4): this;
    compose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    decompose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    extractRotation(m: Matrix4): this;
    makeRotationX(theta: number): this;
    makeRotationY(theta: number): this;
    makeRotationZ(theta: number): this;
    makeScale(x: number, y: number, z: number): this;
    multiply(m: Matrix4): this;
    makeRotationFromQuaternion(q: Quaternion): this;
  }

  export class Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(x?: number, y?: number, z?: number, w?: number);
    setFromAxisAngle(axis: Vector3, angle: number): this;
    identity(): this;
    multiply(q: Quaternion): this;
    setFromEuler(euler: Euler): this;
  }

  export class Euler {
    constructor(x?: number, y?: number, z?: number, order?: string);
    x: number;
    y: number;
    z: number;
    order: string;
  }

  export class Color {
    constructor(color?: ColorRepresentation);
    set(color: ColorRepresentation): this;
    setHSL(h: number, s: number, l: number): Color;
    clone(): Color;
  }

  export class Sprite extends Object3D {
    constructor(material: SpriteMaterial);
    material: SpriteMaterial;
  }

  export class Raycaster {
    constructor();
    ray: Ray;
    near: number;
    far: number;
    camera: Camera;
    params: {
      Mesh?: {},
      Line?: {},
      LOD?: {},
      Points?: { threshold: number },
      Sprite?: {}
    };
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObject(object: Object3D, recursive?: boolean, intersects?: Intersection[]): Intersection[];
    intersectObjects(objects: Object3D[], recursive?: boolean, intersects?: Intersection[]): Intersection[];
  }

  export class Ray {
    origin: Vector3;
    direction: Vector3;
    constructor(origin?: Vector3, direction?: Vector3);
  }

  export class WebGLRenderer {
    constructor(parameters?: WebGLRendererParameters);
    domElement: HTMLCanvasElement;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setPixelRatio(value: number): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
    xr: WebXRManager;
    setAnimationLoop(callback: ((time: number) => void) | null): void;
  }

  export interface WebXRManager {
    enabled: boolean;
    setSession(session: XRSession): Promise<void>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  export class Camera extends Object3D {
    matrixWorldInverse: Matrix4;
    projectionMatrix: Matrix4;
    projectionMatrixInverse: Matrix4;
    layers: Layers;
    lookAt(target: Vector3 | number, y?: number, z?: number): void;
  }

  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
    near: number;
    far: number;
    updateProjectionMatrix(): void;
    lookAt(target: Vector3 | number, y?: number, z?: number): void;
  }

  export interface MaterialParameters {
    color?: ColorRepresentation;
    transparent?: boolean;
    opacity?: number;
    side?: Side;
    depthWrite?: boolean;
    depthTest?: boolean;
    map?: Texture;
  }

  export interface MeshBasicMaterialParameters extends MaterialParameters {
    wireframe?: boolean;
  }

  export interface MeshPhongMaterialParameters extends MaterialParameters {
    shininess?: number;
    specular?: ColorRepresentation;
  }
  export interface MeshStandardMaterialParameters extends MaterialParameters {
    metalness?: number;
    roughness?: number;
    map?: Texture | null;
    emissive?: ColorRepresentation;
  }

  export interface SpriteMaterialParameters extends MaterialParameters {
    sizeAttenuation?: boolean;
    rotation?: number;
  }

  export class Texture {
    constructor(image?: HTMLImageElement | HTMLCanvasElement);
    needsUpdate: boolean;
    dispose(): void;
  }

  export class FogExp2 {
    constructor(color: ColorRepresentation, density?: number);
    color: Color;
    density: number;
  }

  export interface Intersection {
    distance: number;
    point: Vector3;
    face: { normal: Vector3 } | null;
    object: Object3D;
  }

  export class MathUtils {
    static clamp(value: number, min: number, max: number): number;
    static degToRad(degrees: number): number;
    static radToDeg(radians: number): number;
    static lerp(x: number, y: number, t: number): number;
    static smoothstep(x: number, min: number, max: number): number;
  }

  export const DoubleSide: Side;
  export type Side = 0 | 1 | 2;
  export type ColorRepresentation = Color | string | number;

  export class Clock {
    constructor(autoStart?: boolean);
    start(): void;
    stop(): void;
    getElapsedTime(): number;
    getDelta(): number;
  }

  export class TorusGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number, arc?: number);
  }

  export class IcosahedronGeometry extends BufferGeometry {
    constructor(radius?: number, detail?: number);
  }

  export class OctahedronGeometry extends BufferGeometry {
    constructor(radius?: number, detail?: number);
  }

  export class ShaderMaterial extends Material {
    constructor(parameters?: ShaderMaterialParameters);
    uniforms: { [uniform: string]: { value: any } };
    defines: { [define: string]: string | number | boolean };
    needsUpdate: boolean;
  }

  export interface Material {
    clone(): Material;
    uniforms?: { [uniform: string]: { value: any } };
    defines?: { [define: string]: string | number | boolean };
    needsUpdate: boolean;
  }

  export interface Vector3 {
    setScalar(scalar: number): Vector3;
    fromBufferAttribute(attribute: BufferAttribute, index: number): Vector3;
  }

  export interface Quaternion {
    copy(quaternion: Quaternion): Quaternion;
  }

  export interface Mesh extends Object3D {
    rotation: Euler;
    material: Material;
  }

  export interface Group extends Object3D {
    onBeforeRender?: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void;
  }

  export interface Color {
    setHSL(h: number, s: number, l: number): Color;
  }

  export interface XRHand extends Map<XRHandJoint, XRJointSpace> {
    joints: { [key: string]: XRJointSpace };
  }

  export const AdditiveBlending: number;
  export const NormalBlending: number;
  export const MultiplyBlending: number;

  export class TextGeometry extends BufferGeometry {
    constructor(text: string, parameters?: {
        font: Font;
        size?: number;
        height?: number;
        curveSegments?: number;
        bevelEnabled?: boolean;
        bevelThickness?: number;
        bevelSize?: number;
        bevelOffset?: number;
        bevelSegments?: number;
    });
    computeBoundingBox(): void;
    boundingBox: Box3 | null;
    dispose(): void;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    translate(x: number, y: number, z: number): this;
  }

  export class Box3 {
    min: Vector3;
    max: Vector3;
    constructor(min?: Vector3, max?: Vector3);
  }

  export interface XRJointSpace {
    position: Vector3;
    matrixWorld: Matrix4;
  }

  export interface XRHand extends Map<XRHandJoint, XRJointSpace> {
    joints: { [key: string]: XRJointSpace };
  }
}
