import { SettingsStore } from '../state/SettingsStore';
import { formatSettingName } from '../types/settings/utils';
import { createLogger, createErrorMetadata } from '../core/logger';
import { platformManager } from '../platform/platformManager';
import { nostrAuth } from '../services/NostrAuthService';
import { EventEmitter } from '../utils/eventEmitter';
import { settingsMap, SettingControl } from './controlPanelConfig';
import { ValidationErrorDisplay } from '../components/settings/ValidationErrorDisplay';
import './ModularControlPanel.css';
import { VisualizationController } from '../rendering/VisualizationController';

const logger = createLogger('ModularControlPanel');

interface SectionConfig {
    id: string;
    title: string;
    isDetached: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    isCollapsed: boolean;
    isAdvanced: boolean;
}

export interface ModularControlPanelEvents {
    'settings:ready': null;
    'settings:updated': { path: string; value: any };
}

export class ModularControlPanel extends EventEmitter<ModularControlPanelEvents> {
    private static instance: ModularControlPanel | null = null;
    private readonly container: HTMLDivElement;
    private readonly toggleButton: HTMLButtonElement;
    private readonly settingsStore: SettingsStore;
    private readonly validationDisplay: ValidationErrorDisplay;
    private readonly unsubscribers: Array<() => void> = [];
    private readonly sections: Map<string, SectionConfig> = new Map();
    private updateTimeout: number | null = null;
    private isInitialized: boolean = false;

    private constructor(parentElement: HTMLElement) {
        super();
        this.settingsStore = SettingsStore.getInstance();
        
        // Create toggle button first
        this.toggleButton = document.createElement('button');
        this.toggleButton.className = 'panel-toggle-btn';
        this.toggleButton.innerHTML = '⚙️';
        this.toggleButton.onclick = () => this.toggle();
        parentElement.appendChild(this.toggleButton);

        // Create main container
        const existingContainer = document.getElementById('control-panel');
        if (!existingContainer) {
            throw new Error('Could not find #control-panel element');
        }
        this.container = existingContainer as HTMLDivElement;
        this.container.innerHTML = ''; // Clear existing content

        // Initialize validation error display
        this.validationDisplay = new ValidationErrorDisplay(this.container);

        // Set initial visibility based on platform
        this.updateVisibilityForPlatform();

        // Listen for platform changes
        platformManager.on('platformchange', () => {
            this.updateVisibilityForPlatform();
        });
        platformManager.on('xrmodechange', (isXRMode: boolean) => {
            isXRMode ? this.hide() : this.updateVisibilityForPlatform();
        });

        this.initializeComponents();
    }

    private async initializeComponents(): Promise<void> {
        try {
            // Initialize nostr auth if available
            if (typeof nostrAuth !== 'undefined') {
                await this.initializeNostrAuth();
            }

            // Add custom action buttons
            await this.createActionsSection();

            // Initialize settings
            await this.initializeSettings();
            await this.initializePanel();
            this.initializeDragAndDrop();
            
            this.isInitialized = true;
            this.emit('settings:ready', null);
            
            logger.info('ModularControlPanel fully initialized');
        } catch (error) {
            logger.error('Failed to initialize components:', createErrorMetadata(error));
        }
    }

    private async initializeSettings(): Promise<void> {
        try {
            await this.settingsStore.initialize();
            logger.info('Settings initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize settings:', createErrorMetadata(error));
            throw error;
        }
    }

    private async initializePanel(): Promise<void> {
        try {
            // Create main categories container
            const categoriesContainer = document.createElement('div');
            categoriesContainer.className = 'settings-categories';
            
            // Create sections for each main category in settingsMap
            for (const [category, settings] of Object.entries(settingsMap)) {
                const sectionConfig: SectionConfig = {
                    id: category,
                    title: formatSettingName(category),
                    isDetached: false,
                    isCollapsed: false,
                    isAdvanced: this.isAdvancedCategory(category)
                };
                
                this.sections.set(category, sectionConfig);
                const section = await this.createSection(sectionConfig, settings);
                categoriesContainer.appendChild(section);
            }
            
            this.container.appendChild(categoriesContainer);
            logger.info('Panel UI initialized');
        } catch (error) {
            logger.error('Failed to initialize panel:', createErrorMetadata(error));
            throw error;
        }
    }

