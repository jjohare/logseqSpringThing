import type { Settings, LabelSettings } from '../types/settings';
import { settingsManager } from '../state/settings';
import { createLogger, createErrorMetadata } from '../core/logger';
import {
    Scene,
    Camera,
    Group,
    Sprite,
    SpriteMaterial,
    Vector3,
    Matrix4,
    Texture
} from 'three';
const logger = createLogger('TextRenderer');

interface LabelState {
    text: string;
    position: Vector3;
    visible: boolean;
    sprite?: Sprite;
    texture?: Texture;
}

export class TextRenderer {
    private camera: Camera;
    private labelStates: Map<string, LabelState>;
    private unsubscribers: Array<() => void> = [];
    private projMatrix: Matrix4;
    private viewMatrix: Matrix4;
    private currentSettings: Settings;
    private settings: LabelSettings;
    private group: Group;

    constructor(camera: Camera, scene: Scene) {
        this.camera = camera;
        this.labelStates = new Map();
        this.projMatrix = new Matrix4();
        this.viewMatrix = new Matrix4();
        this.currentSettings = settingsManager.getCurrentSettings();
        this.settings = this.currentSettings.visualization.labels;
        this.group = new Group();
        scene.add(this.group); // Add the group to the scene
        this.setupSettingsSubscriptions();
    }

    private setupSettingsSubscriptions(): void {
        Object.keys(this.currentSettings.visualization.labels).forEach(setting => {
            const path = `visualization.labels.${setting}`;
            const unsubscribe = settingsManager.subscribe(path, (value) => {
                this.handleSettingChange(setting as keyof LabelSettings, value);
            });
            this.unsubscribers.push(unsubscribe);
        });
    }

    private handleSettingChange(setting: keyof LabelSettings, value: any): void {
        try {
            switch (setting) {
                case 'desktopFontSize':
                    this.updateFontSize(value as number);
                    break;
                case 'textColor':
                    this.updateTextColor(value as string);
                    break;
                case 'enableLabels':
                    this.updateLabelVisibility(value as boolean);
                    break;
                default:
                    // Other settings handled elsewhere
                    break;
            }
        } catch (error) {
            logger.error(`Error handling setting change for ${setting}:`, createErrorMetadata(error));
        }
    }

    private updateFontSize(fontSize: number): void {
        this.labelStates.forEach((state) => {
            if (state.sprite) {
                // Remove old sprite
                this.group.remove(state.sprite);
                state.sprite.material.dispose();
                state.sprite.material.map?.dispose();
                state.texture?.dispose();

                // Create new sprite with updated font size
                state.sprite = this.createTextSprite(state.text, fontSize);
                state.sprite.position.copy(state.position);
                this.group.add(state.sprite);
            }
        });
    }

