#!/usr/bin/env bash

###############################################################################
# SAFETY SETTINGS
###############################################################################
# -e  Exit on any command returning a non-zero status
# -u  Treat unset variables as errors
# -o pipefail  Return error if any part of a pipeline fails
set -euo pipefail

###############################################################################
# DETECT SCRIPT & PROJECT ROOT
###############################################################################
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

###############################################################################
# COLOR CONSTANTS
###############################################################################
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'  # No color

###############################################################################
# DATA PATHS
###############################################################################
MARKDOWN_DIR="$PROJECT_ROOT/data/markdown"
METADATA_DIR="$PROJECT_ROOT/data/metadata"
METADATA_FILE="$METADATA_DIR/metadata.json"

###############################################################################
# LOGGING & EXIT HANDLING
###############################################################################
log() {
    # Logs a message with a timestamp
    echo -e "[$(date "+%Y-%m-%d %H:%M:%S")] $1"
}

handle_exit() {
    # Called when the script receives a signal (Ctrl+C, kill, etc.)
    log "\n${YELLOW}Exiting to shell. Containers will continue running.${NC}"
    exit 0
}

# Trap Ctrl+C, kill, etc. so we can exit gracefully
trap handle_exit INT TERM

###############################################################################
# CHECKS & VALIDATIONS
###############################################################################

check_environment() {
    # Validate required env vars and GitHub token
    log "${YELLOW}Checking environment variables...${NC}"

    local required_vars=(
        "GITHUB_TOKEN"
        "GITHUB_OWNER"
        "GITHUB_REPO"
        "GITHUB_BASE_PATH"
    )

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            log "${RED}Error: $var is not set in .env file${NC}"
            return 1
        fi
    done

    # Check GitHub token access
    if ! curl -s -H "Authorization: token $GITHUB_TOKEN" \
        "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO" >/dev/null; then
        log "${RED}Error: Invalid GitHub token or repository access${NC}"
        return 1
    fi

    log "${GREEN}Environment check passed${NC}"
    return 0
}

check_pnpm_security() {
    log "${YELLOW}Running pnpm security audit...${NC}"

    # Run and capture the audit output
    local audit_output
    audit_output=$(pnpm audit 2>&1 || true)
    local audit_exit=$?

    # Extract critical vulnerabilities count
    local critical_count
    critical_count=$(echo "$audit_output" | grep -i "critical" \
                                    | grep -o '[0-9]\+ vulnerabilities' \
                                    | awk '{print $1}')
    critical_count=${critical_count:-0}

    # Display the audit output
    echo "$audit_output"

    if [ "$critical_count" -gt 0 ]; then
        log "${RED}Found $critical_count critical vulnerabilities!${NC}"
        return 1
    elif [ "$audit_exit" -ne 0 ]; then
        log "${YELLOW}Found non-critical vulnerabilities${NC}"
    else
        log "${GREEN}No critical vulnerabilities found${NC}"
    fi

    return 0
}

check_typescript() {
    log "${YELLOW}Running TypeScript type check...${NC}"
    if ! pnpm run type-check; then
        log "${RED}TypeScript check failed${NC}"
        log "${YELLOW}Containers will be left running for debugging${NC}"
        return 1
    fi
    log "${GREEN}TypeScript check passed${NC}"
    return 0
}

check_rust_security() {
    log "${YELLOW}Running cargo audit...${NC}"

    local audit_output
    audit_output=$(cargo audit 2>&1 || true)
    local audit_exit=$?

    local critical_count
    critical_count=$(echo "$audit_output" | grep -i "critical" | wc -l)
    critical_count=${critical_count:-0}

    echo "$audit_output"

    if [ "$critical_count" -gt 0 ]; then
        log "${RED}Found $critical_count critical vulnerabilities!${NC}"
        return 1
    elif [ "$audit_exit" -ne 0 ]; then
        log "${YELLOW}Found non-critical vulnerabilities${NC}"
    else
        log "${GREEN}No critical vulnerabilities found${NC}"
    fi

    return 0
}

