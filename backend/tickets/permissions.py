"""
Ticket-specific Permission Classes.

These are more granular than the role permissions in accounts/permissions.py.
They check object-level access (e.g., "is this user the ticket owner?").
"""
from rest_framework.permissions import BasePermission


class IsTicketOwner(BasePermission):
    """The requesting user created this ticket."""
    message = "You did not create this ticket."

    def has_object_permission(self, request, view, obj):
        return obj.created_by == request.user


class IsAssignedAgent(BasePermission):
    """The requesting user is the agent assigned to this ticket."""
    message = "You are not the assigned agent for this ticket."

    def has_object_permission(self, request, view, obj):
        return obj.assigned_to == request.user


class CanViewTicket(BasePermission):
    """
    User can view a ticket if:
    - They created it (Employee)
    - They are assigned to it (Agent)
    - They are an Admin
    """
    message = "You do not have permission to view this ticket."

    def has_object_permission(self, request, view, obj):
        user = request.user
        return (
            user.role == 'ADMIN' or
            obj.created_by == user or
            obj.assigned_to == user
        )


class CanManageTicket(BasePermission):
    """
    User can manage (update, change status) a ticket if:
    - They are the assigned agent
    - They are an Admin
    Employees cannot manage tickets (they can only create, view, comment, close, reopen own tickets).
    """
    message = "You do not have permission to manage this ticket."

    def has_object_permission(self, request, view, obj):
        user = request.user
        return (
            user.role == 'ADMIN' or
            obj.assigned_to == user
        )


class CanCommentOnTicket(BasePermission):
    """
    User can comment on a ticket if they can view it AND the ticket is not CLOSED.
    """
    message = "You cannot comment on this ticket."

    def has_object_permission(self, request, view, obj):
        user = request.user
        can_view = (
            user.role == 'ADMIN' or
            obj.created_by == user or
            obj.assigned_to == user
        )
        not_closed = obj.status != 'CLOSED'
        return can_view and not_closed


class IsCommentOwner(BasePermission):
    """The user owns this specific comment."""
    message = "You did not write this comment."

    def has_object_permission(self, request, view, obj):
        return obj.user == request.user or request.user.role == 'ADMIN'
