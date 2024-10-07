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
FROM nvidia/cuda:11.8.0-devel-ubuntu22.04 AS backend-builder

# Set environment variables
ENV ROCKET_ENV=production
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C target-cpu=x86-64"
ENV SONATA_ESPEAKNG_DATA_DIRECTORY="/usr/src/app/src/sonata/deps/dev"
ENV RUST_BACKTRACE=1

# Create app directory
WORKDIR /usr/src/app

# Install necessary dependencies for building Rust applications and Sonata
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libssl-dev \
    pkg-config \
    libvulkan1 \
    libvulkan-dev \
    vulkan-tools \
    libegl1-mesa-dev \
    speech-dispatcher \
    libspeechd-dev \
    libespeak-ng1 \
    libespeak-ng-dev \
    espeak-ng \
    wget \
    curl \
    git \
    software-properties-common \
    libasound2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install LLVM 18 and Clang 18
RUN wget https://apt.llvm.org/llvm.sh && \
    chmod +x llvm.sh && \
    ./llvm.sh 18 && \
    apt-get update && \
    apt-get install -y clang-18 libclang-18-dev && \
    rm -rf /var/lib/apt/lists/*

# Set LIBCLANG_PATH, LLVM_CONFIG_PATH, and PKG_CONFIG_PATH
ENV LIBCLANG_PATH=/usr/lib/llvm-18/lib
ENV LLVM_CONFIG_PATH=/usr/bin/llvm-config-18
ENV LD_LIBRARY_PATH=/usr/lib/llvm-18/lib:$LD_LIBRARY_PATH
ENV PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:$PKG_CONFIG_PATH

# Verify libclang.so exists
RUN ls -l $LIBCLANG_PATH/libclang.so* || echo "libclang.so not found in $LIBCLANG_PATH"

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Update Rust and install additional components
RUN rustup update && rustup component add rustfmt clippy

# Copy the top-level Cargo.toml and Cargo.lock
COPY Cargo.toml Cargo.lock ./

# Copy the entire src directory, excluding the sonata-python directory
COPY src/ ./src/
RUN rm -rf ./src/sonata/sonata-python

# Verify the presence of necessary files
RUN if [ ! -d ./src/sonata ] || [ ! -d ./src/sonata/sonata/core ] || [ ! -d ./src/sonata/sonata/synth ]; then \
        echo "Required sonata directories not found" && exit 1; \
    fi

# Update Rust dependencies
RUN cargo update

# Clean Cargo cache
RUN cargo clean

# Build the Rust application in release mode for optimized performance
RUN cargo build --release --verbose

# Stage 3: Create the Final Image
FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04

# Set environment variable to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary runtime dependencies and nginx
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    nginx \
    libespeak-ng1 \
    espeak-ng \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/data/public/dist /app/data/markdown /app/src /app/data/audio /app/models

# Copy the built Rust binary from the backend-builder stage
COPY --from=backend-builder /usr/src/app/target/release/webxr-graph /app/webxr-graph

# Copy the built frontend files from the frontend-builder stage
COPY --from=backend-builder /app/data/public/dist /app/data/public/dist

# Copy settings.toml from the backend-builder stage
COPY --from=backend-builder /usr/src/app/settings.toml /app/settings.toml
COPY --from=backend-builder /usr/src/app/settings.toml /app/data/public/dist/settings.toml

# Copy Sonata models and necessary data
COPY --from=backend-builder /usr/src/app/models /app/models

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
ENV TTS_MODEL_PATH=/app/models/en_GB-northern_english_male-medium.onnx
ENV TTS_SETUP_PATH=/app/models/en_GB-northern_english_male-medium.onnx.json
ENV TTS_SERVER_ADDR=[::]:50051
ENV AUDIO_DIR=/app/data/audio
ENV SERVER_ADDR=0.0.0.0:8080
ENV SONATA_ESPEAKNG_DATA_DIRECTORY=/app/espeak-ng-data

# Copy espeak-ng data
COPY --from=backend-builder /usr/src/app/src/sonata/espeak-phonemizer/espeak-ng-data /app/espeak-ng-data

# Create a startup script that runs nginx and the Rust application
RUN echo '#!/bin/bash\nset -e\nnginx\nexec /app/webxr-graph' > /app/start.sh && chmod +x /app/start.sh

# Set the command to run the startup script
CMD ["/app/start.sh"]
