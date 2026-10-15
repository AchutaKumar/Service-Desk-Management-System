"""
Ticket Business Logic Services.

This module contains all complex business logic extracted from views/serializers.
Keeping business logic here makes views thin and testable.

Services:
- calculate_due_date(): SLA calculation
- get_sla_status(): SLA status determination
- auto_assign_ticket(): Automatic ticket assignment
- log_history(): Audit log creation
- create_notifications(): Notification generation
"""
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count, Q


def calculate_due_date(created_at, priority):
    """
    Calculate the ticket due date based on priority SLA hours.

    Example:
        Created: 10:00 AM
        Priority: HIGH (8 hours)
        Due At: 6:00 PM
    """
    return created_at + timedelta(hours=priority.sla_hours)


def get_sla_status(ticket):
    """
    Determine the SLA status of a ticket.

    Returns:
        RESOLVED_WITHIN_SLA - Ticket resolved before due date
        RESOLVED_AFTER_SLA  - Ticket resolved after due date
        OVERDUE             - Past due date, not yet resolved
        NEAR_SLA            - Within 2 hours of due date
        WITHIN_SLA          - Comfortably within SLA
    """
    if not ticket.due_at:
        return 'NO_SLA'

    now = timezone.now()

    # Check resolved tickets first
    if ticket.resolved_at:
        if ticket.resolved_at <= ticket.due_at:
            return 'RESOLVED_WITHIN_SLA'
        return 'RESOLVED_AFTER_SLA'

    # For closed tickets
    if ticket.status == 'CLOSED':
        return 'RESOLVED_WITHIN_SLA' if ticket.closed_at <= ticket.due_at else 'RESOLVED_AFTER_SLA'

    # For active tickets
    if now > ticket.due_at:
        return 'OVERDUE'
    elif now > ticket.due_at - timedelta(hours=2):
        return 'NEAR_SLA'

    return 'WITHIN_SLA'


def auto_assign_ticket(ticket):
    """
    Automatically assign a ticket to the support agent with the lowest workload
    who handles tickets in the same category.

    Algorithm:
    1. Find all active support agents
    2. Count their currently open/assigned/in-progress tickets (workload)
    3. Pick the agent with the lowest workload
    4. Assign the ticket to them

    WHY: This distributes work evenly across agents without manual admin intervention.
    """
    from django.contrib.auth import get_user_model
    from .models import ServiceRequest

    User = get_user_model()

    # Find active agents with their current workload
    # Using annotate() to count tickets in a single database query (avoids N+1)
    agents = User.objects.filter(
        role='SUPPORT_AGENT',
        is_active=True,
    ).annotate(
        workload=Count(
            'assigned_tickets',
            filter=Q(
                assigned_tickets__status__in=[
                    ServiceRequest.Status.OPEN,
                    ServiceRequest.Status.ASSIGNED,
                    ServiceRequest.Status.IN_PROGRESS,
                    ServiceRequest.Status.WAITING_FOR_USER,
                ]
            )
        )
    ).order_by('workload')

    if agents.exists():
        agent = agents.first()
        ticket.assigned_to = agent
        ticket.status = ServiceRequest.Status.ASSIGNED
        ticket.save(update_fields=['assigned_to', 'status', 'updated_at'])
        return agent

    return None


def log_history(ticket, user, action, old_value=None, new_value=None, description=''):
    """
    Create an immutable audit log entry for a ticket action.

    This is called every time something important happens to a ticket.
    The history cannot be deleted or modified by normal users.
    """
    from .models import TicketHistory
    return TicketHistory.objects.create(
        ticket=ticket,
        changed_by=user,
        action=action,
        old_value=str(old_value) if old_value is not None else None,
        new_value=str(new_value) if new_value is not None else None,
        description=description,
    )


def create_notification(recipient, ticket, message):
    """
    Create an in-app notification for a user about a ticket event.
    """
    from notifications.models import Notification
    Notification.objects.create(
        recipient=recipient,
        ticket=ticket,
        message=message,
    )


def notify_ticket_created(ticket):
    """Notify admin(s) when a new ticket is created."""
    from django.contrib.auth import get_user_model
    User = get_user_model()

    # Notify all admins
    admins = User.objects.filter(role='ADMIN', is_active=True)
    for admin in admins:
        create_notification(
            recipient=admin,
            ticket=ticket,
            message=f"New ticket {ticket.ticket_id} created by {ticket.created_by.get_full_name()}: {ticket.title}",
        )


def notify_ticket_assigned(ticket):
    """Notify the assigned agent and the ticket creator when a ticket is assigned."""
    if ticket.assigned_to:
        create_notification(
            recipient=ticket.assigned_to,
            ticket=ticket,
            message=f"Ticket {ticket.ticket_id} has been assigned to you: {ticket.title}",
        )
    # Notify the employee
    create_notification(
        recipient=ticket.created_by,
        ticket=ticket,
        message=f"Your ticket {ticket.ticket_id} has been assigned to {ticket.assigned_to.get_full_name() if ticket.assigned_to else 'an agent'}.",
    )


def notify_status_changed(ticket, old_status, changed_by):
    """Notify relevant users when ticket status changes."""
    # Notify ticket creator
    create_notification(
        recipient=ticket.created_by,
        ticket=ticket,
        message=f"Your ticket {ticket.ticket_id} status changed from {old_status} to {ticket.status}.",
    )
    # Notify assigned agent (if different from person who changed status)
    if ticket.assigned_to and ticket.assigned_to != changed_by:
        create_notification(
            recipient=ticket.assigned_to,
            ticket=ticket,
            message=f"Ticket {ticket.ticket_id} status changed to {ticket.status}.",
        )


def notify_comment_added(ticket, commenter):
    """Notify relevant users when a comment is added."""
    # Notify ticket creator (unless they are the commenter)
    if ticket.created_by != commenter:
        create_notification(
            recipient=ticket.created_by,
            ticket=ticket,
            message=f"{commenter.get_full_name()} commented on your ticket {ticket.ticket_id}.",
        )
    # Notify assigned agent (unless they are the commenter)
    if ticket.assigned_to and ticket.assigned_to != commenter:
        create_notification(
            recipient=ticket.assigned_to,
            ticket=ticket,
            message=f"{commenter.get_full_name()} commented on ticket {ticket.ticket_id}.",
        )