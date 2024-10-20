// public/js/services/websocketService.js

import pako from 'pako';

/**
 * WebsocketService handles the WebSocket connection and communication with the server.
 */
export class WebsocketService {
    constructor() {
        this.socket = null;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000; // 5 seconds
        this.audioContext = null; // Initialize as null
        this.audioQueue = [];
        this.isPlaying = false;
        this.ttsMethod = 'sonata'; // Default TTS method
        this.connect();
    }

    /**
     * Establishes a WebSocket connection to the server.
     */
    connect() {
        const url = 'wss://192.168.0.51:8443/ws';
        this.socket = new WebSocket(url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
            this.reconnectAttempts = 0;
            this.emit('open');
            this.send({ type: 'setTTSMethod', method: this.ttsMethod });
            this.getInitialData();
        };

        this.socket.onmessage = (event) => {
            try {
                let data;
                if (event.data instanceof ArrayBuffer) {
                    const decompressed = pako.inflate(new Uint8Array(event.data), { to: 'string' });
                    data = JSON.parse(decompressed);
                } else {
                    data = JSON.parse(event.data);
                }
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                this.emit('error', { type: 'parse_error', message: error.message, rawData: event.data });
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };

        this.socket.onclose = () => {
            this.emit('close');
            this.reconnect();
        };
    }

    handleRagflowResponse(data) {
        this.emit('ragflowAnswer', data.answer);
        if (data.audio) {
            const audioBlob = this.base64ToBlob(data.audio, 'audio/wav');
            this.handleAudioData(audioBlob);
        }
    }

    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    async handleAudioData(audioBlob) {
        if (!this.audioContext) {
            console.warn('AudioContext not initialized. Call initAudio() first.');
            return;
        }

        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await this.decodeWavData(arrayBuffer);
            this.audioQueue.push(audioBuffer);
            if (!this.isPlaying) {
                this.playNextAudio();
            }
        } catch (error) {
            console.error('Error processing audio data:', error);
            this.emit('error', { type: 'audio_processing_error', message: error.message });
        }
    }

    getInitialData() {
        this.send({ type: 'getInitialData' });
    }

    async decodeWavData(wavData) {
        return new Promise((resolve, reject) => {
            const header = new TextDecoder().decode(wavData.slice(0, 4));
            if (header !== 'RIFF') {
                return reject(new Error(`Invalid WAV header: ${header}`));
            }

            this.audioContext.decodeAudioData(
                wavData,
                (buffer) => resolve(buffer),
                (error) => reject(new Error(`Error decoding WAV data: ${error}`))
            );
        });
    }

    playNextAudio() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const audioBuffer = this.audioQueue.shift();
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        source.onended = () => this.playNextAudio();
        source.start();
    }

    /**
     * Initializes the AudioContext after a user gesture.
     */
    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(console.error);
        }
    }

    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), this.reconnectInterval);
        } else {
            this.emit('maxReconnectAttemptsReached');
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const jsonString = JSON.stringify(data);
            const compressed = pako.deflate(jsonString);
            const uint8Array = new Uint8Array(compressed);
            this.socket.send(uint8Array);
        } else {
            this.emit('error', { type: 'send_error', message: 'WebSocket is not open' });
        }
    }

    sendRagflowQuery(message, quote = false, docIds = null) {
        this.send({ type: 'ragflowQuery', message, quote, docIds });
    }

    sendOpenAIQuery(message) {
        this.send({ type: 'openaiQuery', message });
    }

    toggleTTS(useOpenAI) {
        this.ttsMethod = useOpenAI ? 'openai' : 'sonata';
        this.send({ type: 'setTTSMethod', method: this.ttsMethod });
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'audio':
                this.handleAudioData(data.audio);
                break;
            case 'answer':
                this.emit('ragflowAnswer', data.answer);
                break;
            case 'error':
                this.emit('error', { type: 'server_error', message: data.message });
                break;
            case 'graphUpdate':
                this.emit('graphUpdate', data.graphData);
                break;
            case 'ttsMethodSet':
                this.emit('ttsMethodSet', data.method);
                break;
            case 'ragflowResponse':
                this.handleRagflowResponse(data);
                break;
            case 'openaiResponse':
                this.emit('openaiResponse', data.response);
                break;
            case 'initialData':
                this.emit('initialData', data.data);
                break;
            default:
                console.warn('Unhandled message type:', data.type);
                break;
        }
    }
}