read_settings() {
    # Read domain & port from settings.yaml using yq
    local settings_file="$PROJECT_ROOT/settings.yaml"

    if [ ! -f "$settings_file" ]; then
        log "${RED}Error: settings.yaml not found${NC}"
        return 1
    fi

    # Check if yq is installed
    if ! command -v yq &>/dev/null; then
        log "${RED}Error: yq is not installed. Please install yq to parse YAML files.${NC}"
        return 1
    fi

    # Extract domain and port using yq
    DOMAIN=$(yq eval '.system.network.domain' "$settings_file")
    export DOMAIN

    PORT=$(yq eval '.system.network.port' "$settings_file")
    export PORT

    if [ -z "${DOMAIN:-}" ] || [ -z "${PORT:-}" ] || [ "$DOMAIN" = "null" ] || [ "$PORT" = "null" ]; then
        log "${RED}Error: DOMAIN or PORT not set in settings.yaml. Check your configuration.${NC}"
        return 1
    fi
}

check_system_resources() {
    log "${YELLOW}Checking GPU availability...${NC}"
    if ! command -v nvidia-smi &>/dev/null; then
        log "${RED}Error: nvidia-smi not found${NC}"
        return 1
    fi

    local gpu_info
    gpu_info=$(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader)
    echo "$gpu_info"

    local has_enough_memory=false
    while IFS=, read -r used total; do
        used=$(echo "$used" | tr -d ' MiB')
        total=$(echo "$total" | tr -d ' MiB')
        local free=$((total - used))
        if [ "$free" -gt 4096 ]; then
            has_enough_memory=true
            break
        fi
    done <<< "$gpu_info"

    if [ "$has_enough_memory" = false ]; then
        log "${RED}Error: No GPU with at least 4GB free memory${NC}"
        return 1
    fi
}

check_dependencies() {
    # Check Docker
    if ! command -v docker &>/dev/null; then
        log "${RED}Error: Docker is not installed${NC}"
        return 1
    fi

    # Try Docker Compose v2 first, fallback to v1
    if docker compose version &>/dev/null; then
        DOCKER_COMPOSE="docker compose"
    elif docker-compose version &>/dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        log "${RED}Error: Docker Compose not found${NC}"
        return 1
    fi

    # Check yq
    if ! command -v yq &>/dev/null; then
        log "${RED}Error: yq is not installed${NC}"
        log "${YELLOW}Please install yq to parse YAML files:${NC}"
        log "${YELLOW}On Ubuntu/Debian: sudo wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/bin/yq && sudo chmod +x /usr/bin/yq${NC}"
        log "${YELLOW}On macOS: brew install yq${NC}"
        log "${YELLOW}On other systems, visit: https://github.com/mikefarah/yq#install${NC}"
        return 1
    fi
}

verify_client_structure() {
    log "${YELLOW}Verifying client directory structure...${NC}"

    local required_files=(
        "$PROJECT_ROOT/client/index.html"
        "$PROJECT_ROOT/client/index.ts"
        "$PROJECT_ROOT/client/core/types.ts"
        "$PROJECT_ROOT/client/core/constants.ts"
        "$PROJECT_ROOT/client/core/utils.ts"
        "$PROJECT_ROOT/client/core/logger.ts"
        "$PROJECT_ROOT/client/websocket/websocketService.ts"
        "$PROJECT_ROOT/client/rendering/scene.ts"
        "$PROJECT_ROOT/client/rendering/node/geometry/NodeGeometryManager.ts"
        "$PROJECT_ROOT/client/rendering/textRenderer.ts"
        "$PROJECT_ROOT/client/state/settings.ts"
        "$PROJECT_ROOT/client/state/graphData.ts"
        "$PROJECT_ROOT/client/state/defaultSettings.ts"
        "$PROJECT_ROOT/client/xr/xrSessionManager.ts"
        "$PROJECT_ROOT/client/xr/xrInteraction.ts"
        "$PROJECT_ROOT/client/xr/xrTypes.ts"
        "$PROJECT_ROOT/client/platform/platformManager.ts"
        "$PROJECT_ROOT/client/tsconfig.json"
    )

    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log "${RED}Error: Required file $file not found${NC}"
            return 1
        fi
    done

    log "${GREEN}Client directory structure verified${NC}"
    return 0
}

