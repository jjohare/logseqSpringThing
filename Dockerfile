# Stage 1: Build the Frontend
FROM node:latest AS frontend-builder

WORKDIR /app

# Copy package files and vite config
COPY package.json pnpm-lock.yaml ./ 
COPY vite.config.js ./ 

# Copy the public assets
COPY data ./data

# Install pnpm globally
RUN npm install -g pnpm

# Clean PNPM store and install dependencies
RUN pnpm install 

# Build the frontend (this will output to /app/data/dist)
RUN pnpm run build

# Ensure the dist directory is created in the correct location and copy files
RUN mkdir -p /app/data/public/dist && \
    cp -R /app/data/dist/* /app/data/public/dist/ || true

# Stage 2: Build the Rust Backend and Sonata TTS
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04 AS backend-builder

# Install necessary dependencies for building Rust applications and Sonata
RUN apt-get update && apt-get install -y \
    build-essential \
    gnupg2 \
    curl \
    libssl-dev \
    pkg-config \
    libvulkan1 \
    libvulkan-dev \
    vulkan-tools \
    libegl1-mesa-dev \
    libasound2-dev \
    libclang-dev \
    llvm-dev \
    speech-dispatcher \
    libspeechd-dev \
    libespeak-ng1 \
    libespeak-ng-dev \
    espeak-ng \
    git \
    cmake \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Set LIBCLANG_PATH
ENV LIBCLANG_PATH=/usr/lib/llvm-14/lib

# Install Rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the default toolchain to stable
RUN rustup default stable

WORKDIR /usr/src/app

# Copy the Cargo.toml and Cargo.lock files
COPY Cargo.toml Cargo.lock ./ 

# Copy the source code and build script
COPY src ./src 
COPY build.rs ./

# Copy settings.toml
COPY settings.toml ./ 

# Build the Rust application in release mode for optimized performance
RUN cargo build --release

# Stage 3: Create the Final Image
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Set environment variable to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary runtime dependencies and nginx
RUN apt-get update && apt-get install -y \
    curl \
    libssl3 \
    nginx \
    openssl \
    libvulkan1 \
    libegl1-mesa \
    libasound2 \
    speech-dispatcher \
    libspeechd2 \
    libespeak-ng1 \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/data/public/dist /app/data/markdown /app/src /app/data/audio /app/piper

# Copy the built Rust binary from the backend-builder stage
COPY --from=backend-builder /usr/src/app/target/release/webxr-graph /app/webxr-graph

# Copy the built frontend files from the frontend-builder stage
COPY --from=frontend-builder /app/data/public/dist /app/data/public/dist

# Copy settings.toml from the backend-builder stage
COPY --from=backend-builder /usr/src/app/settings.toml /app/settings.toml
COPY --from=backend-builder /usr/src/app/settings.toml /app/data/public/dist/settings.toml

# Download Sonata voice model and config
RUN curl -L https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx -o /app/piper/en_GB-northern_english_male-medium.onnx && \
    curl -L https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx.json -o /app/piper/en_GB-northern_english_male-medium.onnx.json

# Set up a persistent volume for Markdown files to ensure data persistence
VOLUME ["/app/data/markdown"]

# Create directory for SSL certificates
RUN mkdir -p /etc/nginx/ssl

# Generate self-signed SSL certificate
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/selfsigned.key \
    -out /etc/nginx/ssl/selfsigned.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Ensure proper permissions for nginx and application directories
RUN chown -R www-data:www-data /var/lib/nginx /app

# Expose HTTPS port and Sonata TTS gRPC port
EXPOSE 8443 50051

# Set environment variables
ENV TTS_LANGUAGE=en_GB
ENV TTS_VOICE_TYPE=northern_english_male
ENV TTS_MODEL_PATH=/app/piper/en_GB-northern_english_male-medium.onnx
ENV TTS_SETUP_PATH=/app/piper/en_GB-northern_english_male-medium.onnx.json
ENV TTS_SERVER_ADDR=[::]:50051
ENV AUDIO_DIR=/app/data/audio
ENV SERVER_ADDR=0.0.0.0:8080

# Create a startup script that runs nginx and the Rust application
RUN echo '#!/bin/bash\nset -e\nnginx\nexec /app/webxr-graph' > /app/start.sh && chmod +x /app/start.sh

# Set the command to run the startup script
CMD ["/app/start.sh"]
