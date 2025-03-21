# WebSocket API Reference (Updated)

## Connection

Connect to: `wss://www.visionflow.info/wss`

## Authentication

Send authentication message immediately after connection:

```json
{
  "type": "auth",
  "token": "your_nostr_token"
}
```

## Message Types

### Control Messages

#### 1. Connection Established
```json
{
  "type": "connection_established",
  "timestamp": 1679417762000
}
```

#### 2. Request Initial Data
```json
{
  "type": "requestInitialData"
}
```

#### 3. Updates Started
```json
{
  "type": "updatesStarted",
  "timestamp": 1679417763000
}
```

#### 4. Loading State
```json
{
  "type": "loading",
  "message": "Calculating initial layout..."
}
```

### Binary Messages - Position Updates

Position updates are transmitted as binary messages in both directions:

- Each node update is 26 bytes
- Format: [Node ID (2 bytes)][Position (12 bytes)][Velocity (12 bytes)]
- Position and Velocity are three consecutive float32 values (x,y,z)
- Messages are compressed with zlib if size > 1KB

#### Server → Client Updates

The server continuously sends position updates to all connected clients:

1. Updates are pre-computed by the server's continuous physics engine
2. Only nodes that changed significantly are included
3. Update frequency varies based on graph activity (5-60 updates/sec)
4. Each update can contain multiple node positions in a single binary message
5. When the physics simulation stabilizes, update frequency is reduced

#### Client → Server Updates

Clients can send position updates back to the server:

1. Position updates use the same binary format as server messages
2. Updates are processed by the server's physics system
3. Changes are validated and broadcast to all other connected clients
4. Modifications that violate physics constraints may be adjusted by the server

### Position Synchronization Protocol

The bidirectional synchronization protocol ensures consistent graph state:

1. Server maintains the authoritative graph state
2. Any client can send position updates during user interaction
3. Server processes updates and applies physics constraints
4. All clients receive the same set of position updates
5. Late-joining clients receive the complete current graph state

### Settings Synchronization

```json
{
  "type": "settings_update",
  "category": "visualization",
  "settings": {
    "edges": {
      "scaleFactor": 2.0
    }
  }
}
```

## Error Handling

#### 1. Connection Error
```json
{
  "type": "error",
  "code": "connection_error",
  "message": "Connection failed"
}
```

#### 2. Authentication Error
```json
{
  "type": "error",
  "code": "auth_error",
  "message": "Invalid token"
}
```

#### 3. Position Update Error
```json
{
  "type": "error",
  "code": "position_update_error",
  "message": "Invalid node position data"
}
```

## Rate Limiting

- 60 JSON messages per minute per connection
- Binary position updates don't count towards the rate limit
- Server-side throttling applies for high-frequency position updates