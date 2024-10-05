// public/js/services/websocketService.js

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
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.connect();
    }

    /**
     * Establishes a WebSocket connection to the server.
     */
    connect() {
        // Use the specific WebSocket URL
        const url = 'wss://192.168.0.51:8443/ws';
        console.log('Attempting to connect to WebSocket at:', url);
        this.socket = new WebSocket(url);

        // WebSocket open event
        this.socket.onopen = () => {
            console.log('WebSocket connection established');
            this.reconnectAttempts = 0;
            this.emit('open');
        };

        // WebSocket message event
        this.socket.onmessage = (event) => {
            console.log('Received WebSocket message:', event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ragflowResponse' && data.audio_path) {
                    this.handleAudioMessage(data.audio_path);
                }
                this.emit('message', data);
            } catch (err) {
                console.error('Error parsing WebSocket message:', err);
                console.error('Raw message:', event.data);
                this.emit('error', { type: 'parse_error', message: err.message, rawData: event.data });
            }
        };

        // WebSocket error event
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };

        // WebSocket close event with reconnection logic
        this.socket.onclose = () => {
            console.log('WebSocket connection closed.');
            this.emit('close');
            this.reconnect();
        };
    }

    /**
     * Handles incoming audio message.
     * @param {string} audioPath - The path to the audio file.
     */
    async handleAudioMessage(audioPath) {
        if (!this.audioContext) {
            console.warn('AudioContext not initialized. Call initAudio() first.');
            return;
        }

        try {
            const response = await fetch(audioPath);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.decodeAudioData(arrayBuffer);
            this.audioQueue.push(audioBuffer);
            if (!this.isPlaying) {
                this.playNextAudio();
            }
        } catch (error) {
            console.error('Error processing audio data:', error);
            this.emit('error', { type: 'audio_processing_error', message: error.message });
        }
    }

    /**
     * Decodes audio data into an AudioBuffer.
     * @param {ArrayBuffer} audioData - The audio data as an ArrayBuffer.
     * @returns {Promise<AudioBuffer>} The decoded AudioBuffer.
     */
    async decodeAudioData(audioData) {
        return new Promise((resolve, reject) => {
            this.audioContext.decodeAudioData(audioData, 
                (buffer) => resolve(buffer),
                (error) => reject(new Error(`Error decoding audio data: ${error}`))
            );
        });
    }

    /**
     * Plays the next audio buffer in the queue.
     */
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
     * Initializes the AudioContext. This should be called after a user interaction.
     */
    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    /**
     * Attempts to reconnect to the WebSocket server.
     */
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

    /**
     * Registers an event listener for a specific event type.
     * @param {string} event - The event type.
     * @param {function} callback - The callback function to execute when the event occurs.
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Emits an event to all registered listeners.
     * @param {string} event - The event type.
     * @param {any} data - The data associated with the event.
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    /**
     * Sends data to the server via WebSocket.
     * @param {object} data - The data to send.
     */
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket is not open. Unable to send message:', data);
            this.emit('error', { type: 'send_error', message: 'WebSocket is not open' });
        }
    }
}
