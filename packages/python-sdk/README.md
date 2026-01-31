# baleyui

Official Python SDK for BaleyUI - Execute AI flows and blocks programmatically.

## Installation

```bash
pip install baleyui
```

## Quick Start

```python
from baleyui import BaleyUI

client = BaleyUI(api_key="bui_live_xxxxxxxxxxxx")

# Execute a flow
execution = client.flows.execute("flow-id", input={"message": "Hello, world!"})

# Wait for completion
result = execution.wait()
print(result.output)
```

## Usage

### Initialize the Client

```python
from baleyui import BaleyUI

client = BaleyUI(
    api_key="bui_live_xxxxxxxxxxxx",
    # Optional settings
    base_url="https://app.baleyui.com",  # Default
    timeout=30.0,  # 30 seconds
    max_retries=3,
)

# Or use as context manager
with BaleyUI(api_key="...") as client:
    flows = client.flows.list()
```

### List Flows

```python
flows = client.flows.list()
print(f"Found {len(flows)} flows")

for flow in flows:
    print(f"- {flow.name} (enabled: {flow.enabled})")
```

### Execute a Flow

```python
# Start execution (returns immediately)
execution = client.flows.execute("flow-id", input={"query": "What is AI?"})

print(f"Execution started: {execution.id}")

# Check status
status = execution.get_status()
print(f"Status: {status.status}")

# Wait for completion
result = execution.wait()
print(f"Output: {result.output}")
```

### Wait for Completion on Execute

```python
# Wait inline during execute
execution = client.flows.execute(
    "flow-id",
    input={"message": "Hello!"},
    wait=True,
    wait_timeout=60,  # seconds
)

# Execution is already complete
print(execution.get_status().output)
```

### Stream Execution Events

```python
execution = client.flows.execute("flow-id", input={"message": "Hello!"})

# Stream events in real-time
for event in execution.stream():
    if event.type == "node_start":
        print(f"Node {event.node_id} started")
    elif event.type == "node_stream":
        # Streaming content from AI
        print(event.data.get("content", ""), end="")
    elif event.type == "node_complete":
        print(f"Node {event.node_id} completed")
    elif event.type == "execution_complete":
        print("Execution complete!")
    elif event.type == "execution_error":
        print(f"Execution failed: {event.data.get('error')}")
```

### Async Streaming

```python
import asyncio
from baleyui import BaleyUI

async def main():
    client = BaleyUI(api_key="...")
    execution = client.flows.execute("flow-id", input={})

    async for event in client.executions.stream_async(execution.id):
        print(event.type, event.data)

asyncio.run(main())
```

### Run a Single Block

```python
execution = client.blocks.run("block-id", input={"text": "Summarize this article..."})

result = execution.wait()
print(result.output)
```

### Error Handling

```python
from baleyui import (
    BaleyUI,
    AuthenticationError,
    NotFoundError,
    RateLimitError,
)

client = BaleyUI(api_key="...")

try:
    result = client.flows.execute("flow-id")
except AuthenticationError:
    print("Invalid API key")
except NotFoundError:
    print("Flow not found")
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after}s")
```

## API Reference

### `BaleyUI`

Main client class.

#### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_key` | `str` | *required* | Your BaleyUI API key |
| `base_url` | `str` | `https://app.baleyui.com` | API base URL |
| `timeout` | `float` | `30.0` | Request timeout (seconds) |
| `max_retries` | `int` | `3` | Max retry attempts |

### `client.flows`

#### `list()` → `List[Flow]`

List all flows in the workspace.

#### `get(flow_id)` → `FlowDetail`

Get a specific flow with full details.

#### `execute(flow_id, input=None, wait=False, wait_timeout=300)` → `ExecutionHandle`

Execute a flow.

### `client.blocks`

#### `list()` → `List[Block]`

List all blocks in the workspace.

#### `run(block_id, input=None, wait=False, wait_timeout=300)` → `ExecutionHandle`

Run a single block.

### `client.executions`

#### `get(execution_id)` → `Execution`

Get execution status and result.

#### `wait_for_completion(execution_id, timeout=300)` → `Execution`

Wait for an execution to complete.

#### `stream(execution_id)` → `Iterator[ExecutionEvent]`

Stream execution events.

#### `stream_async(execution_id)` → `AsyncIterator[ExecutionEvent]`

Stream execution events asynchronously.

### `ExecutionHandle`

Returned from `execute()` and `run()`.

| Method | Description |
|--------|-------------|
| `id` | The execution ID |
| `get_status()` | Get current status |
| `wait(timeout=None)` | Wait for completion |
| `stream()` | Stream events |

## Types

See [baleyui/types.py](./baleyui/types.py) for complete type definitions.

All types are Pydantic models with full type hints.

## License

MIT
