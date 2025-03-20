import { getAudioPlayer } from '../audio/AudioPlayer';

export interface SpeechWebSocketOptions {
    url?: string;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    onStatusChange?: (status: SpeechConnectionStatus) => void;
}

export enum SpeechConnectionStatus {
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    ERROR = 'error',
}

export interface TTSRequest {
    type: 'tts';
    text: string;
    voice?: string;
    speed?: number;
    stream?: boolean;
}

export class SpeechWebSocketService {
    private ws: WebSocket | null = null;
    private status: SpeechConnectionStatus = SpeechConnectionStatus.DISCONNECTED;
    private reconnectAttempts = 0;
    private audioPlayer = getAudioPlayer();
    
    private options: Required<SpeechWebSocketOptions> = {
        url: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/speech',
        autoReconnect: true,
        reconnectDelay: 3000,
        maxReconnectAttempts: 5,
        onStatusChange: () => {},
    };

    constructor(options: SpeechWebSocketOptions = {}) {
        this.options = { ...this.options, ...options };
    }

    /**
     * Connect to the speech WebSocket server
     */
    public connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('WebSocket is already connected');
            return;
        }

        this.setStatus(SpeechConnectionStatus.CONNECTING);
        
        try {
            this.ws = new WebSocket(this.options.url);
            
            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            
            console.log('Connecting to speech WebSocket at', this.options.url);
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.setStatus(SpeechConnectionStatus.ERROR);
            this.attemptReconnect();
        }
    }

    /**
     * Disconnect from the WebSocket server
     */
    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Send a text-to-speech request
     */
    public sendTTS(text: string, voice?: string, speed?: number, stream?: boolean): void {
        if (!this.isConnected()) {
            console.warn('Cannot send TTS request: WebSocket is not connected');
            return;
        }

        const request: TTSRequest = {
            type: 'tts',
            text,
            voice,
            speed,
            stream,
        };

        this.ws!.send(JSON.stringify(request));
        console.log('Sent TTS request:', request);
    }

    /**
     * Check if the WebSocket is connected
     */
    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get the current connection status
     */
    public getStatus(): SpeechConnectionStatus {
        return this.status;
    }

    private handleOpen(_event: Event): void {
        console.log('Speech WebSocket connection established');
        this.setStatus(SpeechConnectionStatus.CONNECTED);
        this.reconnectAttempts = 0;
    }

    private handleClose(event: CloseEvent): void {
        console.log('Speech WebSocket connection closed:', event.code, event.reason);
        this.setStatus(SpeechConnectionStatus.DISCONNECTED);
        this.attemptReconnect();
    }

    private handleError(event: Event): void {
        console.error('Speech WebSocket error:', event);
        this.setStatus(SpeechConnectionStatus.ERROR);
    }

    private handleMessage(event: MessageEvent): void {
        // Handle binary audio data
        if (event.data instanceof ArrayBuffer) {
            this.handleAudioData(event.data);
            return;
        }

        // Handle JSON messages
        try {
            const message = JSON.parse(event.data);
            console.log('Received speech message:', message);
            
            if (message.type === 'error') {
                console.error('Speech service error:', message.message);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    private handleAudioData(data: ArrayBuffer): void {
        console.log(`Received audio chunk: ${data.byteLength} bytes`);
        
        // Process the audio data through the AudioPlayer
        this.audioPlayer.handleAudioChunk(data, false);
    }

    private attemptReconnect(): void {
        if (!this.options.autoReconnect) {
            return;
        }

        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached, giving up');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${this.options.reconnectDelay}ms`);
        
        setTimeout(() => {
            console.log('Reconnecting...');
            this.connect();
        }, this.options.reconnectDelay);
    }

    private setStatus(status: SpeechConnectionStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.options.onStatusChange(status);
        }
    }
}

// Create a singleton instance
let instance: SpeechWebSocketService | null = null;

export function getSpeechWebSocketService(options: SpeechWebSocketOptions = {}): SpeechWebSocketService {
    if (!instance) {
        instance = new SpeechWebSocketService(options);
    }
    return instance;
}

// Helper to clean up the service
export function disposeSpeechWebSocketService(): void {
    if (instance) {
        instance.disconnect();
        instance = null;
    }
}