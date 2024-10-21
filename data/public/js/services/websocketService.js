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

        console.log(`Attempting to connect to WebSocket at: ${url}`);
        this.socket.binaryType = 'arraybuffer'; // Ensure binaryType is set to arraybuffer for binary messages

        this.socket.onopen = () => {
            this.reconnectAttempts = 0;
            this.emit('open');
            this.send({ type: 'setTTSMethod', method: this.ttsMethod });
            this.getInitialData();
            console.log('WebSocket connection established');
        };

        this.socket.onmessage = (event) => {
            try {
                let data;
                if (event.data instanceof ArrayBuffer) {
                    console.log('Received binary message, length:', event.data.byteLength);
                    const decompressed = pako.inflate(new Uint8Array(event.data), { to: 'string' });
                    data = JSON.parse(decompressed);
                } else {
                    console.log('Received text message, length:', event.data.length);
                    data = JSON.parse(event.data);
                }
                console.log('Received message from server:', data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                console.error('Raw message:', event.data);
                this.emit('error', { type: 'parse_error', message: error.message, rawData: event.data });
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', { type: 'connection_error', message: error.message });
        };

        this.socket.onclose = (event) => {
            console.log('WebSocket connection closed', event);
            this.emit('close', event);
            this.reconnect();
        };
    }

    /**
     * Attempts to reconnect the WebSocket connection with exponential backoff.
     */
    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts += 1;
            const timeout = this.reconnectInterval * this.reconnectAttempts;
            console.log(`Reconnecting in ${timeout / 1000} seconds...`);
            setTimeout(() => {
                console.log('Reconnecting to WebSocket...');
                this.connect();
            }, timeout);
        } else {
            console.error('Max reconnect attempts reached. Giving up.');
            this.emit('error', { type: 'reconnect_failed', message: 'Max reconnect attempts reached.' });
        }
    }

    /**
     * Sends data to the server after compressing it using gzip.
     * @param {Object} data - The data object to send.
     */
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                const jsonString = JSON.stringify(data);
                console.log('Sending raw message:', jsonString);
                console.log('Raw message length:', jsonString.length);
                const compressed = pako.deflate(jsonString);
                console.log('Compressed message length:', compressed.length);
                this.socket.send(compressed.buffer);
                console.log('Message sent');
            } catch (error) {
                console.error('Error compressing/sending message:', error);
                this.emit('error', { type: 'send_error', message: error.message });
            }
        } else {
            console.error('WebSocket is not open. Current state:', this.socket ? this.socket.readyState : 'null');
            this.emit('error', { type: 'send_error', message: 'WebSocket is not open' });
        }
    }

    /**
     * Sends a Ragflow query to the server.
     * @param {String} message - The message content.
     * @param {Boolean} quote - Whether to quote the message.
     * @param {Array|null} docIds - Optional document IDs.
     */
    sendRagflowQuery(message, quote = false, docIds = null) {
        this.send({ type: 'ragflowQuery', message, quote, docIds });
    }

    /**
     * Sends an OpenAI query to the server.
     * @param {String} message - The message content.
     */
    sendOpenAIQuery(message) {
        this.send({ type: 'openaiQuery', message });
    }

    /**
     * Toggles the Text-to-Speech (TTS) method between OpenAI and Sonata.
     * @param {Boolean} useOpenAI - Whether to use OpenAI for TTS.
     */
    toggleTTS(useOpenAI) {
        this.ttsMethod = useOpenAI ? 'openai' : 'sonata';
        this.send({ type: 'setTTSMethod', method: this.ttsMethod });
    }

    /**
     * Handles messages received from the server.
     * @param {Object} data - The message data.
     */
    handleServerMessage(data) {
        console.log('Received message from server:', data);
        switch (data.type) {
            case 'audio':
                this.handleAudioData(data.audio);
                break;
            case 'answer':
                this.emit('ragflowAnswer', data.answer);
                break;
            case 'error':
                console.error('Server error:', data.message);
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

    /**
     * Converts a base64 string to a Blob.
     * @param {String} base64 - The base64 string.
     * @param {String} contentType - The MIME type of the data.
     * @returns {Blob} - The resulting Blob.
     */
    base64ToBlob(base64, contentType = '') {
        const byteCharacters = atob(base64);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        return new Blob(byteArrays, { type: contentType });
    }

    /**
     * Handles audio data received from the server.
     * @param {String} audioBase64 - The base64-encoded audio data.
     */
    handleAudioData(audioBase64) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const audioBlob = this.base64ToBlob(audioBase64, 'audio/wav');
        const reader = new FileReader();

        reader.onload = (event) => {
            this.audioContext.decodeAudioData(event.target.result, (buffer) => {
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioContext.destination);
                source.start(0);
            }, (error) => {
                console.error('Error decoding audio data:', error);
            });
        };

        reader.readAsArrayBuffer(audioBlob);
    }

    /**
     * Handles Ragflow-specific responses from the server.
     * @param {Object} data - The Ragflow response data.
     */
    handleRagflowResponse(data) {
        this.emit('ragflowAnswer', data.answer);
        if (data.audio) {
            this.handleAudioData(data.audio);
        }
    }

    /**
     * Retrieves initial data from the server after connection.
     */
    getInitialData() {
        this.send({ type: 'getInitialData' });
    }

    /**
     * Registers an event listener for a specific event type.
     * @param {String} event - The event type.
     * @param {Function} callback - The callback function.
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Emits an event to all registered listeners for that event type.
     * @param {String} event - The event type.
     * @param {Any} data - The data to pass to the listeners.
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }
}