check_ragflow_network() {
    log "${YELLOW}Checking RAGFlow network availability...${NC}"
    if ! docker network ls | grep -q "docker_ragflow"; then
        log "${RED}Error: RAGFlow network (docker_ragflow) not found${NC}"
        log "${YELLOW}Please ensure RAGFlow is running in ../ragflow/docker${NC}"
        log "${YELLOW}You can check the network with: docker network ls${NC}"
        return 1
    fi
    log "${GREEN}RAGFlow network is available${NC}"
    return 0
}

check_kokoros() {
    log "${YELLOW}Checking Kokoros TTS service...${NC}"
    if ! docker ps --format '{{.Names}}' | grep -q "^kokoros$"; then
        log "${YELLOW}Kokoros container not running, starting it...${NC}"
        if ! docker run -d -p 4001:4001 --network docker_ragflow --name kokoros kokoros openai; then
            log "${RED}Failed to start Kokoros container${NC}"
            return 1
        fi
        log "${GREEN}Kokoros container started successfully${NC}"
    else
        log "${GREEN}Kokoros container is already running${NC}"
    fi
    return 0
}

check_application_readiness() {
    local max_attempts=60
    local attempt=1
    local wait_secs=2

    log "${YELLOW}Checking application readiness...${NC}"

    # Install websocat if not present (used for WebSocket testing)
    if ! command -v websocat &>/dev/null; then
        log "${YELLOW}Installing websocat for WebSocket testing...${NC}"
        if command -v cargo &>/dev/null; then
            cargo install websocat
        else
            log "${RED}Error: Neither websocat nor cargo found. Cannot test WebSocket connection.${NC}"
            return 1
        fi
    fi

    while [ "$attempt" -le "$max_attempts" ]; do
        local ready=true
        local status_msg=""

        # 1. Check HTTP
        if ! timeout 5 curl -s http://localhost:4000/ >/dev/null; then
            ready=false
            status_msg="HTTP endpoint not ready"
        fi

        # 2. If HTTP is up, check WebSocket
        if [ "$ready" = true ]; then
            log "${YELLOW}Testing WebSocket connection...${NC}"
            if ! timeout 5 websocat "ws://localhost:4000/wss" \
                    >/dev/null 2>&1 <<< '{"type":"ping"}'; then
                ready=false
                status_msg="WebSocket endpoint not ready"
            fi
        fi

        # 3. Optional RAGFlow connectivity
        if [ "$ready" = true ]; then
            if timeout 5 curl -s http://ragflow-server/v1/health >/dev/null; then
                log "${GREEN}RAGFlow service is accessible${NC}"
            else
                log "${YELLOW}Note: RAGFlow service is not accessible - some features may be limited${NC}"
            fi
        fi

        if [ "$ready" = true ]; then
            log "${GREEN}All services are ready${NC}"
            return 0
        fi

        log "${YELLOW}Attempt $attempt/$max_attempts: $status_msg${NC}"

        # Show partial logs halfway through attempts
        if [ "$attempt" -eq $((max_attempts / 2)) ]; then
            log "${YELLOW}Still waiting for services. Recent logs:${NC}"
            $DOCKER_COMPOSE logs --tail=20
        fi

        sleep "$wait_secs"
        attempt=$((attempt + 1))
    done

    # Exhausted attempts
    log "${RED}Application failed to become ready. Dumping logs...${NC}"
    $DOCKER_COMPOSE logs
    log "${YELLOW}Containers left running for debugging. Use these commands to inspect:${NC}"
    log "  $DOCKER_COMPOSE logs -f"
    log "  docker logs logseq-xr-webxr"
    log "  docker logs cloudflared-tunnel"
    return 1
}
###############################################################################
# COMMAND LINE ARGUMENTS
###############################################################################
REBUILD_TEST=false

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        rebuild-test)
            REBUILD_TEST=true
            shift # Remove from processing
            ;;
    esac
