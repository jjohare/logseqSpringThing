# Stage 1: Build the Frontend
FROM node:latest AS frontend-builder

WORKDIR /app

# Copy package files, vite config, and the entire data directory
COPY package.json pnpm-lock.yaml vite.config.js ./
COPY data ./data

# Install pnpm globally
RUN npm install -g pnpm

# Clean PNPM store and install dependencies
RUN pnpm install

# Build the frontend (this will output to /app/data/dist)
RUN pnpm run build

# Stage 2: Build the Rust Backend
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04 AS backend-builder

# Install necessary dependencies for building Rust applications
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
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the default toolchain to stable
RUN rustup default stable

WORKDIR /usr/src/app

# Copy the Cargo.toml and Cargo.lock files
COPY Cargo.toml Cargo.lock ./

# Copy the source code and settings
COPY src ./src
COPY settings.toml ./settings.toml

# Build the Rust application in release mode for optimized performance
RUN cargo build --release

# Stage 3: Create the Final Image
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Set environment variable to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary runtime dependencies, nginx, GPU libraries, and Python 3.10
RUN apt-get update && apt-get install -y \
    curl \
    libssl3 \
    nginx \
    openssl \
    libvulkan1 \
    libegl1-mesa \
    libasound2 \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y python3.10 python3.10-venv python3.10-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/data/public/dist /app/data/markdown /app/src /app/data/piper

# Create an empty metadata.json file
RUN mkdir -p /app/data/markdown && touch /app/data/markdown/metadata.json && echo "{}" > /app/data/markdown/metadata.json

# Copy topics.csv file into the container
COPY data/topics.csv /app/data/topics.csv

# Copy the local piper voice model
COPY data/piper/en_GB-northern_english_male-medium.onnx /app/data/piper/en_GB-northern_english_male-medium.onnx

# Copy the built Rust binary from the backend-builder stage
COPY --from=backend-builder /usr/src/app/target/release/webxr-graph /app/webxr-graph

# Copy settings.toml from the builder stage
COPY --from=backend-builder /usr/src/app/settings.toml /app/settings.toml

# Copy the built frontend files from the frontend-builder stage
COPY --from=frontend-builder /app/data/dist /app/data/public/dist

# Copy the generate_audio.py script
COPY src/generate_audio.py /app/src/generate_audio.py

# Set up a persistent volume for Markdown files to ensure data persistence
VOLUME ["/app/data/markdown"]

# Create directory for SSL certificates
RUN mkdir -p /etc/nginx/ssl

# Generate self-signed SSL certificate
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/selfsigned.key \
    -out /etc/nginx/ssl/selfsigned.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=192.168.0.51"

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Ensure proper permissions for nginx and application directories
RUN chown -R www-data:www-data /var/lib/nginx /app

# Create Python virtual environment and install Piper TTS
RUN python3.10 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Upgrade pip, install wheel, and then install Piper TTS and its dependencies
RUN pip install --upgrade pip wheel && \
    pip install --upgrade piper-phonemize==1.1.0 && \
    pip install --upgrade piper-tts==1.2.0 onnxruntime-gpu

# Expose HTTPS port
EXPOSE 8443

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
# Ensure metadata.json exists\n\
if [ ! -f /app/data/markdown/metadata.json ]; then\n\
    echo "{}" > /app/data/markdown/metadata.json\n\
fi\n\
# Start nginx\n\
nginx\n\
# Start the Rust application\n\
exec /app/webxr-graph' > /app/start.sh && chmod +x /app/start.sh

# Set the command to run the startup script
CMD ["/app/start.sh"]