    private initializeDragAndDrop(): void {
        this.container.addEventListener('mousedown', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const section = target.closest('.settings-section') as HTMLElement;
            
            if (!section || !target.classList.contains('section-header')) return;
            
            const sectionId = section.dataset.sectionId;
            if (!sectionId) return;

            const sectionConfig = this.sections.get(sectionId);
            if (!sectionConfig) return;

            if (sectionConfig.isDetached) {
                this.startDragging(section, e);
            }
        });
    }

    private startDragging(element: HTMLElement, e: MouseEvent): void {
        const rect = element.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        const moveHandler = (e: MouseEvent) => {
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
            
            const sectionId = element.dataset.sectionId;
            if (sectionId) {
                const config = this.sections.get(sectionId);
                if (config) {
                    config.position = { x, y };
                }
            }
        };

        const upHandler = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }

    private async initializeNostrAuth(): Promise<void> {
        const authSection = document.createElement('div');
        authSection.className = 'settings-section auth-section';
        
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = '<h4>Authentication</h4>';
        authSection.appendChild(header);

        const content = document.createElement('div');
        content.className = 'section-content';

        const loginBtn = document.createElement('button');
        loginBtn.className = 'nostr-login-btn';
        loginBtn.textContent = 'Login with Nostr';
        
        const statusDisplay = document.createElement('div');
        statusDisplay.className = 'auth-status';
        statusDisplay.innerHTML = '<div class="not-authenticated">Not authenticated</div>';
        
        content.appendChild(loginBtn);
        content.appendChild(statusDisplay);
        authSection.appendChild(content);

        this.container.insertBefore(authSection, this.container.firstChild);

        // Set up login button click handler
        loginBtn.onclick = async () => {
            try {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Connecting...';
                
                const result = await nostrAuth.login();
                if (!result.authenticated) {
                    throw new Error(result.error || 'Authentication failed');
                }
            } catch (error) {
                logger.error('Nostr login failed:', createErrorMetadata(error));
                const errorMsg = document.createElement('div');
                errorMsg.className = 'auth-error';
                
                let errorText = 'Login failed';
                if (error instanceof Error) {
                    if (error.message.includes('Alby extension not found')) {
                        errorText = 'Please install Alby extension to use Nostr login';
                    } else if (error.message.includes('Failed to get public key')) {
                        errorText = 'Please allow access to your Nostr public key';
                    } else {
                        errorText = error.message;
                    }
                }
                
                errorMsg.textContent = errorText;
                content.appendChild(errorMsg);
                setTimeout(() => errorMsg.remove(), 5000);
            } finally {
                loginBtn.disabled = false;
            }
        };

        // Subscribe to auth state changes
        this.unsubscribers.push(
            nostrAuth.onAuthStateChanged(({ authenticated, user }) => {
                if (authenticated && user) {
                    loginBtn.textContent = 'Logout';
                    loginBtn.onclick = async () => {
                        try {
                            loginBtn.disabled = true;
                            loginBtn.textContent = 'Logging out...';
                            await nostrAuth.logout();
                        } catch (error) {
                            logger.error('Logout failed:', createErrorMetadata(error));
                        }
                    };
                    statusDisplay.innerHTML = `
                        <div class="user-info">
                            <div class="pubkey">${user.pubkey.substring(0, 8)}...</div>
                            <div class="role">${user.isPowerUser ? 'Power User' : 'Basic User'}</div>
                        </div>
                    `;
                } else {
                    loginBtn.textContent = 'Login with Nostr';
                    loginBtn.onclick = () => nostrAuth.login();
                    statusDisplay.innerHTML = '<div class="not-authenticated">Not authenticated</div>';
                }
                loginBtn.disabled = false;
            })
        );

        await nostrAuth.initialize();
    }

    private async createActionsSection(): Promise<void> {
        const actionsSection = document.createElement('div');
        actionsSection.className = 'settings-section action-section';
        
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = '<h4>Actions</h4>';
        actionsSection.appendChild(header);

        const content = document.createElement('div');
        content.className = 'section-content';

        // Create randomize nodes button
        const randomizeBtn = document.createElement('button');
        randomizeBtn.className = 'action-button randomize-btn';
        randomizeBtn.textContent = 'Randomly Distribute Nodes';
        randomizeBtn.title = 'Randomly distribute all nodes in 3D space';
        
        // Add event listener
        randomizeBtn.onclick = () => {
            try {
                randomizeBtn.disabled = true;
                randomizeBtn.textContent = 'Distributing...';
                
                // Call the visualization controller to randomize nodes
                const controller = VisualizationController.getInstance();
                controller.randomizeNodePositions(10); // Use a smaller radius of 10 units to prevent explosion
                
                setTimeout(() => {
                    randomizeBtn.disabled = false;
                    randomizeBtn.textContent = 'Randomly Distribute Nodes';
                }, 1500);
            } catch (error) {
                console.error('Failed to randomize nodes:', error);
                randomizeBtn.disabled = false;
                randomizeBtn.textContent = 'Randomly Distribute Nodes';
            }
        };
        
        content.appendChild(randomizeBtn);
        actionsSection.appendChild(content);

        // Add the actions section to the container
        this.container.appendChild(actionsSection);
    }

    private isAdvancedCategory(category: string): boolean {
        const advancedCategories = ['physics', 'rendering', 'debug', 'network'];
        return advancedCategories.includes(category.toLowerCase());
    }

    private async createSection(config: SectionConfig, settings: Record<string, SettingControl | Record<string, SettingControl>>): Promise<HTMLElement> {
        const section = document.createElement('div');
        section.className = `settings-section ${config.isAdvanced ? 'advanced' : 'basic'}`;
        section.dataset.sectionId = config.id;
        
        if (config.isDetached) {
            section.classList.add('detached');
            if (config.position) {
                section.style.left = `${config.position.x}px`;
                section.style.top = `${config.position.y}px`;
            }
        }

        const header = document.createElement('div');
        header.className = 'section-header';
        
        const title = document.createElement('h4');
        title.textContent = config.title;
        header.appendChild(title);

        const controls = document.createElement('div');
        controls.className = 'section-controls';

        const detachBtn = document.createElement('button');
        detachBtn.className = 'section-control detach';
        detachBtn.innerHTML = config.isDetached ? '📌' : '📎';
        detachBtn.title = config.isDetached ? 'Dock section' : 'Detach section';
        detachBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleDetached(config.id);
        };
        controls.appendChild(detachBtn);

        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'section-control collapse';
        collapseBtn.innerHTML = config.isCollapsed ? '▼' : '▲';
        collapseBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleCollapsed(config.id);
        };
        controls.appendChild(collapseBtn);

        header.appendChild(controls);
        section.appendChild(header);

        const content = document.createElement('div');
        content.className = 'section-content';
        if (config.isCollapsed) {
            content.style.display = 'none';
        }

        // Create subsections for each group of settings
        for (const [subsectionKey, subsectionSettings] of Object.entries(settings)) {
            const subsection = await this.createSubsection(subsectionKey, subsectionSettings);
            content.appendChild(subsection);
        }

        section.appendChild(content);
        return section;
    }

    private async createSubsection(title: string, settings: Record<string, SettingControl> | SettingControl): Promise<HTMLElement> {
        const subsection = document.createElement('div');
        subsection.className = 'settings-subsection';

        const header = document.createElement('h3');
        header.textContent = formatSettingName(title);
        header.className = 'settings-subsection-header';
        subsection.appendChild(header);

        if (this.isSettingControl(settings)) {
            // Single setting
            const control = await this.createSettingControl(title, settings);
            subsection.appendChild(control);
        } else {
            // Group of settings
            for (const [key, setting] of Object.entries(settings)) {
                const control = await this.createSettingControl(key, setting);
                subsection.appendChild(control);
            }
        }

        return subsection;
    }

    private isSettingControl(value: any): value is SettingControl {
        return value && typeof value === 'object' && 'type' in value;
    }

    private async createSettingControl(key: string, setting: SettingControl): Promise<HTMLElement> {
        const container = document.createElement('div');
        container.className = 'setting-control';
        container.dataset.settingPath = key;

        if (setting.tooltip) {
            container.title = setting.tooltip;
        }

        const label = document.createElement('label');
        label.textContent = setting.label;
        container.appendChild(label);

        const control = await this.createInputElement(key, setting);
        container.appendChild(control);

        return container;
    }

    private async createInputElement(path: string, setting: SettingControl): Promise<HTMLElement> {
        const currentValue = this.settingsStore.get(path);
        let input: HTMLElement;

        switch (setting.type) {
            case 'slider': {
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = setting.min?.toString() ?? '0';
                slider.max = setting.max?.toString() ?? '1';
                slider.step = setting.step?.toString() ?? '0.1';
                slider.value = (currentValue ?? slider.min).toString();
                slider.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    this.updateSetting(path, parseFloat(target.value));
                };
                input = slider;
                break;
            }

            case 'toggle': {
                const toggleContainer = document.createElement('div');
                toggleContainer.className = 'toggle-switch';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(currentValue);
                checkbox.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    this.updateSetting(path, target.checked);
                };
                
                const slider = document.createElement('span');
                slider.className = 'slider';
                
                toggleContainer.appendChild(checkbox);
                toggleContainer.appendChild(slider);
                input = toggleContainer;
                break;
            }

            case 'color': {
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = (currentValue as string) ?? '#ffffff';
                colorInput.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    this.updateSetting(path, target.value);
                };
                input = colorInput;
                break;
            }

            case 'select': {
                const select = document.createElement('select');
                setting.options?.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option;
                    optionElement.textContent = formatSettingName(option);
                    select.appendChild(optionElement);
                });
                select.value = (currentValue as string) ?? setting.options?.[0] ?? '';
                select.onchange = (e) => {
                    const target = e.target as HTMLSelectElement;
                    this.updateSetting(path, target.value);
                };
                input = select;
                break;
            }

            case 'number': {
                const numberInput = document.createElement('input');
                numberInput.type = 'number';
                numberInput.min = setting.min?.toString() ?? '0';
                if (setting.max !== undefined) numberInput.max = setting.max.toString();
                numberInput.step = setting.step?.toString() ?? '1';
                numberInput.value = (currentValue ?? 0).toString();
                numberInput.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    this.updateSetting(path, parseFloat(target.value));
                };
                input = numberInput;
                break;
            }

            case 'text':
            default: {
                const textInput = document.createElement('input');
                textInput.type = 'text';
                textInput.value = (currentValue ?? '').toString();
                textInput.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    this.updateSetting(path, target.value);
                };
                input = textInput;
                break;
            }
        }

        return input;
    }

    private updateSetting(path: string, value: any): void {
        try {
            const currentValue = this.settingsStore.get(path);
            
            let processedValue = value;
            if (Array.isArray(currentValue)) {
                processedValue = value.map((v: any, i: number) => {
                    const originalValue = currentValue[i];
                    if (typeof originalValue === 'number') {
                        const parsed = parseFloat(v);
                        return isNaN(parsed) ? originalValue : parsed;
                    }
                    return v;
                });
            } else if (typeof currentValue === 'number') {
                const parsed = parseFloat(value);
                processedValue = isNaN(parsed) ? currentValue : parsed;
            }

            this.settingsStore.set(path, processedValue);
            this.emit('settings:updated', { path, value: processedValue });
        } catch (error) {
            logger.error(`Failed to update setting ${path}:`, createErrorMetadata(error));
            
            // Create an error element
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.textContent = error instanceof Error ? error.message : 'Unknown error occurred';
            
            const control = this.container.querySelector(`[data-setting-path="${path}"]`);
            if (control) {
                // Add error class to the control
                control.classList.add('error');
                
                // Add error message
                control.appendChild(errorElement);
                
                // Remove error after 5 seconds
                setTimeout(() => {
                    control.classList.remove('error');
                    errorElement.remove();
                }, 5000);
                
                // Revert the input value
                const input = control.querySelector('input, select') as HTMLInputElement;
                if (input) {
                    const currentValue = this.settingsStore.get(path);
                    if (Array.isArray(currentValue)) {
                        const inputs = control.querySelectorAll('.array-item') as NodeListOf<HTMLInputElement>;
                        inputs.forEach((input, i) => {
                            input.value = currentValue[i].toString();
                        });
                    } else {
                        input.value = currentValue?.toString() || '';
                    }
                }
            }
        }
    }

    private toggleDetached(sectionId: string): void {
        const config = this.sections.get(sectionId);
        if (!config) return;

        config.isDetached = !config.isDetached;
        const section = this.container.querySelector(`[data-section-id="${sectionId}"]`);
        if (section) {
            section.classList.toggle('detached');
            if (config.isDetached) {
                const rect = section.getBoundingClientRect();
                config.position = { x: rect.left, y: rect.top };
            } else {
                (section as HTMLElement).removeAttribute('style');
            }
        }
    }

    private toggleCollapsed(sectionId: string): void {
        const config = this.sections.get(sectionId);
        if (!config) return;

        config.isCollapsed = !config.isCollapsed;
        const section = this.container.querySelector(`[data-section-id="${sectionId}"]`);
        if (section) {
            const content = section.querySelector('.section-content');
            if (content) {
                content.classList.toggle('collapsed');
                (content as HTMLElement).style.display = config.isCollapsed ? 'none' : '';
            }
            const collapseBtn = section.querySelector('.collapse') as HTMLElement;
            if (collapseBtn) {
                collapseBtn.innerHTML = config.isCollapsed ? '▼' : '▲';
            }
        }
    }

    public show(): void {
        this.container.classList.remove('hidden');
        this.toggleButton.classList.add('panel-open');
    }

    public hide(): void {
        this.container.classList.add('hidden');
        this.toggleButton.classList.remove('panel-open');
    }

    public toggle(): void {
        this.container.classList.toggle('hidden');
        this.toggleButton.classList.toggle('panel-open');
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    private updateVisibilityForPlatform(): void {
        if (platformManager.isQuest() || platformManager.isXRMode) {
            this.hide();
        } else {
            this.show();
        }
    }

    public static getInstance(): ModularControlPanel {
        if (!ModularControlPanel.instance) {
            ModularControlPanel.instance = new ModularControlPanel(document.body);
        }
        return ModularControlPanel.instance;
    }

    public dispose(): void {
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.validationDisplay.dispose();
        if (this.updateTimeout !== null) {
            window.clearTimeout(this.updateTimeout);
        }
        this.container.remove();
        this.toggleButton.remove();
        ModularControlPanel.instance = null;
    }
}

// Export the class as default as well to maintain compatibility
export default ModularControlPanel;