import { Settings } from '../types/settings';
import { SettingsStore } from '../state/SettingsStore';
import { getAllSettingPaths, formatSettingName } from '../types/settings/utils';
import { ValidationErrorDisplay } from '../components/settings/ValidationErrorDisplay';
import { createLogger } from '../core/logger';
import { platformManager } from '../platform/platformManager';
import { nostrAuth, NostrUser } from '../services/NostrAuthService';
import { EventEmitter } from '../utils/eventEmitter';

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
            // Initialize settings first
            await this.initializeSettings();
            
            // Then initialize UI components
            await this.initializePanel();
            this.initializeDragAndDrop();
            await this.initializeNostrAuth();
            
            // Mark as initialized and emit ready event
            this.isInitialized = true;
            this.emit('settings:ready', null);
            
            logger.info('ModularControlPanel fully initialized');
        } catch (error) {
            logger.error('Failed to initialize ModularControlPanel:', error);
            throw error;
        }
    }

    private async initializeSettings(): Promise<void> {
        try {
            await this.settingsStore.initialize();
            logger.info('Settings initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize settings:', error);
            throw error;
        }
    }

    private async initializePanel(): Promise<void> {
        try {
            const settings = this.settingsStore.get('') as Settings;
            const paths = getAllSettingPaths(settings);
            
            // Create main categories container
            const categoriesContainer = document.createElement('div');
            categoriesContainer.className = 'settings-categories';
            
            // Group settings by main category
            const mainCategories = ['visualization', 'system', 'xr'];
            const groupedSettings = this.groupSettingsByCategory(paths);
            
            // Create sections for each main category first
            for (const category of mainCategories) {
                if (groupedSettings[category]) {
                    const sectionConfig: SectionConfig = {
                        id: category,
                        title: formatSettingName(category),
                        isDetached: false,
                        isCollapsed: false,
                        isAdvanced: this.isAdvancedCategory(category)
                    };
                    
                    this.sections.set(category, sectionConfig);
                    const section = await this.createSection(sectionConfig, groupedSettings[category]);
                    categoriesContainer.appendChild(section);
                }
            }
            
            this.container.appendChild(categoriesContainer);
            logger.info('Panel UI initialized');
        } catch (error) {
            logger.error('Failed to initialize panel:', error);
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
        loginBtn.onclick = async () => {
            try {
                // Show loading state
                loginBtn.disabled = true;
                loginBtn.textContent = 'Connecting...';
                
                const result = await nostrAuth.login();
                if (result.authenticated) {
                    this.updateAuthUI(result.user);
                } else {
                    throw new Error(result.error || 'Authentication failed');
                }
            } catch (error) {
                logger.error('Nostr login failed:', error);
                const errorMsg = document.createElement('div');
                errorMsg.className = 'auth-error';
                
                // Provide more user-friendly error messages
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
                // Reset button state
                loginBtn.disabled = false;
                this.updateAuthUI(nostrAuth.getCurrentUser());
            }
        };

        const statusDisplay = document.createElement('div');
        statusDisplay.className = 'auth-status';
        
        content.appendChild(loginBtn);
        content.appendChild(statusDisplay);
        authSection.appendChild(content);

        this.container.insertBefore(authSection, this.container.firstChild);

        // Add some basic styles for the auth section
        const style = document.createElement('style');
        style.textContent = `
            .auth-section {
                margin-bottom: 1rem;
                padding: 1rem;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 4px;
            }
            .nostr-login-btn {
                padding: 8px 16px;
                background: #4a90e2;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }
            .nostr-login-btn:hover {
                background: #357abd;
            }
            .nostr-login-btn:disabled {
                background: #ccc;
                cursor: wait;
            }
            .auth-error {
                color: #d32f2f;
                margin-top: 8px;
                padding: 8px;
                background: rgba(211, 47, 47, 0.1);
                border-radius: 4px;
                font-size: 14px;
            }
            .user-info {
                margin-top: 8px;
                font-size: 14px;
            }
            .user-info .pubkey {
                font-family: monospace;
                background: rgba(0, 0, 0, 0.1);
                padding: 2px 4px;
                border-radius: 2px;
            }
            .user-info .role {
                color: #4a90e2;
                font-weight: bold;
                margin-top: 4px;
            }
            .not-authenticated {
                color: #666;
                font-style: italic;
                margin-top: 8px;
            }
        `;
        document.head.appendChild(style);

        this.unsubscribers.push(
            nostrAuth.onAuthStateChanged(({ user }) => {
                this.updateAuthUI(user);
            })
        );

        await nostrAuth.initialize();
        this.updateAuthUI(nostrAuth.getCurrentUser());
    }

    private updateAuthUI(user: NostrUser | null | undefined): void {
        const loginBtn = this.container.querySelector('.nostr-login-btn') as HTMLButtonElement;
        const statusDisplay = this.container.querySelector('.auth-status') as HTMLDivElement;

        if (!loginBtn || !statusDisplay) return;

        if (user) {
            loginBtn.textContent = 'Logout';
            loginBtn.onclick = async () => {
                try {
                    loginBtn.disabled = true;
                    loginBtn.textContent = 'Logging out...';
                    await nostrAuth.logout();
                } catch (error) {
                    logger.error('Logout failed:', error);
                } finally {
                    loginBtn.disabled = false;
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
    }

    private isAdvancedCategory(category: string): boolean {
        const advancedCategories = ['physics', 'rendering', 'debug', 'network'];
        return advancedCategories.includes(category.toLowerCase());
    }

    private groupSettingsByCategory(paths: string[]): Record<string, string[]> {
        const groups: Record<string, string[]> = {};
        
        paths.forEach(path => {
            const [category] = path.split('.');
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(path);
        });
        
        return groups;
    }

    private async createSection(config: SectionConfig, paths: string[]): Promise<HTMLElement> {
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

        const validPaths = paths.filter(path => {
            const value = this.settingsStore.get(path);
            return value !== undefined && value !== null;
        });

        if (validPaths.length > 0) {
            const subcategories = this.groupBySubcategory(validPaths);
            
            for (const [subcategory, subPaths] of Object.entries(subcategories)) {
                if (subPaths.length > 0) {
                    const subsection = await this.createSubsection(subcategory, subPaths);
                    content.appendChild(subsection);
                }
            }
        } else {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-section-message';
            emptyMessage.textContent = 'No configurable settings in this section';
            content.appendChild(emptyMessage);
        }

        section.appendChild(content);
        return section;
    }

    private groupBySubcategory(paths: string[]): Record<string, string[]> {
        const groups: Record<string, string[]> = {};
        
        paths.forEach(path => {
            const parts = path.split('.');
            if (parts.length > 2) {
                const subcategory = parts[1];
                if (!groups[subcategory]) {
                    groups[subcategory] = [];
                }
                groups[subcategory].push(path);
            } else if (parts.length === 2) {
                if (!groups['general']) {
                    groups['general'] = [];
                }
                groups['general'].push(path);
            }
        });
        
        return groups;
    }

    private async createSubsection(subcategory: string, paths: string[]): Promise<HTMLElement> {
        const subsection = document.createElement('div');
        subsection.className = 'settings-subsection';

const header = document.createElement('h3');
        header.textContent = formatSettingName(subcategory);
        header.className = 'settings-subsection-header';
        subsection.appendChild(header);
        
        // Sort paths to ensure consistent ordering
        paths.sort();

        // Create controls for each property
        for (const path of paths) {
            const value = this.settingsStore.get(path);
            if (value !== undefined && value !== null) {
                const control = await this.createSettingControl(path);
                subsection.appendChild(control);
            }
        }
        
        return subsection;
    }

    private async createSettingControl(path: string): Promise<HTMLElement> {
        const container = document.createElement('div');
        container.className = 'setting-control';
        container.dataset.settingPath = path;

        const label = document.createElement('label');
        label.textContent = formatSettingName(path.split('.').pop() || '');
        container.appendChild(label);

        const currentValue = this.settingsStore.get(path);
        const control = await this.createInputElement(path, currentValue);
        container.appendChild(control);

        return container;
    }

    private async createInputElement(path: string, value: any): Promise<HTMLElement> {
        const type = typeof value;
        let input: HTMLElement;
        
        const getNumericStep = (path: string): string => {
            if (path.includes('size') || path.includes('iterations')) return '1';
            if (path.includes('opacity') || path.includes('strength')) return '0.1';
            if (path.includes('intensity')) return '0.1';
            return '0.01';
        };

        // Handle arrays specially
        if (Array.isArray(value)) {
            const div = document.createElement('div');
            div.className = 'array-input';

            // Create inputs for each array element
            value.forEach((item, index) => {
                const itemInput = document.createElement('input');
                const isNumeric = typeof item === 'number';
                itemInput.type = isNumeric ? 'number' : 'text';
                if (isNumeric) {
                    itemInput.step = getNumericStep(path);
                    itemInput.min = '0';
                    itemInput.value = item.toString();
                } else {
                    itemInput.value = String(item);
                }
                itemInput.className = 'array-item';
                itemInput.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    const newValue = [...value];
                    if (isNumeric) {
                        const parsed = parseFloat(target.value);
                        newValue[index] = isNaN(parsed) ? item : Math.max(0, parsed);
                        // Update the input value to show the processed value
                        target.value = newValue[index].toString();
                    } else {
                        newValue[index] = target.value;
                    }
                    this.updateSetting(path, newValue);
                };
                div.appendChild(itemInput);
            });

            input = div;
            return input;
        }

        switch (type) {
            case 'boolean': {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = value;
                checkbox.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    this.updateSetting(path, target.checked);
                };
                input = checkbox;
                break;
            }

            case 'number': {
                const numberInput = document.createElement('input');
                numberInput.type = 'number';
                numberInput.step = getNumericStep(path);
                numberInput.min = '0';
                numberInput.value = Math.max(0, value).toString();
                numberInput.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    const parsed = parseFloat(target.value);
                    const processedValue = isNaN(parsed) ? value : Math.max(0, parsed);
                    target.value = processedValue.toString();
                    this.updateSetting(path, processedValue);
                };
                input = numberInput;
                break;
            }

            case 'string': {
                if (path.toLowerCase().includes('color')) {
                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.className = 'color-input';
                    colorInput.value = value;
                    colorInput.onchange = (e) => {
                        const target = e.target as HTMLInputElement;
                        this.updateSetting(path, target.value);
                    };
                    input = colorInput;
                } else {
                    const textInput = document.createElement('input');
                    textInput.type = 'text';
                    textInput.value = value;
                    textInput.onchange = (e) => {
                        const target = e.target as HTMLInputElement;
                        this.updateSetting(path, target.value);
                    };
                    input = textInput;
                }
                break;
            }

            default: {
                if (value === null || value === undefined) {
                    const div = document.createElement('div');
                    div.className = 'value-display';
                    div.textContent = String(value);
                    input = div;
                } else {
                    // For any other type, create a text input
                    const textInput = document.createElement('input');
                    textInput.type = 'text';
                    textInput.value = String(value);
                    textInput.onchange = (e) => {
                        const target = e.target as HTMLInputElement;
                        this.updateSetting(path, target.value);
                    };
                    input = textInput;
                }
            }
        }

        return input;
    }

    private updateSetting(path: string, value: any): void {
        try {
            // Get the current value to compare types
            const currentValue = this.settingsStore.get(path);
            
            // Process the value based on type
            let processedValue = value;
            if (Array.isArray(currentValue)) {
                processedValue = value.map((v: any, i: number) => {
                    const originalValue = currentValue[i];
                    if (typeof originalValue === 'number') {
                        const parsed = parseFloat(v);
                        return isNaN(parsed) ? originalValue : Math.max(0, parsed);
                    }
                    return v;
                });
            } else if (typeof currentValue === 'number') {
                const parsed = parseFloat(value);
                processedValue = isNaN(parsed) ? currentValue : Math.max(0, parsed);
            }

            this.settingsStore.set(path, processedValue);
            this.emit('settings:updated', { path, value: processedValue });

            // Update the UI to reflect the processed value
            const control = this.container.querySelector(`[data-setting-path="${path}"]`);
            if (control) {
                if (Array.isArray(processedValue)) {
                    const inputs = control.querySelectorAll('.array-item') as NodeListOf<HTMLInputElement>;
                    inputs.forEach((input, i) => {
                        input.value = processedValue[i].toString();
                    });
                } else {
                    const input = control.querySelector('input') as HTMLInputElement;
                    if (input) {
                        if (input.type === 'number') {
                            input.value = processedValue.toString();
                        } else if (input.type === 'checkbox') {
                            input.checked = processedValue;
                        } else {
                            input.value = String(processedValue);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error(`Failed to update setting ${path}:`, error);
            // Revert the input to the current value
            const control = this.container.querySelector(`[data-setting-path="${path}"]`);
            if (control) {
                const currentValue = this.settingsStore.get(path);
                if (Array.isArray(currentValue)) {
                    const inputs = control.querySelectorAll('.array-item') as NodeListOf<HTMLInputElement>;
                    inputs.forEach((input, i) => {
                        input.value = currentValue[i].toString();
                    });
                } else {
                    const input = control.querySelector('input') as HTMLInputElement;
                    if (input) {
                        if (input.type === 'checkbox') {
                            input.checked = Boolean(currentValue);
                        } else {
                            input.value = currentValue?.toString() || '';
                        }
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

    private updateVisibilityForPlatform(): void {
        // Hide on Quest or when in XR mode
        if (platformManager.isQuest() || platformManager.isXRMode) {
            this.hide();
        } else {
            this.show();
        }
    }
}