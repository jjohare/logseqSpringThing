#!/bin/bash

set -e

# Define the container name
CONTAINER_NAME="logseqXR"
echo $CONTAINER_NAME

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create a .env file with the necessary environment variables."
    echo "You can use .env_template as a reference."
    exit 1
fi

# Stop and remove existing container, including associated volumes
docker stop $CONTAINER_NAME >/dev/null 2>&1 || true
docker rm -v $CONTAINER_NAME >/dev/null 2>&1 || true

# Build the Docker image
echo "Building Docker image..."
if ! docker build -t logseq-xr-image .; then
    echo "Docker build failed. Please check the error messages above."
    exit 1
fi

# Ensure data/markdown directory exists
mkdir -p data/markdown

# Run the Docker container with GPU 0 enabled, correct environment variables, and volume mounts
echo "Running Docker container..."
if ! docker run -d \
    --name $CONTAINER_NAME \
    --gpus all \
    -v "$(pwd)/data/markdown:/app/data/markdown" \
    -v "$(pwd)/settings.toml:/app/settings.toml" \
    -p 8443:8443 \
    --env-file .env \
    logseq-xr-image; then
    echo "Failed to start Docker container. Please check the error messages above."
    exit 1
fi

echo "Docker container is now running."
echo "Access the application at https://192.168.0.51:8443"
echo "WebSocket should be available at https://192.168.0.51:8443/ws"
echo "Note: You may see a security warning in your browser due to the self-signed certificate. This is expected for local development."

# Display container logs
echo "Container logs:"
docker logs -f $CONTAINER_NAME