    private createTextSprite(text: string, fontSize: number): Sprite {
        // Create a canvas to render the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2D context');

        // Set canvas size
        const padding = this.settings.textPadding || 2;
        context.font = `${fontSize}px Arial`;
        const textMetrics = context.measureText(text);
        canvas.width = textMetrics.width + padding * 2;
        canvas.height = fontSize + padding * 2;

        // Draw text
        context.font = `${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Draw text outline if enabled
        if (this.settings.textOutlineWidth > 0) {
            context.strokeStyle = this.settings.textOutlineColor;
            context.lineWidth = this.settings.textOutlineWidth;
            context.strokeText(text, canvas.width / 2, canvas.height / 2);
        }
        
        // Draw text fill
        context.fillStyle = this.settings.textColor;
        context.lineWidth = 1;
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create sprite material
        const texture = new Texture(canvas);
        texture.needsUpdate = true;
        const material = new SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false // Ensure text is always visible
        });

        // Create sprite
        const sprite = new Sprite(material);
        // Disable frustum culling to ensure labels are visible regardless of position
        sprite.frustumCulled = false;
        
        // Scale based on text resolution
        const resolution = this.settings.textResolution || 16;
        const scale = resolution / fontSize;
        sprite.scale.set(
            (canvas.width / fontSize) * scale,
            (canvas.height / fontSize) * scale,
            1);

        return sprite;
    }

    private updateTextColor(newColor: string): void {
        this.settings.textColor = newColor;
        this.labelStates.forEach((state) => {
            if (state.sprite) {
                // Remove old sprite
                this.group.remove(state.sprite);
                state.sprite.material.dispose();
                state.sprite.material.map?.dispose();
                state.texture?.dispose();

                // Create new sprite with updated color
                state.sprite = this.createTextSprite(state.text, this.settings.desktopFontSize);
                state.sprite.position.copy(state.position);
                this.group.add(state.sprite);
            }
        });
    }

    private updateLabelVisibility(visible: boolean): void {
        this.group.visible = visible;
    }

    public updateLabel(id: string, text: string, position: Vector3, preserveText: boolean = false): void {
        try {
            let state = this.labelStates.get(id);
            
            // Skip processing if text is empty but preserveText is true and we already have a state
            if (text.trim() === '' && preserveText && state) {
                // Just update the position
                if (state.sprite) {
                    state.position.copy(position);
                    state.sprite.position.copy(position);
                }
                return;
            }

            if (!state) {
                state = {
                    text: text || '',
                    position: position.clone(),
                    visible: true
                };
                this.labelStates.set(id, state);
            } else if (text.trim() !== '') {
                // Only update text if non-empty text is provided
                state.text = text;
            }
            
            // Always update position
            state.position.copy(position);

            // Only recreate the sprite if:
            // 1. There's no sprite yet
            // 2. Text content has changed
            const recreateSprite = !state.sprite || 
                                 (text.trim() !== '' && text !== state.text);

            if (recreateSprite) {
                // Remove old sprite if it exists
                if (state.sprite) {
                    this.group.remove(state.sprite);
                    state.sprite.material.dispose();
                    state.sprite.material.map?.dispose();
                    state.texture?.dispose();
                }

                // Create new sprite only if we have text to render
                if (state.text.trim() !== '') {
                    state.sprite = this.createTextSprite(state.text, this.settings.desktopFontSize);
                    state.sprite.position.copy(position);
                    this.group.add(state.sprite);
                }
            } else if (state.sprite) {
                // Just update position if sprite exists
                state.sprite.position.copy(position);
            }
        } catch (error) {
            logger.error('Error updating label:', createErrorMetadata(error));
        }
    }

    public removeLabel(id: string): void {
        try {
            const state = this.labelStates.get(id);
            if (state?.sprite) {
                this.group.remove(state.sprite);
                state.sprite.material.dispose();
                state.sprite.material.map?.dispose();
                state.texture?.dispose();
            }
            this.labelStates.delete(id);
        } catch (error) {
            logger.error('Error removing label:', createErrorMetadata(error));
        }
    }

    private clearLabels(): void {
        this.labelStates.forEach((state) => {
            if (state.sprite) {
                this.group.remove(state.sprite);
                state.sprite.material.dispose();
                state.sprite.material.map?.dispose();
                state.texture?.dispose();
            }
        });
        this.labelStates.clear();
    }

    public update(): void {
        try {
            // Update projection and view matrices
            this.camera.updateMatrixWorld();
            this.projMatrix.copy(this.camera.projectionMatrix);
            this.viewMatrix.copy(this.camera.matrixWorldInverse);
            
            if (!this.settings.enableLabels) {
                this.group.visible = false;
                return;
            }
            
            this.group.visible = true;

            // Update label positions and visibility
            this.labelStates.forEach((state) => {
                if (state.sprite) {
                    state.sprite.position.copy(state.position);
                    // Make sprite face camera
                    if (this.settings.billboardMode === 'camera') {
                        // Full billboard - always face camera
                        state.sprite.quaternion.copy(this.camera.quaternion);
                        
                        // Ensure sprite is always visible regardless of camera position
                        if (!state.sprite.visible) {
                            state.sprite.visible = true;
                        }
                    } else {
                        // Vertical billboard - only rotate around Y axis
                        const tempVec = new Vector3().copy(this.camera.position).sub(state.position);
                        state.sprite.lookAt(tempVec.add(state.position));
                    }
                }
            });
        } catch (error) {
            logger.error('Error updating labels:', createErrorMetadata(error));
        }
    }

    public dispose(): void {
        try {
            this.clearLabels();
            this.unsubscribers.forEach(unsubscribe => unsubscribe());
            this.unsubscribers = [];
            if (this.group.parent) {
                this.group.parent.remove(this.group);
            }
        } catch (error) {
            logger.error('Error disposing TextRenderer:', createErrorMetadata(error));
        }
    }

    public handleSettingsUpdate(settings: LabelSettings): void {
        this.settings = settings;
        this.updateLabelVisibility(settings.enableLabels);
        this.updateFontSize(settings.desktopFontSize);
        this.updateTextColor(settings.textColor);
    }
}
