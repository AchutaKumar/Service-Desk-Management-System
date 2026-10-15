"""
Custom exception handler.
Maps all DRF exceptions to the standardized response format.
"""
from rest_framework.views import exception_handler
from rest_framework.exceptions import (
    ValidationError, AuthenticationFailed, NotAuthenticated,
    PermissionDenied, NotFound
)
from rest_framework import status
from rest_framework.response import Response


def custom_exception_handler(exc, context):
    """
    Custom exception handler that wraps all DRF errors into the
    standardized { success, message, errors } format.

    Django REST Framework calls this function for every exception
    that occurs in a view.
    """
    # Call DRF's default handler to get the standard error response
    response = exception_handler(exc, context)

    if response is not None:
        # Map common exceptions to friendly messages
        if isinstance(exc, NotAuthenticated):
            message = "Authentication credentials were not provided."
        elif isinstance(exc, AuthenticationFailed):
            message = "Invalid authentication credentials."
        elif isinstance(exc, PermissionDenied):
            message = "You do not have permission to perform this action."
        elif isinstance(exc, NotFound):
            message = "The requested resource was not found."
        elif isinstance(exc, ValidationError):
            message = "Validation failed. Please check your input."
        else:
            message = "An error occurred."

        # Reformat the response
        errors = response.data
        if isinstance(errors, dict) and 'detail' in errors:
            message = str(errors['detail'])
            errors = {}

        response.data = {
            "success": False,
            "message": message,
            "errors": errors if isinstance(errors, dict) else {"detail": errors},
        }

    return response