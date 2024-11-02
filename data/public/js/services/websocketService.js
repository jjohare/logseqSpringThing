// WebSocket service for handling real-time communication
import pako from 'pako';

export default class WebsocketService {
    constructor() {
        this.socket = null;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioQueue = [];
        this.isPlaying = false;
        this.COMPRESSION_MAGIC = new Uint8Array([67, 79, 77, 80]); // "COMP" in ASCII
        this.connect();
    }

    getWebSocketUrl() {
        // Always use wss:// since nginx is handling SSL on 8443
        const host = window.location.hostname;
        return `wss://${host}:8443/ws`;
    }

    connect() {
        const url = this.getWebSocketUrl();
        console.log('Attempting to connect to WebSocket at:', url);
        this.socket = new WebSocket(url);
        this.socket.binaryType = 'arraybuffer';  // Set to handle binary data

        this.socket.onopen = () => {
            console.log('WebSocket connection established');
            this.reconnectAttempts = 0;
            this.emit('open');
            
            // Request initial graph data and settings
            this.send({ type: 'get_initial_data' });
        };

        this.socket.onmessage = async (event) => {
            try {
                let data;
                if (event.data instanceof ArrayBuffer) {
                    // Handle binary data (might be compressed)
                    const decompressed = this.decompressMessage(event.data);
                    data = JSON.parse(decompressed);
                    console.log('Received message:', data);
                } else {
                    // Handle regular JSON messages
                    data = JSON.parse(event.data);
                    console.log('Received JSON message:', data);
                }
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
                console.error('Raw message:', event.data);
                this.emit('error', { 
                    type: 'parse_error', 
                    message: error.message, 
                    rawData: event.data 
                });
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };

        this.socket.onclose = () => {
            console.log('WebSocket connection closed.');
            this.emit('close');
            this.reconnect();
        };
    }

    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectInterval / 1000} seconds...`);
            setTimeout(() => this.connect(), this.reconnectInterval);
        } else {
            console.error('Max reconnection attempts reached. Please refresh the page or check your connection.');
            this.emit('maxReconnectAttemptsReached');
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('Sending WebSocket message:', data);
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket is not open. Unable to send message:', data);
            this.emit('error', { type: 'send_error', message: 'WebSocket is not open' });
        }
    }

    on(event, callback) {
        if (typeof callback !== 'function') {
            console.error('Invalid callback provided for event:', event);
            return;
        }
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                if (typeof callback === 'function') {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in listener for event '${event}':`, error);
                    }
                } else {
                    console.warn(`Invalid listener for event '${event}':`, callback);
                }
            });
        }
    }

    hasCompressionHeader(data) {
        if (data.length < this.COMPRESSION_MAGIC.length) return false;
        for (let i = 0; i < this.COMPRESSION_MAGIC.length; i++) {
            if (data[i] !== this.COMPRESSION_MAGIC[i]) return false;
        }
        return true;
    }

    logBytes(data, label) {
        const hex = Array.from(data)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
        const ascii = Array.from(data)
            .map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')
            .join('');
        console.log(`${label} (${data.length} bytes):`);
        console.log('Hex:', hex);
        console.log('ASCII:', ascii);
    }

    decompressMessage(compressed) {
        try {
            const data = new Uint8Array(compressed);
            this.logBytes(data.slice(0, Math.min(32, data.length)), 'First 32 bytes of message');
            
            // Try parsing as JSON first (uncompressed message)
            try {
                const text = new TextDecoder().decode(data);
                const json = JSON.parse(text);
                console.log('Successfully parsed as uncompressed JSON:', json);
                return text;
            } catch (e) {
                console.log('Not valid JSON, trying decompression...');
            }

            // Check for compression magic header
            const headerBytes = data.slice(0, this.COMPRESSION_MAGIC.length);
            this.logBytes(headerBytes, 'Header bytes');
            
            if (!this.hasCompressionHeader(data)) {
                console.log('No compression header found, trying raw decompression');
                try {
                    // Use raw inflate to match miniz_oxide format
                    const decompressed = pako.inflate(data, { raw: true });
                    const text = new TextDecoder().decode(decompressed);
                    console.log('Successfully decompressed without header:', text);
                    return text;
                } catch (e) {
                    console.error('Failed to decompress without header:', e);
                    throw e;
                }
            }

            // Skip the magic header and decompress the rest
            const compressedData = data.slice(this.COMPRESSION_MAGIC.length);
            this.logBytes(compressedData.slice(0, Math.min(32, compressedData.length)), 'First 32 bytes of compressed data');
            
            // Use raw inflate to match miniz_oxide format
            const decompressed = pako.inflate(compressedData, { raw: true });
            const text = new TextDecoder().decode(decompressed);
            console.log('Successfully decompressed with header:', text);
            return text;
        } catch (error) {
            console.error('Error in decompressMessage:', error);
            // Log the entire buffer for debugging
            const fullData = new Uint8Array(compressed);
            this.logBytes(fullData, 'Full message content');
            throw error;
        }
    }

    handleServerMessage(data) {
        console.log('Handling server message:', data);
        
        // First emit the raw message for any listeners that need it
        this.emit('message', data);
        
        // Then handle specific message types
        switch (data.type) {
            case 'initial_data':
                console.log('Received initial data:', data);
                if (data.graph_data) {
                    this.emit('graphUpdate', { graphData: data.graph_data });
                }
                if (data.settings) {
                    window.dispatchEvent(new CustomEvent('serverSettings', {
                        detail: data.settings
                    }));
                }
                break;
                
            case 'graph_update':
                console.log('Received graph update:', data.graph_data);
                if (data.graph_data) {
                    this.emit('graphUpdate', { graphData: data.graph_data });
                }
                break;
                
            case 'audio':
                this.handleAudioData(data.audio);
                break;
                
            case 'answer':
                this.emit('ragflowAnswer', data.answer);
                break;
                
            case 'error':
                this.emit('error', { type: 'server_error', message: data.message });
                break;
                
            case 'ragflowResponse':
                this.handleRagflowResponse(data);
                break;
                
            case 'openaiResponse':
                this.emit('openaiResponse', data.response);
                break;
                
            case 'simulation_mode_set':
                console.log('Simulation mode set:', data.mode);
                this.emit('simulationModeSet', data.mode);
                break;
                
            default:
                console.warn('Unhandled message type:', data.type);
                break;
        }
    }

    handleRagflowResponse(data) {
        console.log('Handling RAGFlow response:', data);
        this.emit('ragflowAnswer', data.answer);
        if (data.audio) {
            const audioBlob = this.base64ToBlob(data.audio, 'audio/wav');
            this.handleAudioData(audioBlob);
        } else {
            console.warn('No audio data in RAGFlow response');
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
            console.log('Audio Blob size:', audioBlob.size);
            console.log('Audio Blob type:', audioBlob.type);
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log('ArrayBuffer size:', arrayBuffer.byteLength);
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

    async decodeWavData(wavData) {
        return new Promise((resolve, reject) => {
            console.log('WAV data size:', wavData.byteLength);
            const dataView = new DataView(wavData);
            const firstBytes = Array.from(new Uint8Array(wavData.slice(0, 16)))
                .map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log('First 16 bytes:', firstBytes);

            const header = new TextDecoder().decode(wavData.slice(0, 4));
            console.log('Header:', header);
            if (header !== 'RIFF') {
                console.error('Invalid WAV header:', header);
                return reject(new Error(`Invalid WAV header: ${header}`));
            }

            this.audioContext.decodeAudioData(
                wavData,
                (buffer) => {
                    console.log('Audio successfully decoded:', buffer);
                    resolve(buffer);
                },
                (error) => {
                    console.error('Error in decodeAudioData:', error);
                    reject(new Error(`Error decoding WAV data: ${error}`));
                }
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

    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext initialized');
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext resumed');
            }).catch((error) => {
                console.error('Error resuming AudioContext:', error);
            });
        } else {
            console.log('AudioContext already initialized');
        }
    }

    setSimulationMode(mode) {
        this.send({
            type: 'set_simulation_mode',
            mode: mode
        });
    }

    sendRagflowQuery(message, quote = false, docIds = null) {
        this.send({
            type: 'ragflowQuery',
            message,
            quote,
            docIds
        });
    }

    sendOpenAIQuery(message) {
        this.send({
            type: 'openaiQuery',
            message
        });
    }

    sendChatMessage({ message, useOpenAI }) {
        if (useOpenAI) {
            this.sendOpenAIQuery(message);
        } else {
            this.sendRagflowQuery(message);
        }
    }
}
