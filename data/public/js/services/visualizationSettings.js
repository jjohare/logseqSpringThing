// Manages visualization settings received from the server and provides defaults
export class VisualizationSettings {
    constructor() {
        // Default values matching settings.toml
        this.settings = {
            // Node settings
            nodeColor: '0x1A0B31',
            nodeSizeScalingFactor: 5,
            
            // Edge settings
            edgeColor: '0xff0000',
            edgeOpacity: 0.3,
            
            // Hologram settings
            hologramColor: '0xFFD700',
            hologramScale: 5,
            hologramOpacity: 0.1,
            
            // Label settings
            labelFontSize: 36,
            
            // Environment settings
            fogDensity: 0.002,
            
            // Force-directed layout settings
            forceDirectedIterations: 100,
            forceDirectedRepulsion: 1.0,
            forceDirectedAttraction: 0.01,
            
            // Bloom settings
            nodeBloomStrength: 0.1,
            nodeBloomRadius: 0.1,
            nodeBloomThreshold: 0.0,
            edgeBloomStrength: 0.2,
            edgeBloomRadius: 0.3,
            edgeBloomThreshold: 0.0,
            environmentBloomStrength: 0.5,
            environmentBloomRadius: 0.1,
            environmentBloomThreshold: 0.0
        };

        // Bind the WebSocket message handler
        this.handleServerSettings = this.handleServerSettings.bind(this);
        window.addEventListener('serverSettings', this.handleServerSettings);
    }

    handleServerSettings(event) {
        const serverSettings = event.detail;
        // Update settings with values from server, maintaining defaults for any missing values
        this.settings = {
            ...this.settings,
            ...serverSettings.visualization,
            ...serverSettings.bloom
        };

        // Dispatch event to notify components of updated settings
        window.dispatchEvent(new CustomEvent('visualizationSettingsUpdated', {
            detail: this.settings
        }));
    }

    getSettings() {
        return this.settings;
    }

    // Get settings for specific components
    getNodeSettings() {
        return {
            color: this.settings.nodeColor,
            sizeScalingFactor: this.settings.nodeSizeScalingFactor,
            bloomStrength: this.settings.nodeBloomStrength,
            bloomRadius: this.settings.nodeBloomRadius,
            bloomThreshold: this.settings.nodeBloomThreshold
        };
    }

    getEdgeSettings() {
        return {
            color: this.settings.edgeColor,
            opacity: this.settings.edgeOpacity,
            bloomStrength: this.settings.edgeBloomStrength,
            bloomRadius: this.settings.edgeBloomRadius,
            bloomThreshold: this.settings.edgeBloomThreshold
        };
    }

    getHologramSettings() {
        return {
            color: this.settings.hologramColor,
            scale: this.settings.hologramScale,
            opacity: this.settings.hologramOpacity
        };
    }

    getLayoutSettings() {
        return {
            iterations: this.settings.forceDirectedIterations,
            repulsion: this.settings.forceDirectedRepulsion,
            attraction: this.settings.forceDirectedAttraction
        };
    }

    getEnvironmentSettings() {
        return {
            fogDensity: this.settings.fogDensity,
            bloomStrength: this.settings.environmentBloomStrength,
            bloomRadius: this.settings.environmentBloomRadius,
            bloomThreshold: this.settings.environmentBloomThreshold
        };
    }
}

// Create and export a singleton instance
export const visualizationSettings = new VisualizationSettings();
