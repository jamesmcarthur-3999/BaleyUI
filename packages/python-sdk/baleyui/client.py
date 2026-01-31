"""
BaleyUI SDK Client
"""

import json
import time
from typing import Any, AsyncIterator, Dict, Iterator, List, Optional

import httpx

from baleyui.errors import (
    AuthenticationError,
    BaleyUIError,
    ConnectionError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    TimeoutError,
    ValidationError,
)
from baleyui.types import (
    Block,
    Execution,
    ExecutionEvent,
    ExecutionHandle,
    Flow,
    FlowDetail,
)


DEFAULT_BASE_URL = "https://app.baleyui.com"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_WAIT_TIMEOUT = 300  # 5 minutes in seconds


class BaleyUI:
    """
    BaleyUI SDK Client.

    Example:
        >>> from baleyui import BaleyUI
        >>> client = BaleyUI(api_key="bui_live_xxxxxxxxxxxx")
        >>> execution = client.flows.execute("flow-id", input={"message": "Hello!"})
        >>> result = execution.wait()
        >>> print(result.output)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        """
        Initialize the BaleyUI client.

        Args:
            api_key: Your BaleyUI API key.
            base_url: API base URL (default: https://app.baleyui.com).
            timeout: Request timeout in seconds (default: 30).
            max_retries: Maximum number of retries for failed requests (default: 3).
        """
        if not api_key:
            raise AuthenticationError("API key is required")

        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries

        self._client = httpx.Client(
            base_url=f"{self._base_url}/api/v1",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "baleyui-python",
            },
            timeout=timeout,
        )

        self.flows = FlowsAPI(self)
        self.blocks = BlocksAPI(self)
        self.executions = ExecutionsAPI(self)

    def __enter__(self) -> "BaleyUI":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make an authenticated request to the API."""
        try:
            response = self._client.request(method, path, json=json_data)
            return self._handle_response(response)
        except httpx.ConnectError as e:
            raise ConnectionError(str(e))
        except httpx.TimeoutException:
            raise TimeoutError(int(self._timeout * 1000))

    def _handle_response(self, response: httpx.Response) -> Dict[str, Any]:
        """Handle the API response."""
        if response.is_success:
            return response.json()

        try:
            error_data = response.json()
        except json.JSONDecodeError:
            error_data = {}

        message = error_data.get("error", response.reason_phrase)
        details = error_data.get("details")

        if response.status_code == 401:
            raise AuthenticationError(message)
        elif response.status_code == 403:
            raise PermissionError(message)
        elif response.status_code == 404:
            raise NotFoundError("Resource", "unknown")
        elif response.status_code == 400:
            raise ValidationError(message, details)
        elif response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            raise RateLimitError(int(retry_after) if retry_after else None)
        else:
            raise BaleyUIError(message, response.status_code, "api_error", details)


class FlowsAPI:
    """Flows API."""

    def __init__(self, client: BaleyUI):
        self._client = client

    def list(self) -> List[Flow]:
        """List all flows in the workspace."""
        response = self._client._request("GET", "/flows")
        return [Flow(**flow) for flow in response.get("flows", [])]

    def get(self, flow_id: str) -> FlowDetail:
        """Get a specific flow by ID."""
        response = self._client._request("GET", f"/flows/{flow_id}")
        return FlowDetail(**response.get("flow", response))

    def execute(
        self,
        flow_id: str,
        input: Optional[Dict[str, Any]] = None,
        wait: bool = False,
        wait_timeout: int = DEFAULT_WAIT_TIMEOUT,
    ) -> ExecutionHandle:
        """
        Execute a flow.

        Args:
            flow_id: The ID of the flow to execute.
            input: Input data to pass to the flow.
            wait: Whether to wait for completion before returning.
            wait_timeout: Timeout in seconds when wait=True.

        Returns:
            An ExecutionHandle for monitoring the execution.
        """
        response = self._client._request(
            "POST",
            f"/flows/{flow_id}/execute",
            json_data={"input": input or {}},
        )

        execution_id = response["executionId"]

        handle = ExecutionHandle(
            id=execution_id,
            get_status=lambda: self._client.executions.get(execution_id),
            wait_for_completion=lambda timeout: self._client.executions.wait_for_completion(
                execution_id, timeout or wait_timeout
            ),
            stream=lambda: self._client.executions.stream(execution_id),
        )

        if wait:
            handle.wait(wait_timeout)

        return handle


class BlocksAPI:
    """Blocks API."""

    def __init__(self, client: BaleyUI):
        self._client = client

    def list(self) -> List[Block]:
        """List all blocks in the workspace."""
        response = self._client._request("GET", "/blocks")
        return [Block(**block) for block in response.get("blocks", [])]

    def run(
        self,
        block_id: str,
        input: Optional[Dict[str, Any]] = None,
        wait: bool = False,
        wait_timeout: int = DEFAULT_WAIT_TIMEOUT,
    ) -> ExecutionHandle:
        """
        Run a single block.

        Args:
            block_id: The ID of the block to run.
            input: Input data to pass to the block.
            wait: Whether to wait for completion before returning.
            wait_timeout: Timeout in seconds when wait=True.

        Returns:
            An ExecutionHandle for monitoring the execution.
        """
        response = self._client._request(
            "POST",
            f"/blocks/{block_id}/run",
            json_data={"input": input or {}},
        )

        execution_id = response["executionId"]

        handle = ExecutionHandle(
            id=execution_id,
            get_status=lambda: self._client.executions.get(execution_id),
            wait_for_completion=lambda timeout: self._client.executions.wait_for_completion(
                execution_id, timeout or wait_timeout
            ),
            stream=lambda: self._client.executions.stream(execution_id),
        )

        if wait:
            handle.wait(wait_timeout)

        return handle


class ExecutionsAPI:
    """Executions API."""

    def __init__(self, client: BaleyUI):
        self._client = client

    def get(self, execution_id: str) -> Execution:
        """Get the status of an execution."""
        response = self._client._request("GET", f"/executions/{execution_id}")
        return Execution(**response.get("execution", response))

    def wait_for_completion(
        self,
        execution_id: str,
        timeout: int = DEFAULT_WAIT_TIMEOUT,
    ) -> Execution:
        """
        Wait for an execution to complete.

        Args:
            execution_id: The ID of the execution.
            timeout: Timeout in seconds (default: 5 minutes).

        Returns:
            The completed execution.

        Raises:
            TimeoutError: If the execution doesn't complete within the timeout.
        """
        start_time = time.time()
        poll_interval = 1.0  # 1 second

        while time.time() - start_time < timeout:
            execution = self.get(execution_id)

            if execution.status.value in ("completed", "failed", "cancelled"):
                return execution

            time.sleep(poll_interval)

        raise TimeoutError(timeout * 1000)

    def stream(self, execution_id: str, from_index: int = 0) -> Iterator[ExecutionEvent]:
        """
        Stream execution events.

        Args:
            execution_id: The ID of the execution.
            from_index: Start streaming from this event index (for reconnection).

        Yields:
            ExecutionEvent objects as they occur.
        """
        url = f"{self._client._base_url}/api/v1/executions/{execution_id}/stream"
        params = {"fromIndex": from_index}

        with httpx.stream(
            "GET",
            url,
            params=params,
            headers={
                "Authorization": f"Bearer {self._client._api_key}",
                "Accept": "text/event-stream",
            },
            timeout=None,  # No timeout for streaming
        ) as response:
            if not response.is_success:
                raise BaleyUIError(
                    f"Failed to stream execution: {response.reason_phrase}",
                    response.status_code,
                )

            for line in response.iter_lines():
                if line.startswith("data: "):
                    data = line[6:]

                    if data == "[DONE]":
                        return

                    try:
                        event_data = json.loads(data)
                        event = ExecutionEvent(**event_data)
                        yield event

                        if event.type in ("execution_complete", "execution_error"):
                            return
                    except json.JSONDecodeError:
                        pass  # Ignore malformed events

    async def stream_async(
        self, execution_id: str, from_index: int = 0
    ) -> AsyncIterator[ExecutionEvent]:
        """
        Stream execution events asynchronously.

        Args:
            execution_id: The ID of the execution.
            from_index: Start streaming from this event index (for reconnection).

        Yields:
            ExecutionEvent objects as they occur.
        """
        url = f"{self._client._base_url}/api/v1/executions/{execution_id}/stream"
        params = {"fromIndex": from_index}

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "GET",
                url,
                params=params,
                headers={
                    "Authorization": f"Bearer {self._client._api_key}",
                    "Accept": "text/event-stream",
                },
                timeout=None,
            ) as response:
                if not response.is_success:
                    raise BaleyUIError(
                        f"Failed to stream execution: {response.reason_phrase}",
                        response.status_code,
                    )

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]

                        if data == "[DONE]":
                            return

                        try:
                            event_data = json.loads(data)
                            event = ExecutionEvent(**event_data)
                            yield event

                            if event.type in ("execution_complete", "execution_error"):
                                return
                        except json.JSONDecodeError:
                            pass  # Ignore malformed events
