# WebSocket Connection and Communication in Logseq XR

This document describes the WebSocket connection and communication process in the Logseq XR project, covering the client-server interaction, data formats, compression, heartbeats, and configuration.

## 1. Connection Establishment

*   **Client-Side Initiation:** The `WebSocketService` in `client/websocket/websocketService.ts` manages the WebSocket connection. The `connect()` method must be called explicitly to initiate the connection.
*   **URL Construction:** The `buildWsUrl()` function in `client/core/api.ts` constructs the WebSocket URL:
    *   **Protocol:** `wss:` for HTTPS, `ws:` for HTTP (determined by `window.location.protocol`).
    *   **Host:** `window.location.hostname`.
    *   **Port:** `:4000` in development (non-production), empty (default port) in production.
    *   **Path:** `/wss`.
    *   **Final URL:** `${protocol}//${host}${port}/wss`
*   **Development Proxy:** In development (using `vite`), the `vite.config.ts` file configures a proxy:
    *   Requests to `/wss` are proxied to `ws://localhost:4000`.
*   **Docker Environment:**
    *   The `Dockerfile` exposes port 4000.
    *   The `docker-compose.yml` file maps container port 4000 to host port 4000.
    *   `nginx` (configured in `nginx.conf`) listens on port 4000 inside the container.
    *   The `scripts/launch-docker.sh` script builds and starts the containers, including a readiness check that uses `websocat` to test the WebSocket connection to `ws://localhost:4000/wss`.
*   **Cloudflared:** When using Cloudflared (`docker-compose.yml`):
    *   Cloudflared forwards traffic to the `webxr` container's `nginx` instance on port 4000, using the container name (`logseq-xr-webxr`) as the hostname.
*   **Server-Side Handling:**
    *   The `socket_flow_handler` function in `src/handlers/socket_flow_handler.rs` handles WebSocket connections (using Actix Web).
    *   It checks for the `Upgrade` header to verify it's a WebSocket request.
    *   It creates a `SocketFlowServer` instance for each connection.
    *   The `ws::start()` function starts the WebSocket actor.
* **Nginx Proxy:** The `nginx.conf` file configures nginx to proxy websocket connections at `/wss` to the rust backend, which is listening on `127.0.0.1:3001` inside the container.

## 2. Message Handling

*   **Client-Side (`client/websocket/websocketService.ts`):**
    *   **`onopen`:** Sends a `requestInitialData` message (JSON) to the server.
    *   **`onmessage`:**
        *   **Text Messages:** Parses JSON messages. Handles `connection_established` and `updatesStarted`.
        *   **Binary Messages:**
            *   Decompresses using `pako.inflate()` (zlib) if necessary.
            *   Decodes the binary data according to the custom protocol (see "Binary Protocol").
            *   Calls the `binaryMessageCallback` with the decoded node data.
    *   **`sendMessage()`:** Sends text messages (JSON).
    *   **`sendNodeUpdates()`:** Sends binary messages for node updates (limited to 2 nodes per update). Compresses if needed.
*   **Server-Side (`src/handlers/socket_flow_handler.rs`):**
    *   **`started`:** Sends a `connection_established` message (JSON).
    *   **`handle`:**
        *   **`Ping`:** Responds with a `Pong` message (JSON).
        *   **`Text`:**
            *   Parses JSON.
            *   Handles `ping` messages (responds with `pong`).
            *   Handles `requestInitialData`:
                *   Starts a timer to send binary position updates periodically (interval based on settings, default 30 Hz).
                *   Sends an `updatesStarted` message (JSON).
        *   **`Binary`:**
            *   Decodes using `binary_protocol::decode_node_data()`.
            *   Handles `MessageType::PositionVelocityUpdate` (for up to 2 nodes): Updates node positions and velocities in the graph data.
        *   **`Close`:** Handles client close requests.

## 3. Binary Protocol (`src/utils/binary_protocol.rs`)

*   **`MessageType`:** `PositionVelocityUpdate` (0x01).
*   **`NodeData`:**
    *   `id`: `u32` (4 bytes)
    *   `position`: `Vec3` (12 bytes: x, y, z as `f32`)
    *   `velocity`: `Vec3` (12 bytes: x, y, z as `f32`)
    *   Total: 28 bytes per node.