done

###############################################################################
# MAIN EXECUTION
###############################################################################
cd "$PROJECT_ROOT"


# 1. Ensure .env exists
if [ ! -f .env ]; then
    log "${RED}Error: .env file not found in $PROJECT_ROOT${NC}"
    exit 1
fi

# 2. Source environment variables
set -a
source .env
set +a

# 3. Read settings from TOML (non-fatal if it fails, to allow debugging)
read_settings || {
    log "${YELLOW}Settings read failed - continuing for debugging${NC}"
}

# 4. Check dependencies (Docker and yq)
check_dependencies || {
    log "${RED}Dependency check failed${NC}"
    exit 1
}

# 5. GPU resources (non-fatal if it fails)
check_system_resources || {
    log "${YELLOW}System resources check failed - continuing for debugging${NC}"
}

# 6. Verify client directory structure (non-fatal if it fails)
if ! verify_client_structure; then
    log "${RED}Client structure verification failed${NC}"
    log "${YELLOW}Continuing for debugging${NC}"
fi

# 7. Security checks
log "\n${YELLOW}Running security checks...${NC}"
check_pnpm_security || true
check_typescript || {
    log "${YELLOW}TypeScript check failed - continuing for debugging${NC}"
}
check_rust_security || true

# 10. Environment & GitHub token check (non-fatal)
if ! check_environment; then
    log "${YELLOW}Environment check failed - continuing for debugging${NC}"
fi

# 10. Build & start containers
log "${YELLOW}Building and starting services...${NC}"

# Clean up existing containers
log "${YELLOW}Cleaning up existing containers...${NC}"

# Get container IDs for our specific containers
cloudflared_id=$(docker ps -aq --filter "name=cloudflared-tunnel")
webxr_id=$(docker ps -aq --filter "name=logseq-xr-webxr")

# Stop and remove cloudflared container if it exists
if [ -n "$cloudflared_id" ]; then
    log "${YELLOW}Stopping cloudflared container $cloudflared_id...${NC}"
    docker stop "$cloudflared_id"
    docker rm "$cloudflared_id"
fi

# Stop and remove webxr container if it exists
if [ -n "$webxr_id" ]; then
    log "${YELLOW}Stopping webxr container $webxr_id...${NC}"
    docker stop "$webxr_id"
    docker rm "$webxr_id"
fi

# If in rebuild-test mode, do additional cleanup
if [ "$REBUILD_TEST" = true ]; then
    log "${YELLOW}Rebuild-test mode: Performing additional cleanup...${NC}"
    docker system prune -f
fi

# Get current git hash or use "development" if not in a git repo
GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "development")
export GIT_HASH

# Build client code before building container
log "${YELLOW}Building client code...${NC}"
pnpm build || { log "${RED}Client build failed${NC}"; exit 1; }
log "${GREEN}Client build successful${NC}"

# Build with GIT_HASH environment variable
GIT_HASH=$GIT_HASH $DOCKER_COMPOSE build --pull --no-cache
$DOCKER_COMPOSE up -d

# 11. Check readiness (fatal if fails)
if ! check_application_readiness; then
    log "${RED}Application failed to start properly${NC}"
    log "${YELLOW}Containers left running for debugging. Use these commands:${NC}"
    log "  $DOCKER_COMPOSE logs -f"
    log "  docker logs logseq-xr-webxr"
    log "  docker logs cloudflared-tunnel"
    exit 1
fi

# 12. Final status
log "\n${GREEN}🚀 Services are running!${NC}"

log "\nResource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

log "\nEndpoints:"
echo "HTTP:      http://localhost:4000"
echo "WebSocket: ws://localhost:4000/wss"

log "\nCommands:"
echo "logs:    $DOCKER_COMPOSE logs -f"
echo "stop:    $DOCKER_COMPOSE down"
echo "restart: $DOCKER_COMPOSE restart"

# 13. Show logs in background, wait for them
log "\n${YELLOW}Showing logs (Ctrl+C to exit)...${NC}"
$DOCKER_COMPOSE logs -f &

wait
