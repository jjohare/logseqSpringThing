// public/js/services/websocketService.js

/**
 * WebsocketService handles the WebSocket connection and communication with the server.
 */
class WebsocketService {
    constructor() {
        this.socket = null;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000; // 5 seconds
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioQueue = [];
        this.isPlaying = false;
        this.ttsMethod = 'sonata'; // Default TTS method
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
            // Optionally inform server of the default TTS method
            this.send({
                type: 'setTTSMethod',
                method: this.ttsMethod
            });
        };

        // WebSocket message event
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit('message', data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                console.error('Raw message:', event.data);
                // Emit an error event that can be handled elsewhere
                this.emit('error', { type: 'parse_error', message: error.message, rawData: event.data });
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
     * Handles the RAGFlow response containing both text and audio data.
     * @param {Object} data - The response data containing answer and audio.
     */
    handleRagflowResponse(data) {
        console.log('Handling RAGFlow response:', data);
        
        // Emit the text answer
        this.emit('ragflowAnswer', data.answer);

        // Handle the audio data
        if (data.audio) {
            const audioBlob = this.base64ToBlob(data.audio, 'audio/wav');
            this.handleAudioData(audioBlob);
        } else {
            console.warn('No audio data in RAGFlow response');
        }
    }

    /**
     * Converts a base64 string to a Blob.
     * @param {string} base64 - The base64 encoded string.
     * @param {string} mimeType - The MIME type of the data.
     * @returns {Blob} The resulting Blob.
     */
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    /**
     * Handles incoming audio data.
     * @param {Blob} audioBlob - The audio data as a Blob.
     */
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

    /**
     * Decodes WAV data into an AudioBuffer.
     * @param {ArrayBuffer} wavData - The WAV data as an ArrayBuffer.
     * @returns {Promise<AudioBuffer>} The decoded AudioBuffer.
     */
    async decodeWavData(wavData) {
        return new Promise((resolve, reject) => {
            // Log the size and first few bytes of the wavData
            console.log('WAV data size:', wavData.byteLength);
            const dataView = new DataView(wavData);
            const firstBytes = Array.from(new Uint8Array(wavData.slice(0, 16))).map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log('First 16 bytes:', firstBytes);

            // Check if the data starts with the WAV header "RIFF"
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

    /**
     * Sends a RAGFlow query to the server.
     * @param {string} message - The message to send.
     * @param {boolean} quote - Whether to include quotes.
     * @param {string[]} docIds - Document IDs to reference.
     */
    sendRagflowQuery(message, quote = false, docIds = null) {
        this.send({
            type: 'ragflowQuery',
            message,
            quote,
            docIds
        });
    }

    /**
     * Sends an OpenAI query to the server.
     * @param {string} message - The message to send.
     */
    sendOpenAIQuery(message) {
        this.send({
            type: 'openaiQuery',
            message
        });
    }

    toggleTTS(useOpenAI) {
        this.ttsMethod = useOpenAI ? 'openai' : 'sonata';
        this.send({
            type: 'setTTSMethod',
            method: this.ttsMethod
        });
    }

    handleServerMessage(data) {
        console.log('Received server message:', data);
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
                console.log('TTS method set to:', data.method);
                this.emit('ttsMethodSet', data.method);
                break;
            case 'ragflowResponse':
                this.handleRagflowResponse(data);
                break;
            case 'openaiResponse':
                this.emit('openaiResponse', data.response);
                break;
            default:
                console.warn('Unhandled message type:', data.type);
                break;
        }
    }
}

export default WebsocketService;
