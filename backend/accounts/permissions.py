"""
Custom DRF Permission Classes.

These classes are used across all apps to enforce role-based access control.
Django REST Framework checks these before executing any view logic.
"""
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Only Admin users can access this view."""
    message = "Only administrators can perform this action."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'ADMIN'
        )


class IsSupportAgent(BasePermission):
    """Only Support Agents can access this view."""
    message = "Only support agents can perform this action."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'SUPPORT_AGENT'
        )


class IsEmployee(BasePermission):
    """Only Employees can access this view."""
    message = "Only employees can perform this action."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'EMPLOYEE'
        )


class IsAdminOrAgent(BasePermission):
    """Admins and Support Agents can access this view."""
    message = "Only administrators or support agents can perform this action."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ['ADMIN', 'SUPPORT_AGENT']
        )


class IsAdminOrSelf(BasePermission):
    """
    Admin can access anything. Regular users can only access their own data.
    Used for profile endpoints.
    """
    message = "You can only access your own data."

    def has_object_permission(self, request, view, obj):
        return (
            request.user.role == 'ADMIN' or
            obj == request.user
        )