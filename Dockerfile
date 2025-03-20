# Stage 1: Frontend Build
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Copy package files and configuration
COPY client/package.json client/package-lock.json ./
COPY client/tsconfig.json client/vite.config.ts ./
COPY client/src ./src
COPY client/public ./public
COPY client/index.html ./

# Create data/public directory for build output
RUN mkdir -p data/public

# Install dependencies and build
RUN npm ci

# Install missing dependencies that were previously managed by pnpm
RUN npm install --save-dev \
    @radix-ui/react-slot \
    @radix-ui/react-collapsible \
    @radix-ui/react-label \
    @radix-ui/react-select \
    @radix-ui/react-slider \
    @radix-ui/react-switch \
    @radix-ui/react-toast \
    @radix-ui/react-tooltip \
    class-variance-authority \
    lucide-react \
    react-draggable \
    clsx \
    tailwind-merge \
    @types/node

# Clean any previous build artifacts and perform a fresh build
RUN rm -rf dist && npm run build

# Copy build output to the expected location
RUN mkdir -p data/public/dist && \
    cp -r dist/* data/public/dist/

# Stage 2: Rust Dependencies Cache
FROM nvidia/cuda:12.8.1-devel-ubuntu22.04 AS rust-deps-builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libssl-dev \
    pkg-config \
    libegl1-mesa-dev \
    libasound2-dev \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Rust with better error handling
RUN curl --retry 5 --retry-delay 2 --retry-connrefused https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain 1.84.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Configure cargo for better network resilience
RUN mkdir -p ~/.cargo && \
    echo '[source.crates-io]' >> ~/.cargo/config.toml && \
    echo 'registry = "https://github.com/rust-lang/crates.io-index"' >> ~/.cargo/config.toml && \
    echo 'replace-with = "ustc"' >> ~/.cargo/config.toml && \
    echo '[source.ustc]' >> ~/.cargo/config.toml && \
    echo 'registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"' >> ~/.cargo/config.toml && \
    echo '[net]' >> ~/.cargo/config.toml && \
    echo 'retry = 10' >> ~/.cargo/config.toml && \
    echo 'timeout = 120' >> ~/.cargo/config.toml && \
    echo 'git-fetch-with-cli = true' >> ~/.cargo/config.toml

WORKDIR /usr/src/app

# Copy Cargo files first for better layer caching
COPY Cargo.toml Cargo.lock ./

# Install git and set GIT_HASH
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Create dummy src directory and build dependencies
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    GIT_HASH=$(git rev-parse HEAD || echo "development") && \
    CARGO_NET_GIT_FETCH_WITH_CLI=true \
    CARGO_HTTP_TIMEOUT=120 \
    CARGO_HTTP_CHECK_REVOKE=false \
    cargo update && \
    (cargo build --release --features gpu --jobs $(nproc) --offline || \
    (sleep 2 && cargo build --release --jobs $(nproc)) || \
    (sleep 5 && cargo build --release --jobs 1))

# Now copy the real source code and build
COPY src ./src

RUN GIT_HASH=$(git rev-parse HEAD || echo "development") && \
    (cargo build --release --features gpu --jobs $(nproc) --offline || \
    (sleep 2 && cargo build --release --jobs $(nproc)) || \
    (sleep 5 && cargo build --release --jobs 1))

# Stage 3: Final Runtime Image
FROM nvidia/cuda:12.8.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PATH="/app/venv/bin:${PATH}" \
    NVIDIA_DRIVER_CAPABILITIES=all \
    RUST_LOG=info \
    RUST_BACKTRACE=0 \
    PORT=4000 \
    BIND_ADDRESS=0.0.0.0 \
    NODE_ENV=production \
    DOMAIN=localhost

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libssl3 \
    nginx \
    libegl1-mesa \
    libasound2 \
    ca-certificates \
    mesa-utils \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    netcat-openbsd \
    gettext-base \
    net-tools \
    iproute2 \
    procps \
    lsof \
    jq \
    wget \
    && wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/bin/yq \
    && chmod +x /usr/bin/yq \
    && wget https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl -O /usr/bin/websocat \
    && chmod +x /usr/bin/websocat \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

# Create a non-root user for running the application
RUN groupadd -g 1000 webxr && \
    useradd -u 1000 -g webxr -d /app webxr

# Set up nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf.template
RUN envsubst '${DOMAIN}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && \
    rm /etc/nginx/nginx.conf.template && \
    chown -R webxr:webxr /etc/nginx/nginx.conf && \
    chmod 644 /etc/nginx/nginx.conf

# Set up nginx directories and permissions
RUN mkdir -p /var/lib/nginx/client_temp \
             /var/lib/nginx/proxy_temp \
             /var/lib/nginx/fastcgi_temp \
             /var/lib/nginx/uwsgi_temp \
             /var/lib/nginx/scgi_temp \
             /var/log/nginx \
             /var/run/nginx \
             /var/cache/nginx && \
    chown -R webxr:webxr /var/lib/nginx \
                         /var/log/nginx \
                         /var/run/nginx \
                         /var/cache/nginx \
                         /etc/nginx && \
    chmod -R 755 /var/lib/nginx \
                 /var/log/nginx \
                 /var/run/nginx \
                 /var/cache/nginx \
                 /etc/nginx && \
    touch /var/log/nginx/error.log \
          /var/log/nginx/access.log \
          /var/run/nginx/nginx.pid && \
    chmod 666 /var/log/nginx/*.log \
              /var/run/nginx/nginx.pid

# Set up directory structure and permissions
WORKDIR /app

# Create required directories with proper permissions
RUN mkdir -p /app/data/public/dist \
             /app/data/markdown \
             /app/data/runtime \
             /app/compute_forces \
             /app/data/piper \
             /tmp/runtime && \
    chown -R webxr:webxr /app /tmp/runtime && \
    chmod -R 755 /app /tmp/runtime && \
    # Ensure data/markdown is writable by webxr user
    chmod 777 /app/data/markdown

# Create necessary directories and set permissions
RUN mkdir -p /app/data/markdown /app/data/metadata /app/user_settings && \
    chmod -R 777 /app/data && \
    chmod 777 /app/user_settings

# Copy built artifacts
COPY --from=rust-deps-builder /usr/src/app/target/release/webxr /app/
COPY src/utils/compute_forces.ptx /app/src/utils/compute_forces.ptx
RUN chmod 644 /app/src/utils/compute_forces.ptx
COPY --from=frontend-builder /app/data/public/dist /app/data/public/dist

# Copy start script
COPY scripts/start.sh /app/start.sh

# Set proper permissions for copied files
RUN chown -R webxr:webxr /app && \
    chmod 755 /app/start.sh && \
    chmod -R g+w /app
RUN touch /app/settings.yaml && \
    chown webxr:webxr /app/settings.yaml && \
    chmod 666 /app/settings.yaml

# Switch to non-root user
USER webxr

# Add security labels
LABEL org.opencontainers.image.source="https://github.com/yourusername/logseq-xr" \
      org.opencontainers.image.description="LogseqXR WebXR Graph Visualization" \
      org.opencontainers.image.licenses="MIT" \
      security.capabilities="cap_net_bind_service" \
      security.privileged="false" \
      security.allow-privilege-escalation="false"

# Expose port
EXPOSE 4000

# Start application
ENTRYPOINT ["/app/start.sh"]