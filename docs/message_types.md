# Unified Client-Server Message Types

This document specifies the message types exchanged between the client and server via WebSockets.  All messages are JSON objects.

## Client Messages

| Type             | Description                                      | Fields                               | Example                                      |
|-----------------|--------------------------------------------------|---------------------------------------|----------------------------------------------|
| `set_tts_method` | Sets the Text-to-Speech (TTS) method.             | `method: string` ("openai" or "piper") | `{"type": "set_tts_method", "method": "openai"}` |
| `chat_message`   | Sends a chat message.                             | `message: string`, `use_openai: boolean` | `{"type": "chat_message", "message": "Hello", "use_openai": true}` |
| `get_initial_data` | Requests initial data from the server.           | None                                    | `{"type": "get_initial_data"}`                |
| `set_simulation_mode` | Sets the simulation mode.                     | `mode: string` ("local" or "remote")   | `{"type": "set_simulation_mode", "mode": "remote"}` |
| `recalculate_layout` | Requests a recalculation of the graph layout. | `params: object` (force-directed params) | `{"type": "recalculate_layout", "params": {"iterations": 100, "repulsion": 1.0, "attraction": 0.01}}` |


## Server Messages

| Type                | Description                                          | Fields                                                                  | Example                                                                          |
|---------------------|------------------------------------------------------|--------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| `tts_method_set`    | Confirms the TTS method setting.                       | `method: string`                                                        | `{"type": "tts_method_set", "method": "openai"}`                                   |
| `ragflow_response`  | Response from the RAGFlow model.                       | `answer: string`, `audio: string` (base64 encoded)                         | `{"type": "ragflow_response", "answer": "Hello", "audio": "base64encodedaudiodata"}` |
| `openai_response`   | Response from the OpenAI model.                       | `response: string`                                                       | `{"type": "openai_response", "response": "OpenAI response"}`                       |
| `graph_update`      | Updates the graph data.                               | `graph_data: object` (nodes and edges)                                   | `{"type": "graph_update", "graph_data": {"nodes": [...], "edges": [...]}}`       |
| `simulation_update` | Updates the simulation data.                           | `simulation_data: object`                                                | `{"type": "simulation_update", "simulation_data": {...}}`                     |
| `layout_update`     | Updates the graph layout.                              | `layout_data: object` (node positions)                                   | `{"type": "layout_update", "layout_data": {"nodes": [{id: 1, x: 10, y: 20, z: 30}, ...]}}` |
| `audio_data`        | Sends audio data.                                     | `audio_base64: string` (base64 encoded)                                  | `{"type": "audio_data", "audio_base64": "base64encodedaudiodata"}`                 |
| `initial_data`      | Initial data sent to the client on connection.       | `data: object` (initial graph data, etc.)                               | `{"type": "initial_data", "data": {"nodes": [...], "edges": [...]}}`       |
| `error`              | Indicates an error.                                   | `message: string`                                                        | `{"type": "error", "message": "An error occurred"}`                             |
| `force_calculation_complete` | Indicates that force calculation is complete. | None                                                                   | `{"type": "force_calculation_complete"}`                                      |
| `simulation_mode_set` | Confirms the simulation mode setting.               | `mode: string` ("local" or "remote")                                     | `{"type": "simulation_mode_set", "mode": "remote"}`                            |


##  Data Structures (Examples)

**Node:**
```json
{
  "id": "node1",
  "name": "Node 1",
  "metadata": {
    "file_size": 1234,
    "last_modified": "2024-11-20T10:00:00Z"
  }
}
```

**Edge:**
```json
{
  "source": "node1",
  "dest": "node2",
  "weight": 0.8,
  "hyperlinks": 5
}
