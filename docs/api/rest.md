# REST API Reference

## Overview
The REST API provides endpoints for graph data management, content operations, and system status.

## Base URL
```
https://www.visionflow.info
```

## Authentication

All API requests require authentication. There are two methods:

### JWT Token
Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

### Nostr Authentication

#### Login
```http
POST /api/auth/nostr
```

**Request Body:**
```json
{
  "pubkey": "your_public_key",
  "signature": "signed_challenge"
}
```

**Response:**
```json
{
  "user": {
    "pubkey": "user_public_key",
    "npub": "user_npub",
    "is_power_user": boolean,
    "last_seen": 1234567890
  },
  "token": "session_token",
  "expires_at": 1234567890,
  "features": ["feature1", "feature2"]
}
```

#### Verify Token
```http
POST /api/auth/nostr/verify
```

**Request Body:**
```json
{
  "pubkey": "your_public_key",
  "token": "your_token"
}
```

#### Logout
```http
DELETE /api/auth/nostr
```

## Graph API

### Get Graph Data
```http
GET /api/graph/data
```

Returns the complete graph structure:
```json
{
  "nodes": [...],
  "edges": [...],
  "metadata": {...}
}
```

### Get Specific Node
```http
GET /api/graph/nodes/{nodeId}
```

**Response:**
```json
{
  "id": "string",
  "metadata": {...},
  "connections": [...]
}
```

### Get Paginated Graph Data
```http
GET /api/graph/data/paginated
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 100)
- `sort`: Sort field
- `filter`: Filter expression

### Update Graph
```http
POST /api/graph/update
```

**Request Body:**
```json
{
  "nodes": [
    {
      "id": "string",
      "position": {"x": 0, "y": 0, "z": 0},
      "mass": 1.0
    }
  ],
  "edges": [...]
}
```

### Refresh Graph
```http
POST /api/graph/refresh
```

## Files API

### Process Files
```http
POST /api/files/process
```

Triggers fetching and processing of Markdown files.

**Response:**
```json
{
  "status": "success",
  "processed_files": ["file1.md", "file2.md"]
}
```

### Get File Content
```http
GET /api/files/get_content/{filename}
```

### Upload Content
```http
POST /api/content/upload
```

**Request Body:**
```json
{
  "path": "string",
  "content": "string",
  "metadata": {...}
}
```

## Settings API

### Get Visualization Settings
```http
GET /api/user-settings/visualization
```

### Update API Keys
```http
POST /api/auth/nostr/api-keys
```

**Request Body:**
```json
{
  "perplexity": "api_key",
  "openai": "api_key",
  "ragflow": "api_key"
}
```

## AI Services

### Perplexity Query
```http
POST /api/perplexity
```

**Request Body:**
```json
{
  "query": "Your question here",
  "conversation_id": "optional-previous-conversation-id"
}
```

**Response:**
```json
{
  "answer": "The response from Perplexity AI",
  "conversation_id": "conversation-id-for-follow-up-queries"
}
```

## System Status

### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "gpu": "active",
    "github": "connected"
  }
}
```

## Error Responses

All endpoints may return the following error responses:

### Standard Error Format
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {...}
  }
}
```

### Common Error Codes
- `400`: Bad Request - Invalid parameters or request
- `401`: Unauthorized - Invalid or missing authentication token
- `403`: Forbidden - Valid token but insufficient permissions
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server-side error

## Related Documentation
- [WebSocket API](./websocket.md)
- [Development Setup](../development/setup.md)