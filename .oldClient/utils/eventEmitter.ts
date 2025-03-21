type EventCallback<T = any> = (data: T) => void;
type EventMap = Record<string, any>;

export class EventEmitter<Events extends EventMap = EventMap> {
    private events: {
        [E in keyof Events]?: EventCallback<Events[E]>[];
    } = {};

    on<E extends keyof Events>(event: E, callback: EventCallback<Events[E]>): void {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event]?.push(callback);
    }

    emit<E extends keyof Events>(event: E, data: Events[E]): void {
        const callbacks = this.events[event];
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    off<E extends keyof Events>(event: E, callback: EventCallback<Events[E]>): void {
        const callbacks = this.events[event];
        if (callbacks) {
            this.events[event] = callbacks.filter(cb => cb !== callback);
        }
    }
} 