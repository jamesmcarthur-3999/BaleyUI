"""
BaleyUI Python SDK

Official Python SDK for BaleyUI - Execute AI flows and blocks programmatically.

Example:
    >>> from baleyui import BaleyUI
    >>> client = BaleyUI(api_key="bui_live_xxxxxxxxxxxx")
    >>> execution = client.flows.execute("flow-id", input={"message": "Hello!"})
    >>> result = execution.wait()
    >>> print(result.output)
"""

from baleyui.client import BaleyUI
from baleyui.types import (
    Block,
    Execution,
    ExecutionEvent,
    ExecutionHandle,
    ExecutionStatus,
    Flow,
    FlowDetail,
)
from baleyui.errors import (
    BaleyUIError,
    AuthenticationError,
    PermissionError,
    NotFoundError,
    ValidationError,
    RateLimitError,
    TimeoutError,
    ConnectionError,
)

__version__ = "0.1.0"
__all__ = [
    # Client
    "BaleyUI",
    # Types
    "Flow",
    "FlowDetail",
    "Block",
    "Execution",
    "ExecutionStatus",
    "ExecutionEvent",
    "ExecutionHandle",
    # Errors
    "BaleyUIError",
    "AuthenticationError",
    "PermissionError",
    "NotFoundError",
    "ValidationError",
    "RateLimitError",
    "TimeoutError",
    "ConnectionError",
]
