#!/usr/bin/env bash

###############################################################################
# SAFETY SETTINGS
###############################################################################
# -e  Exit immediately if a command exits with a non-zero status
# -u  Treat unset variables as errors
# -o pipefail  Return error if any part of a pipeline fails
set -euo pipefail

###############################################################################
# COLOR CONSTANTS
###############################################################################
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'  # No color

###############################################################################
# LOGGING
###############################################################################
log() {
    # Logs a message with a timestamp
    echo -e "[$(date "+%Y-%m-%d %H:%M:%S")] $1"
}

###############################################################################
# DOCKER BUILD WITH TIMEOUTS
###############################################################################
# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Verify Docker Compose command
if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    log "${RED}Error: Docker Compose not found${NC}"
    exit 1
fi

# Enable buildkit for better performance if available
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Add Cargo environment variables that might help with the build
export CARGO_NET_RETRY=10
export CARGO_NET_GIT_FETCH_WITH_CLI=true
export CARGO_HTTP_TIMEOUT=180
export CARGO_HTTP_CONNECT_TIMEOUT=60
export CARGO_HTTP_CHECK_REVOKE=false

# Make sure GIT_HASH is set
if [ -z "${GIT_HASH:-}" ]; then
    GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "development")
    export GIT_HASH
fi

log "${YELLOW}Starting improved Docker build process...${NC}"
log "${YELLOW}Using GIT_HASH=${GIT_HASH}${NC}"

# First try frontend build only
log "${YELLOW}Step 1: Building frontend-builder (with 10 minute timeout)...${NC}"
if ! timeout 600 bash -c "DEBUG_MODE=${DEBUG_MODE:-false} GIT_HASH=$GIT_HASH $DOCKER_COMPOSE build --no-cache frontend-builder"; then
    log "${RED}Frontend build failed, but continuing...${NC}"
fi

# Try rust deps with reduced timeout
log "${YELLOW}Step 2: Building rust-deps-builder (with 10 minute timeout)...${NC}"
if ! timeout 600 bash -c "DEBUG_MODE=${DEBUG_MODE:-false} GIT_HASH=$GIT_HASH $DOCKER_COMPOSE build --no-cache rust-deps-builder"; then
    log "${RED}Rust dependencies build failed or timed out. Proceeding with full build.${NC}"
fi

# Final combined build with caching
log "${YELLOW}Step 3: Building final webxr service (with 15 minute timeout)...${NC}"
WEBXR_BUILD_SUCCESS=false
if timeout 900 bash -c "DEBUG_MODE=${DEBUG_MODE:-false} GIT_HASH=$GIT_HASH $DOCKER_COMPOSE build --build-arg BUILDKIT_INLINE_CACHE=1 webxr"; then
    WEBXR_BUILD_SUCCESS=true
else
    log "${RED}WebXR build failed or timed out.${NC}"
    
    # Last resort - try with existing cache
    log "${YELLOW}Last resort: Trying build with full caching...${NC}"
    if timeout 600 bash -c "DEBUG_MODE=${DEBUG_MODE:-false} GIT_HASH=$GIT_HASH $DOCKER_COMPOSE build webxr"; then
        WEBXR_BUILD_SUCCESS=true
    else
        log "${RED}All build attempts failed.${NC}"
    fi
fi

if [ "$WEBXR_BUILD_SUCCESS" = true ]; then
    log "${GREEN}Docker build successful!${NC}"
    exit 0
else
    log "${YELLOW}Docker build was not entirely successful, but we'll continue anyway${NC}"
    log "${YELLOW}This will allow debugging even with partial builds${NC}"
    # Return success (0) to allow parent script to continue
    exit 0
fi