"""
Standardized API Response Helpers

Every API response follows this format:

Success:
    {
        "success": true,
        "message": "...",
        "data": {...}
    }

Error:
    {
        "success": false,
        "message": "...",
        "errors": {...}
    }
"""
from rest_framework.response import Response
from rest_framework import status


def success_response(message="Success", data=None, status_code=status.HTTP_200_OK):
    """Return a standardized success response."""
    return Response(
        {
            "success": True,
            "message": message,
            "data": data if data is not None else {},
        },
        status=status_code,
    )


def created_response(message="Created successfully", data=None):
    """Return a 201 Created response."""
    return success_response(message, data, status_code=status.HTTP_201_CREATED)


def error_response(message="An error occurred", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    """Return a standardized error response."""
    return Response(
        {
            "success": False,
            "message": message,
            "errors": errors if errors is not None else {},
        },
        status=status_code,
    )


def not_found_response(message="Resource not found"):
    """Return a 404 Not Found response."""
    return error_response(message, status_code=status.HTTP_404_NOT_FOUND)


def forbidden_response(message="You do not have permission to perform this action."):
    """Return a 403 Forbidden response."""
    return error_response(message, status_code=status.HTTP_403_FORBIDDEN)


def unauthorized_response(message="Authentication credentials were not provided."):
    """Return a 401 Unauthorized response."""
    return error_response(message, status_code=status.HTTP_401_UNAUTHORIZED)


def conflict_response(message="Conflict", errors=None):
    """Return a 409 Conflict response."""
    return error_response(message, errors, status_code=status.HTTP_409_CONFLICT)
