import { ValidationError } from '../../types/settings/validation';
import { SettingsStore } from '../../state/SettingsStore';
import { formatSettingName } from '../../types/settings/utils';

export class ValidationErrorDisplay {
    private container: HTMLDivElement;
    private errorList: HTMLUListElement;
    private unsubscribe: (() => void) | null = null;

    constructor(parentElement: HTMLElement) {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'validation-error-container';
        this.container.style.cssText = `
            display: none;
            position: fixed;
            bottom: 20px;
            right: 20px;
            max-width: 400px;
            background-color: #fee;
            border: 1px solid #faa;
            border-radius: 4px;
            padding: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Settings Validation Errors';
        title.style.cssText = `
            margin: 0;
            color: #d32f2f;
            font-size: 16px;
        `;

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: #666;
            font-size: 20px;
            cursor: pointer;
            padding: 0 4px;
        `;
        closeButton.onclick = () => this.hide();

        header.appendChild(title);
        header.appendChild(closeButton);
        this.container.appendChild(header);

        // Create error list
        this.errorList = document.createElement('ul');
        this.errorList.style.cssText = `
            margin: 0;
            padding-left: 20px;
            color: #d32f2f;
            font-size: 14px;
        `;
        this.container.appendChild(this.errorList);

        // Add to parent
        parentElement.appendChild(this.container);

        // Subscribe to validation errors
        this.subscribeToValidationErrors();
    }

    private subscribeToValidationErrors(): void {
        const settingsStore = SettingsStore.getInstance();
        this.unsubscribe = settingsStore.subscribeToValidationErrors((errors: ValidationError[]) => {
            if (errors.length > 0) {
                this.showErrors(errors);
            } else {
                this.hide();
            }
        });
    }

    private showErrors(errors: ValidationError[]): void {
        // Clear existing errors
        this.errorList.innerHTML = '';

        // Add new errors
        errors.forEach(error => {
            const li = document.createElement('li');
            li.style.marginBottom = '4px';
            
            // Format the error message
            const settingName = formatSettingName(error.path.split('.').pop() || '');
            const formattedPath = error.path.split('.').map(formatSettingName).join(' → ');
            
            li.innerHTML = `
                <strong>${settingName}:</strong> ${error.message}<br>
                <small style="color: #666;">Path: ${formattedPath}</small>
            `;
            
            this.errorList.appendChild(li);
        });

        // Show the container
        this.container.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => this.hide(), 5000);
    }

    private hide(): void {
        this.container.style.display = 'none';
    }

    public dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.container.remove();
    }

    // Helper method to create an instance and attach it to the document body
    public static initialize(): ValidationErrorDisplay {
        return new ValidationErrorDisplay(document.body);
    }
}

// Add CSS to document
const style = document.createElement('style');
style.textContent = `
    .validation-error-container {
        animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    .validation-error-container button:hover {
        color: #000;
    }

    .validation-error-container ul li {
        line-height: 1.4;
    }
`;
document.head.appendChild(style);