"""
BaleyUI SDK Types
"""

from datetime import datetime
from enum import Enum
from typing import Any, AsyncIterator, Callable, Dict, List, Optional

from pydantic import BaseModel, Field


class ExecutionStatus(str, Enum):
    """Execution status values."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Flow(BaseModel):
    """A flow in the workspace."""

    id: str
    name: str
    description: Optional[str] = None
    enabled: bool
    version: int
    node_count: int = Field(alias="nodeCount")
    edge_count: int = Field(alias="edgeCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class FlowNode(BaseModel):
    """A node in a flow."""

    id: str
    type: str
    position: Dict[str, float]
    data: Dict[str, Any]


class FlowEdge(BaseModel):
    """An edge connecting nodes in a flow."""

    id: str
    source: str
    target: str
    source_handle: Optional[str] = Field(None, alias="sourceHandle")
    target_handle: Optional[str] = Field(None, alias="targetHandle")

    class Config:
        populate_by_name = True


class FlowDetail(Flow):
    """Detailed flow information including nodes and edges."""

    nodes: List[FlowNode] = []
    edges: List[FlowEdge] = []
    triggers: List[Dict[str, Any]] = []


class Block(BaseModel):
    """A block in the workspace."""

    id: str
    name: str
    description: Optional[str] = None
    type: str
    model: Optional[str] = None
    execution_count: int = Field(alias="executionCount")
    avg_duration: Optional[float] = Field(None, alias="avgDuration")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class Execution(BaseModel):
    """An execution of a flow or block."""

    id: str
    flow_id: Optional[str] = Field(None, alias="flowId")
    block_id: Optional[str] = Field(None, alias="blockId")
    status: ExecutionStatus
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = Field(None, alias="startedAt")
    completed_at: Optional[datetime] = Field(None, alias="completedAt")
    duration: Optional[int] = None
    created_at: datetime = Field(alias="createdAt")

    class Config:
        populate_by_name = True


class ExecutionEvent(BaseModel):
    """An event from an execution stream."""

    type: str
    execution_id: str = Field(alias="executionId")
    node_id: Optional[str] = Field(None, alias="nodeId")
    data: Optional[Dict[str, Any]] = None
    timestamp: datetime
    index: int

    class Config:
        populate_by_name = True


class ExecutionHandle:
    """Handle for monitoring an execution."""

    def __init__(
        self,
        id: str,
        get_status: Callable[[], "Execution"],
        wait_for_completion: Callable[[Optional[int]], "Execution"],
        stream: Callable[[], AsyncIterator[ExecutionEvent]],
    ):
        self.id = id
        self._get_status = get_status
        self._wait_for_completion = wait_for_completion
        self._stream = stream

    def get_status(self) -> Execution:
        """Get the current status of the execution."""
        return self._get_status()

    def wait(self, timeout: Optional[int] = None) -> Execution:
        """Wait for the execution to complete."""
        return self._wait_for_completion(timeout)

    def stream(self) -> AsyncIterator[ExecutionEvent]:
        """Stream execution events."""
        return self._stream()

    def __repr__(self) -> str:
        return f"ExecutionHandle(id={self.id!r})"
