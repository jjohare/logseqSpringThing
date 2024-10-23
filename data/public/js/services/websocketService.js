import pako from 'pako';

export class WebsocketService {
    constructor() {
        this.socket = null;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000;
        this.audioContext = null;
        this.ttsMethod = 'piper';
        this.openAIApiKey = null;
        this.connect();
    }

    connect() {
        try {
            // Construct WebSocket URL using current location
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const hostname = window.location.hostname || '192.168.0.51';
            const port = '8443';
            const url = `${protocol}//${hostname}:${port}/ws-external`;
            
            console.log('Connecting to WebSocket:', url);
            
            this.socket = new WebSocket(url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                console.log('WebSocket connection established');
                this.reconnectAttempts = 0;
                this.emit('open');
                this.send({ type: 'set_tts_method', method: this.ttsMethod });
                this.getInitialData();
            };

            this.socket.onmessage = this.handleMessage.bind(this);

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', { 
                    type: 'connection_error', 
                    message: 'WebSocket connection error',
                    details: error
                });
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket connection closed:', event.code, event.reason);
                this.emit('close', event);
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnect();
                }
            };
        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
            this.emit('error', {
                type: 'connection_error',
                message: 'Failed to create WebSocket connection',
                details: error
            });
        }
    }

    handleMessage(event) {
        try {
            let data;
            if (event.data instanceof ArrayBuffer) {
                const decompressed = pako.inflate(new Uint8Array(event.data), { raw: true });
                const textDecoder = new TextDecoder('utf-8');
                data = JSON.parse(textDecoder.decode(decompressed));
            } else {
                data = JSON.parse(event.data);
            }
            this.handleServerMessage(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            this.emit('error', { 
                type: 'parse_error', 
                message: 'Failed to parse server message', 
                details: error.message 
            });
        }
    }

    send(data) {
        if (this.isConnected()) {
            try {
                const snakeCaseData = this.convertKeysToSnakeCase(data);
                const jsonString = JSON.stringify(snakeCaseData);
                const compressed = pako.deflate(jsonString, { raw: true });
                this.socket.send(compressed.buffer);
            } catch (error) {
                console.error('Error sending message:', error);
                this.emit('error', { 
                    type: 'send_error', 
                    message: 'Failed to send message', 
                    details: error.message 
                });
            }
        } else {
            console.warn('WebSocket not connected. State:', this.getConnectionState());
            this.emit('error', { 
                type: 'send_error', 
                message: 'WebSocket is not open', 
                details: this.getConnectionState() 
            });
        }
    }

    convertKeysToSnakeCase(obj) {
        if (Array.isArray(obj)) {
            return obj.map(item => this.convertKeysToSnakeCase(item));
        } else if (obj !== null && typeof obj === 'object') {
            return Object.keys(obj).reduce((acc, key) => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                acc[snakeKey] = this.convertKeysToSnakeCase(obj[key]);
                return acc;
            }, {});
        }
        return obj;
    }

    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts += 1;
            const timeout = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`Attempting to reconnect in ${timeout}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connect(), timeout);
        } else {
            console.error('Max reconnection attempts reached');
            this.emit('error', { 
                type: 'reconnect_failed', 
                message: 'Failed to reconnect after multiple attempts' 
            });
        }
    }

    sendChatMessage(options) {
        const { message, use_openai } = options;
        this.send({ 
            type: 'chat_message',
            message,
            use_openai
        });
    }

    toggleTTS(useOpenAI) {
        this.ttsMethod = useOpenAI ? 'openai' : 'piper';
        this.send({ 
            type: 'set_tts_method',
            method: this.ttsMethod 
        });
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'ragflow_response':
                this.emit('ragflowResponse', data);
                break;
            case 'error':
                console.error('Server error:', data.message);
                this.emit('error', { 
                    type: 'server_error', 
                    message: data.message 
                });
                break;
            case 'graph_update':
                this.emit('graphUpdate', data.graph_data);
                break;
            case 'tts_method_set':
                this.emit('ttsMethodSet', data.method);
                break;
            case 'initial_data':
                this.emit('initialData', data.data);
                break;
            case 'openai_api_key':
                this.openAIApiKey = data.key;
                break;
            case 'simulation_update':
                this.emit('simulationUpdate', data.simulation_data);
                break;
            case 'layout_update':
                this.emit('layoutUpdate', data.layout_data);
                break;
            case 'audio_data':
                this.handleAudioData(data.audio_base64);
                break;
            default:
                console.warn('Unhandled message type:', data.type);
                this.emit('unhandledMessage', data);
                break;
        }
    }

    handleAudioData(audioBase64) {
        try {
            this.playAudio(audioBase64);
        } catch (error) {
            console.error('Error playing audio:', error);
            this.emit('error', { 
                type: 'audio_error', 
                message: 'Failed to play audio', 
                details: error.message 
            });
        }
    }

    playAudio(audioBase64) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const audioData = atob(audioBase64);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
            view[i] = audioData.charCodeAt(i);
        }

        this.audioContext.decodeAudioData(arrayBuffer, (buffer) => {
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
        }, (error) => {
            console.error('Error decoding audio data:', error);
            this.emit('error', { 
                type: 'audio_decode_error', 
                message: 'Failed to decode audio data', 
                details: error.message 
            });
        });
    }

    async generateAndPlayOpenAIAudio(text) {
        const apiKey = await this.getOpenAIApiKey();
        if (!apiKey) {
            console.error('OpenAI API key not available');
            this.emit('error', { 
                type: 'openai_key_error', 
                message: 'OpenAI API key not available' 
            });
            return;
        }

        try {
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'alloy'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            this.audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioContext.destination);
                source.start(0);
            }, (error) => {
                console.error('Error decoding audio data:', error);
                this.emit('error', { 
                    type: 'openai_audio_decode_error', 
                    message: 'Failed to decode OpenAI audio data', 
                    details: error.message 
                });
            });
        } catch (error) {
            console.error('Error generating OpenAI audio:', error);
            this.emit('error', { 
                type: 'openai_audio_error', 
                message: 'Failed to generate OpenAI audio', 
                details: error.message 
            });
        }
    }

    getInitialData() {
        this.send({ type: 'get_initial_data' });
    }

    on(event, callback) {
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
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    async getOpenAIApiKey() {
        if (!this.openAIApiKey) {
            try {
                const response = await fetch('/api/openai-key');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                this.openAIApiKey = data.openai_api_key;
            } catch (error) {
                console.error('Error fetching OpenAI API key:', error);
                this.emit('error', { 
                    type: 'openai_key_fetch_error', 
                    message: 'Failed to fetch OpenAI API key', 
                    details: error.message 
                });
            }
        }
        return this.openAIApiKey;
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    getConnectionState() {
        if (!this.socket) return 'CLOSED';
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        return states[this.socket.readyState];
    }
}