*   **Encoding (`encode_node_data`):**
    *   Header:
        *   Message Type (`u32` Little Endian).
        *   Node Count (`u32` Little Endian).
    *   Node Data (repeated for each node):
        *   Node ID (`u32` Little Endian).
        *   Position (x, y, z as `f32` Little Endian).
        *   Velocity (x, y, z as `f32` Little Endian).
*   **Decoding (`decode_node_data`):**
    *   Reads the header.
    *   Reads node data based on the node count.
* **Byte Order:** Little Endian.

## 4. Data Alignment and Case Handling

*   **Client (TypeScript):** Uses `camelCase` for variables and interfaces.
*   **Server (Rust):**
    *   `socket_flow_messages::NodeData`: Uses `snake_case` for fields (position, velocity, mass, flags, padding).
    *   `binary_protocol::NodeData`: Uses `snake_case` (id, position, velocity).
    *   `socket_flow_messages::Node`: Uses `camelCase` for fields (due to Serde's `rename_all` attribute).
    * API calls use `burger-case`.
*   **Data Transfer:** The binary protocol ensures data alignment between the client and server. The `BinaryNodeData` struct in `socket_flow_messages.rs` mirrors the structure sent over the WebSocket.

## 5. Compression

*   **Client:** Uses `pako` library for zlib compression/decompression.
    *   Compresses binary messages if they are larger than `COMPRESSION_THRESHOLD` (1024 bytes).
    *   Attempts to decompress all incoming binary messages, falling back to the original data if decompression fails.
*   **Server:** Uses `flate2` crate for zlib compression/decompression.
    *   `maybe_compress()`: Compresses if enabled in settings and data size exceeds the threshold.
    *   `maybe_decompress()`: Decompresses if enabled in settings. If decompression fails, assumes data is uncompressed.

## 6. Heartbeat

*   **Server:** Expects `ping` messages from the client. `src/utils/socket_flow_constants.rs` defines:
    *   `HEARTBEAT_INTERVAL`: 30 seconds.
    *   `CLIENT_TIMEOUT`: 60 seconds (double the heartbeat interval).
*   **Client:** The client-side code doesn't have explicit heartbeat sending logic, but the server expects pings, and the `docker-compose.yml` healthcheck sends a ping. The `cloudflared` configuration also sets `TUNNEL_WEBSOCKET_HEARTBEAT_INTERVAL` to 30s.
* **Nginx:** `nginx.conf` has timeouts configured:
    * `proxy_read_timeout`: 3600s
    * `proxy_send_timeout`: 3600s
    * `proxy_connect_timeout`: 75s

## 7. Throttling/Update Rate

*   **Server:** Sends position updates at a rate determined by the `binary_update_rate` setting (defaulting to 30 Hz), controlled by a timer in `socket_flow_handler.rs`. The constant `POSITION_UPDATE_RATE` in `socket_flow_constants.rs` is 5 Hz, but the actual update rate is controlled by the settings.
*   **Client:**  The client receives updates as they are sent by the server. There's no explicit throttling on the client side, other than limiting user-initiated updates to 2 nodes per message.

## 8. Order of Operations

1.  Client initiates a WebSocket connection to `/wss`.
2.  In development, Vite proxies the connection to `ws://localhost:4000`.
3.  In Docker, the connection goes to port 4000 on the host, which is mapped to port 4000 of the `webxr` container.
4.  `nginx` (inside the container) receives the connection on port 4000.
5.  `nginx` proxies the WebSocket connection to the Rust backend on `127.0.0.1:3001`.
6.  The `socket_flow_handler` in the Rust backend handles the connection.
7.  The server sends a `connection_established` message (JSON).
8.  The client sends a `requestInitialData` message (JSON).
9.  The server starts sending binary position updates at the configured interval.
10. The client receives and processes the binary data, updating the visualization.
11. The server and client exchange `ping` and `pong` messages for connection health (although the client-side pinging is primarily handled by the `docker-compose` healthcheck and potentially Cloudflared).
12. User interactions on the client can trigger sending binary node updates (limited to 2 nodes) to the server.