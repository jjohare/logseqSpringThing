import type { Settings, LabelSettings } from '../types/settings';
import { settingsManager } from '../state/settings';
import { createLogger } from '../core/logger';
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
            logger.error(`Error handling setting change for ${setting}:`, error);
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
        const padding = 10;
        context.font = `${fontSize}px Arial`;
        const textMetrics = context.measureText(text);
        canvas.width = textMetrics.width + padding * 2;
        canvas.height = fontSize + padding * 2;

        // Draw background (optional, for better visibility)
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw text
        context.font = `${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = this.settings.textColor;
        context.strokeStyle = 'rgba(0, 0, 0, 0.5)';  // Add outline for better visibility
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
        sprite.scale.set(canvas.width / fontSize, canvas.height / fontSize, 1);

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

    public updateLabel(id: string, text: string, position: Vector3): void {
        try {
            let state = this.labelStates.get(id);
            if (!state) {
                state = {
                    text,
                    position: position.clone(),
                    visible: true
                };
                this.labelStates.set(id, state);
            } else {
                state.text = text;
                state.position.copy(position);
            }

            // Remove old sprite if it exists
            if (state.sprite) {
                this.group.remove(state.sprite);
                state.sprite.material.dispose();
                state.sprite.material.map?.dispose();
                state.texture?.dispose();
            }

            // Create new sprite
            state.sprite = this.createTextSprite(text, this.settings.desktopFontSize);
            state.sprite.position.copy(position);
            this.group.add(state.sprite);
        } catch (error) {
            logger.error('Error updating label:', error);
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
            logger.error('Error removing label:', error);
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
                    state.sprite.quaternion.copy(this.camera.quaternion);
                }
            });
        } catch (error) {
            logger.error('Error updating labels:', error);
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
            logger.error('Error disposing TextRenderer:', error);
        }
    }

    public handleSettingsUpdate(settings: LabelSettings): void {
        this.settings = settings;
        this.updateLabelVisibility(settings.enableLabels);
        this.updateFontSize(settings.desktopFontSize);
        this.updateTextColor(settings.textColor);
    }
}
