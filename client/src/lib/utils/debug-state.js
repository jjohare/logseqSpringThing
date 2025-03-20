import { createLogger } from './logger';
const logger = createLogger('DebugState');
class DebugState {
    constructor() {
        this.debugEnabled = false;
        this.dataDebugEnabled = false;
        this.performanceDebugEnabled = false;
        // Initialize from localStorage if available
        this.loadFromStorage();
    }
    loadFromStorage() {
        if (typeof window !== 'undefined') {
            try {
                this.debugEnabled = localStorage.getItem('debug.enabled') === 'true';
                this.dataDebugEnabled = localStorage.getItem('debug.data') === 'true';
                this.performanceDebugEnabled = localStorage.getItem('debug.performance') === 'true';
            }
            catch (e) {
                logger.warn('Failed to load debug state from localStorage');
            }
        }
    }
    saveToStorage() {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('debug.enabled', this.debugEnabled.toString());
                localStorage.setItem('debug.data', this.dataDebugEnabled.toString());
                localStorage.setItem('debug.performance', this.performanceDebugEnabled.toString());
            }
            catch (e) {
                logger.warn('Failed to save debug state to localStorage');
            }
        }
    }
    isEnabled() {
        return this.debugEnabled;
    }
    enableDebug(enable = true) {
        this.debugEnabled = enable;
        this.saveToStorage();
        logger.info(`Debug mode ${enable ? 'enabled' : 'disabled'}`);
    }
    isDataDebugEnabled() {
        return this.debugEnabled && this.dataDebugEnabled;
    }
    enableDataDebug(enable = true) {
        this.dataDebugEnabled = enable;
        this.saveToStorage();
        logger.info(`Data debug mode ${enable ? 'enabled' : 'disabled'}`);
    }
    isPerformanceDebugEnabled() {
        return this.debugEnabled && this.performanceDebugEnabled;
    }
    enablePerformanceDebug(enable = true) {
        this.performanceDebugEnabled = enable;
        this.saveToStorage();
        logger.info(`Performance debug mode ${enable ? 'enabled' : 'disabled'}`);
    }
}
// Create a singleton instance
export const debugState = new DebugState();
