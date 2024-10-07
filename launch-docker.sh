#!/bin/bash

set -eo pipefail

# Configuration
CONTAINER_NAME="logseqXR"
IMAGE_NAME="logseq-xr-image"
HOST_IP="192.168.0.51"
HOST_PORT="8443"
CONTAINER_PORT="8443"
GRPC_PORT="50051"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    printf "${!1}%s${NC}\n" "$2"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_color "RED" "Error: Docker is not running. Please start Docker and try again."
        exit 1
    fi
}


# Function to stop and remove existing container
cleanup_container() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_color "YELLOW" "Stopping and removing existing ${CONTAINER_NAME} container..."
        docker stop ${CONTAINER_NAME} > /dev/null 2>&1 || true
        docker rm -v ${CONTAINER_NAME} > /dev/null 2>&1 || true
    fi
}

# Function to build Docker image
build_image() {
    print_color "GREEN" "Building Docker image..."
    if ! docker build --no-cache --progress=plain -t ${IMAGE_NAME} .; then
        print_color "RED" "Docker build failed. Please check the error messages above."
        exit 1
    fi
}

# Function to check .env file
check_env_file() {
    if [ ! -f .env ]; then
        print_color "RED" "Error: .env file not found. Please create a .env file with the necessary environment variables."
        exit 1
    fi
}

# Function to run Docker container
run_container() {
    print_color "GREEN" "Running Docker container with NVIDIA runtime..."
    if ! docker run -d --name ${CONTAINER_NAME} \
      --gpus all \
      --runtime=nvidia \
      -v "$(pwd)/data/markdown:/app/data/markdown" \
      -p ${HOST_PORT}:${CONTAINER_PORT} \
      -p ${GRPC_PORT}:${GRPC_PORT} \
      --env-file .env \
      ${IMAGE_NAME}; then
        print_color "RED" "Failed to start Docker container. Please check the error messages above."
        exit 1
    fi
}

# Function to display access information
display_info() {
    print_color "GREEN" "Docker container is now running with NVIDIA acceleration."
    print_color "YELLOW" "Access the application at https://${HOST_IP}:${HOST_PORT}"
    print_color "YELLOW" "WebSocket should be available at wss://${HOST_IP}:${HOST_PORT}/ws"
    print_color "YELLOW" "gRPC should be available at ${HOST_IP}:${GRPC_PORT}"
    print_color "YELLOW" "Note: You may see a security warning in your browser due to the self-signed certificate. This is expected for local development."
}

# Main execution
check_docker
cleanup_container
build_image
check_env_file
run_container
display_info

# Display container logs
print_color "GREEN" "Container logs:"
docker logs -f ${CONTAINER_NAME}
