"""
DEPRECATED: This file is a legacy duplicate of common/responses.py.
Import from common.responses instead.
"""
# Re-export the canonical helpers so any accidental imports still work.
from common.responses import (  # noqa: F401
    success_response as ok,
    created_response as created,
    error_response as fail,
)