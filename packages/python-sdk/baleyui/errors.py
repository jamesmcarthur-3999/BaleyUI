"""
BaleyUI SDK Errors
"""

from typing import Optional


class BaleyUIError(Exception):
    """Base error class for BaleyUI SDK errors."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        code: Optional[str] = None,
        details: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.message!r})"


class AuthenticationError(BaleyUIError):
    """Raised when the API key is invalid or missing."""

    def __init__(self, message: str = "Invalid or missing API key"):
        super().__init__(message, status_code=401, code="authentication_error")


class PermissionError(BaleyUIError):
    """Raised when the API key doesn't have sufficient permissions."""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, status_code=403, code="permission_error")


class NotFoundError(BaleyUIError):
    """Raised when a requested resource is not found."""

    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            f"{resource} not found: {resource_id}",
            status_code=404,
            code="not_found",
        )
        self.resource = resource
        self.resource_id = resource_id


class ValidationError(BaleyUIError):
    """Raised when the request is invalid."""

    def __init__(self, message: str, details: Optional[str] = None):
        super().__init__(message, status_code=400, code="validation_error", details=details)


class RateLimitError(BaleyUIError):
    """Raised when rate limits are exceeded."""

    def __init__(self, retry_after: Optional[int] = None):
        super().__init__("Rate limit exceeded", status_code=429, code="rate_limit_error")
        self.retry_after = retry_after


class TimeoutError(BaleyUIError):
    """Raised when an execution times out."""

    def __init__(self, timeout: int):
        super().__init__(f"Execution timed out after {timeout}ms", code="timeout_error")
        self.timeout = timeout


class ConnectionError(BaleyUIError):
    """Raised when a connection error occurs."""

    def __init__(self, message: str = "Failed to connect to BaleyUI API"):
        super().__init__(message, code="connection_error")
