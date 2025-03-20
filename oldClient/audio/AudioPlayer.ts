export interface AudioPlayerOptions {
    sampleRate?: number;
    channels?: number;
    bufferSize?: number;
}

export class AudioPlayer {
    private audioContext: AudioContext;
    private audioQueue: AudioBuffer[] = [];
    private isPlaying = false;
    private gainNode: GainNode;
    private options: Required<AudioPlayerOptions>;

    constructor(options: AudioPlayerOptions = {}) {
        this.options = {
            sampleRate: options.sampleRate || 24000, // Kokoros default sample rate
            channels: options.channels || 1,
            bufferSize: options.bufferSize || 4096,
        };

        this.audioContext = new AudioContext({
            sampleRate: this.options.sampleRate,
            latencyHint: 'interactive',
        });

        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.setVolume(1.0); // Default volume
    }

    public setVolume(value: number): void {
        if (value >= 0 && value <= 1) {
            this.gainNode.gain.value = value;
        }
    }

    public async handleAudioChunk(data: ArrayBuffer, isLastChunk: boolean): Promise<void> {
        try {
            const audioBuffer = await this.decodeAudioData(data);
            this.audioQueue.push(audioBuffer);
            
            if (!this.isPlaying) {
                await this.playNextChunk();
            }
            
            if (isLastChunk) {
                this.clear(); // Clear the queue after playing the last chunk
            }
        } catch (error) {
            console.error('Error handling audio chunk:', error);
        }
    }

    private async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
        return new Promise((resolve, reject) => {
            this.audioContext.decodeAudioData(
                data,
                (buffer) => resolve(buffer),
                (error) => reject(error)
            );
        });
    }

    private async playNextChunk(): Promise<void> {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const buffer = this.audioQueue.shift()!;
        const source = this.audioContext.createBufferSource();
        
        source.buffer = buffer;
        source.connect(this.gainNode);
        
        return new Promise((resolve) => {
            source.onended = () => {
                this.playNextChunk().then(resolve);
            };
            
            source.start();
        });
    }

    public async resume(): Promise<void> {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    public async pause(): Promise<void> {
        if (this.audioContext.state === 'running') {
            await this.audioContext.suspend();
        }
    }

    public stop(): void {
        this.audioQueue = [];
        this.isPlaying = false;
        this.audioContext.close();
    }

    public clear(): void {
        this.audioQueue = [];
    }

    public getState(): AudioContextState {
        return this.audioContext.state;
    }

    public getQueueLength(): number {
        return this.audioQueue.length;
    }
}

// Singleton instance for global access
let audioPlayerInstance: AudioPlayer | null = null;

export function getAudioPlayer(options?: AudioPlayerOptions): AudioPlayer {
    if (!audioPlayerInstance) {
        audioPlayerInstance = new AudioPlayer(options);
    }
    return audioPlayerInstance;
}

export function disposeAudioPlayer(): void {
    if (audioPlayerInstance) {
        audioPlayerInstance.stop();
        audioPlayerInstance = null;
    }
}

// Error handling
export class AudioPlayerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AudioPlayerError';
    }
}

// Types for WebSocket messages
export interface VoiceDataMessage {
    chunkId: number;
    isFinal: boolean;
    data: ArrayBuffer;
}

// Example usage:
/*
const player = getAudioPlayer();

// Handle incoming WebSocket message
ws.onmessage = async (event) => {
    if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        const messageType = view.getUint8(0);
        
        if (messageType === 1) { // VoiceData type
            const chunkId = view.getUint32(1, true);
            const isFinal = Boolean(view.getUint8(5));
            const dataSize = view.getUint32(6, true);
            const audioData = event.data.slice(10, 10 + dataSize);
            
            await player.handleAudioChunk(audioData, isFinal);
        }
    }
};
*/