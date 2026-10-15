"""
Core Ticket Models.

This is the heart of the ServiceDesk system.

Models:
- Priority: LOW/MEDIUM/HIGH/CRITICAL with configurable SLA hours
- ServiceRequest: The main ticket model
- TicketComment: Comments on tickets
- TicketAttachment: File attachments
- TicketHistory: Immutable audit log of all changes
"""
import os
import uuid
from django.db import models
from django.utils import timezone
from django.conf import settings


class Priority(models.Model):
    """
    Ticket priority with configurable SLA hours.
    WHY: Storing SLA hours in the database allows admins to change them
    without touching any code.
    """

    class PriorityLevel(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'
        CRITICAL = 'CRITICAL', 'Critical'

    name = models.CharField(
        max_length=20,
        choices=PriorityLevel.choices,
        unique=True,
    )
    sla_hours = models.PositiveIntegerField(
        help_text="Number of hours within which the ticket must be resolved."
    )
    description = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'tickets_priority'
        verbose_name_plural = 'Priorities'
        ordering = ['sla_hours']

    def __str__(self):
        return f"{self.name} ({self.sla_hours}h SLA)"


class ServiceRequest(models.Model):
    """
    Main ticket model. Represents a single IT service request.

    Ticket ID format: SR-1001, SR-1002, etc.
    This is auto-generated - employees do not type it manually.
    """

    class Status(models.TextChoices):
        OPEN = 'OPEN', 'Open'
        ASSIGNED = 'ASSIGNED', 'Assigned'
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        WAITING_FOR_USER = 'WAITING_FOR_USER', 'Waiting For User'
        RESOLVED = 'RESOLVED', 'Resolved'
        CLOSED = 'CLOSED', 'Closed'
        REOPENED = 'REOPENED', 'Reopened'

    # Valid transitions map: current_status -> allowed_next_statuses
    VALID_TRANSITIONS = {
        Status.OPEN: [Status.ASSIGNED, Status.IN_PROGRESS],
        Status.ASSIGNED: [Status.IN_PROGRESS, Status.OPEN],
        Status.IN_PROGRESS: [Status.WAITING_FOR_USER, Status.RESOLVED],
        Status.WAITING_FOR_USER: [Status.IN_PROGRESS],
        Status.RESOLVED: [Status.CLOSED, Status.REOPENED],
        Status.REOPENED: [Status.IN_PROGRESS, Status.ASSIGNED],
        Status.CLOSED: [],  # Terminal state - no transitions allowed
    }

    # Auto-generated ticket ID (SR-1001)
    ticket_id = models.CharField(max_length=20, unique=True, db_index=True, editable=False)

    # Core ticket information
    title = models.CharField(max_length=255)
    description = models.TextField()

    # Classification
    category = models.ForeignKey(
        'categories.Category',
        on_delete=models.PROTECT,
        related_name='tickets',
    )
    subcategory = models.ForeignKey(
        'categories.SubCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets',
    )
    priority = models.ForeignKey(
        Priority,
        on_delete=models.PROTECT,
        related_name='tickets',
    )
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets',
    )

    # People involved
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_tickets',
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tickets',
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'tickets_servicerequest'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['priority']),
            models.Index(fields=['assigned_to']),
            models.Index(fields=['created_by']),
            models.Index(fields=['due_at']),
            models.Index(fields=['ticket_id']),
        ]

    def __str__(self):
        return f"{self.ticket_id} - {self.title}"

    def save(self, *args, **kwargs):
        # Auto-generate ticket_id on first save
        if not self.ticket_id:
            self.ticket_id = self._generate_ticket_id()
        super().save(*args, **kwargs)

    @classmethod
    def _generate_ticket_id(cls):
        """
        Generate a sequential ticket ID like SR-1001.
        Gets the highest existing ticket number and increments it.
        """
        last_ticket = cls.objects.order_by('-id').first()
        if last_ticket and last_ticket.ticket_id:
            try:
                last_num = int(last_ticket.ticket_id.split('-')[1])
                return f"SR-{last_num + 1}"
            except (IndexError, ValueError):
                pass
        return "SR-1001"

    def is_valid_transition(self, new_status):
        """Check if transitioning to new_status is allowed from current status."""
        allowed = self.VALID_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    @property
    def sla_status(self):
        """
        Returns the SLA status of this ticket.
        WITHIN_SLA, NEAR_SLA, OVERDUE, RESOLVED_WITHIN_SLA, RESOLVED_AFTER_SLA
        """
        from tickets.services import get_sla_status
        return get_sla_status(self)

    @property
    def is_overdue(self):
        """True if the ticket is past its due date and not yet resolved/closed."""
        if self.status in [self.Status.RESOLVED, self.Status.CLOSED]:
            return False
        if self.due_at and timezone.now() > self.due_at:
            return True
        return False


class TicketComment(models.Model):
    """
    Comments on a ticket. Both employees and agents can comment.
    Users can only edit/delete their own comments.
    """
    ticket = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name='comments',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ticket_comments',
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tickets_comment'
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.user.get_full_name()} on {self.ticket.ticket_id}"


def attachment_upload_path(instance, filename):
    """
    Generates a safe, organized path for ticket attachments.
    Path: attachments/SR-1001/uuid-filename.ext
    Using UUID prevents filename collisions and directory traversal attacks.
    """
    ext = filename.rsplit('.', 1)[-1].lower()
    safe_name = f"{uuid.uuid4()}.{ext}"
    return os.path.join('attachments', instance.ticket.ticket_id, safe_name)


class TicketAttachment(models.Model):
    """
    File attachments for tickets (screenshots, error logs, documents).
    Implements file type and size validation.
    """
    ticket = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name='attachments',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='uploaded_attachments',
    )
    file = models.FileField(upload_to=attachment_upload_path)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(help_text="File size in bytes")
    file_type = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tickets_attachment'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.original_filename} on {self.ticket.ticket_id}"

    @property
    def file_size_mb(self):
        return round(self.file_size / (1024 * 1024), 2)


class TicketHistory(models.Model):
    """
    Immutable audit log of all ticket changes.

    WHY: Every important action on a ticket is recorded here.
    This provides a complete history that is transparent and
    cannot be modified by normal users.

    Examples:
    - Ticket created
    - Status changed: OPEN → ASSIGNED
    - Priority changed: MEDIUM → HIGH
    - Assigned to: John Doe
    - Comment added
    """

    class ActionType(models.TextChoices):
        CREATED = 'CREATED', 'Ticket Created'
        STATUS_CHANGED = 'STATUS_CHANGED', 'Status Changed'
        ASSIGNED = 'ASSIGNED', 'Assigned'
        REASSIGNED = 'REASSIGNED', 'Reassigned'
        PRIORITY_CHANGED = 'PRIORITY_CHANGED', 'Priority Changed'
        COMMENT_ADDED = 'COMMENT_ADDED', 'Comment Added'
        ATTACHMENT_ADDED = 'ATTACHMENT_ADDED', 'Attachment Added'
        RESOLVED = 'RESOLVED', 'Resolved'
        CLOSED = 'CLOSED', 'Closed'
        REOPENED = 'REOPENED', 'Reopened'

    ticket = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name='history',
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='ticket_history_actions',
    )
    action = models.CharField(max_length=30, choices=ActionType.choices)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tickets_history'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.ticket.ticket_id} - {self.action} at {self.created_at}"