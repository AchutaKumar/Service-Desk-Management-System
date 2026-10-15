"""
Ticket Views.

All ticket-related endpoints including:
- Listing and creating tickets (role-filtered)
- Ticket detail
- Assigning tickets
- Status workflow management
- Comments
- Attachments
- History (audit log)
- Priority management
"""
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema, OpenApiParameter

from common.responses import (
    success_response, created_response, error_response,
    not_found_response, forbidden_response
)
from common.pagination import StandardResultsPagination
from accounts.permissions import IsAdmin, IsAdminOrAgent
from .models import ServiceRequest, TicketComment, TicketAttachment, TicketHistory, Priority
from .serializers import (
    TicketListSerializer, TicketDetailSerializer, TicketCreateSerializer,
    TicketStatusChangeSerializer, TicketAssignSerializer,
    TicketCommentSerializer, TicketCommentCreateSerializer,
    TicketAttachmentSerializer, TicketAttachmentUploadSerializer,
    TicketHistorySerializer, PrioritySerializer,
)
from .permissions import CanViewTicket, CanManageTicket, IsCommentOwner
from .filters import TicketFilter
from .services import (
    calculate_due_date, auto_assign_ticket, log_history,
    notify_ticket_created, notify_ticket_assigned,
    notify_status_changed, notify_comment_added,
)

User = get_user_model()


# ─────────────────────────────────────────
# Priority CRUD
# ─────────────────────────────────────────

class PriorityListView(APIView):
    """GET /api/tickets/priorities/ - List all priorities."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="List priorities with SLA hours", tags=["Priorities"])
    def get(self, request):
        priorities = Priority.objects.all()
        return success_response(data=PrioritySerializer(priorities, many=True).data)


class PriorityDetailView(APIView):
    """PATCH /api/tickets/priorities/{id}/ - Update SLA hours (Admin only)."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Update priority SLA hours", tags=["Priorities"])
    def patch(self, request, pk):
        try:
            priority = Priority.objects.get(pk=pk)
        except Priority.DoesNotExist:
            return not_found_response("Priority not found.")
        s = PrioritySerializer(priority, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return success_response("Priority updated.", s.data)
        return error_response("Update failed.", errors=s.errors)


# ─────────────────────────────────────────
# Ticket List and Create
# ─────────────────────────────────────────

class TicketListCreateView(APIView):
    """
    GET  /api/tickets/ - List tickets (role-filtered)
    POST /api/tickets/ - Create a new ticket (Employee or Admin)

    IMPORTANT: The list is role-filtered:
    - Employee: Only sees their own tickets
    - Agent: Sees tickets assigned to them + unassigned tickets
    - Admin: Sees all tickets
    """
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        """
        Return filtered queryset based on user role.
        Uses select_related() to avoid N+1 queries for related objects.
        """
        qs = ServiceRequest.objects.select_related(
            'category', 'subcategory', 'priority',
            'department', 'created_by', 'assigned_to'
        )

        user = request.user
        if user.role == 'EMPLOYEE':
            # Employees only see their own tickets
            qs = qs.filter(created_by=user)
        elif user.role == 'SUPPORT_AGENT':
            # Agents see tickets assigned to them OR unassigned tickets they can pick up
            from django.db.models import Q
            qs = qs.filter(
                Q(assigned_to=user) | Q(status=ServiceRequest.Status.OPEN, assigned_to__isnull=True)
            )
        # Admins see all tickets (no filter applied)

        # Apply filters from query params
        ticket_filter = TicketFilter(request.GET, queryset=qs)
        qs = ticket_filter.qs

        # Apply search
        search = request.GET.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(ticket_id__icontains=search) |
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(category__name__icontains=search) |
                Q(created_by__first_name__icontains=search) |
                Q(created_by__last_name__icontains=search) |
                Q(assigned_to__first_name__icontains=search) |
                Q(assigned_to__last_name__icontains=search)
            )

        # Apply ordering
        ordering = request.GET.get('ordering', '-created_at')
        allowed_orderings = [
            'created_at', '-created_at', 'updated_at', '-updated_at',
            'due_at', '-due_at', 'status', '-status',
        ]
        if ordering in allowed_orderings:
            qs = qs.order_by(ordering)

        return qs

    @extend_schema(
        summary="List tickets",
        parameters=[
            OpenApiParameter('status', description='Filter by status'),
            OpenApiParameter('priority__name', description='Filter by priority'),
            OpenApiParameter('search', description='Search in title, description, ticket ID'),
            OpenApiParameter('ordering', description='Sort by field (e.g., -created_at)'),
            OpenApiParameter('page', description='Page number'),
            OpenApiParameter('page_size', description='Items per page'),
        ],
        tags=["Tickets"],
    )
    def get(self, request):
        qs = self.get_queryset(request)

        # Paginate the results
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            serializer = TicketListSerializer(page, many=True, context={'request': request})
            return paginator.get_paginated_response(serializer.data)

        serializer = TicketListSerializer(qs, many=True, context={'request': request})
        return success_response(data=serializer.data)

    @extend_schema(
        request=TicketCreateSerializer,
        summary="Create a new ticket",
        tags=["Tickets"],
    )
    def post(self, request):
        # Only employees and admins can create tickets
        if request.user.role == 'SUPPORT_AGENT':
            return forbidden_response("Support agents cannot create tickets.")

        serializer = TicketCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Ticket creation failed.", errors=serializer.errors)

        # Create the ticket (ticket_id auto-generated in model.save())
        ticket = serializer.save(
            created_by=request.user,
            status=ServiceRequest.Status.OPEN,
        )

        # Calculate and set the due date based on priority SLA
        ticket.due_at = calculate_due_date(ticket.created_at, ticket.priority)
        ticket.save(update_fields=['due_at'])

        # Log the creation in history
        log_history(
            ticket=ticket,
            user=request.user,
            action=TicketHistory.ActionType.CREATED,
            description=f"Ticket {ticket.ticket_id} created by {request.user.get_full_name()}",
        )

        # Try auto-assignment
        assigned_agent = auto_assign_ticket(ticket)
        if assigned_agent:
            log_history(
                ticket=ticket,
                user=None,  # System action
                action=TicketHistory.ActionType.ASSIGNED,
                new_value=assigned_agent.get_full_name(),
                description=f"Auto-assigned to {assigned_agent.get_full_name()}",
            )

        # Send notifications
        notify_ticket_created(ticket)
        if ticket.assigned_to:
            notify_ticket_assigned(ticket)

        return created_response(
            message=f"Ticket {ticket.ticket_id} created successfully.",
            data=TicketDetailSerializer(ticket, context={'request': request}).data,
        )


# ─────────────────────────────────────────
# Ticket Detail, Update
# ─────────────────────────────────────────

class TicketDetailView(APIView):
    """
    GET   /api/tickets/{id}/ - Get full ticket details
    PATCH /api/tickets/{id}/ - Update ticket (Admin only)
    DELETE /api/tickets/{id}/ - Delete ticket (Admin only)
    """
    permission_classes = [IsAuthenticated]

    def get_object(self, pk, user):
        try:
            ticket = ServiceRequest.objects.select_related(
                'category', 'subcategory', 'priority', 'department',
                'created_by', 'assigned_to',
            ).prefetch_related(
                'comments__user',
                'attachments__uploaded_by',
                'history__changed_by',
            ).get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return None, not_found_response("Ticket not found.")

        # Permission check
        can_view = (
            user.role == 'ADMIN' or
            ticket.created_by == user or
            ticket.assigned_to == user
        )
        if not can_view:
            return None, forbidden_response()

        return ticket, None

    @extend_schema(summary="Get ticket detail", tags=["Tickets"])
    def get(self, request, pk):
        ticket, error = self.get_object(pk, request.user)
        if error:
            return error
        return success_response(data=TicketDetailSerializer(ticket, context={'request': request}).data)

    @extend_schema(summary="Delete ticket (Admin only)", tags=["Tickets"])
    def delete(self, request, pk):
        if request.user.role != 'ADMIN':
            return forbidden_response("Only admins can delete tickets.")
        ticket, error = self.get_object(pk, request.user)
        if error:
            return error
        ticket_id = ticket.ticket_id
        ticket.delete()
        return success_response(f"Ticket {ticket_id} deleted.")


# ─────────────────────────────────────────
# Ticket Actions
# ─────────────────────────────────────────

class TicketAssignView(APIView):
    """POST /api/tickets/{id}/assign/ - Assign ticket to an agent (Admin only)."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(request=TicketAssignSerializer, summary="Assign ticket to agent", tags=["Ticket Actions"])
    def post(self, request, pk):
        try:
            ticket = ServiceRequest.objects.select_related('assigned_to', 'created_by').get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return not_found_response("Ticket not found.")

        if ticket.status == ServiceRequest.Status.CLOSED:
            return error_response("Cannot assign a closed ticket.")

        serializer = TicketAssignSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Invalid assignment.", errors=serializer.errors)

        agent = User.objects.get(id=serializer.validated_data['agent_id'])
        old_agent = ticket.assigned_to

        ticket.assigned_to = agent
        if ticket.status == ServiceRequest.Status.OPEN:
            ticket.status = ServiceRequest.Status.ASSIGNED
        ticket.save(update_fields=['assigned_to', 'status', 'updated_at'])

        action = TicketHistory.ActionType.REASSIGNED if old_agent else TicketHistory.ActionType.ASSIGNED
        log_history(
            ticket=ticket, user=request.user, action=action,
            old_value=old_agent.get_full_name() if old_agent else None,
            new_value=agent.get_full_name(),
        )

        notify_ticket_assigned(ticket)
        return success_response(
            f"Ticket assigned to {agent.get_full_name()}.",
            data=TicketDetailSerializer(ticket, context={'request': request}).data,
        )


class TicketStatusChangeView(APIView):
    """PATCH /api/tickets/{id}/status/ - Change ticket status."""
    permission_classes = [IsAuthenticated]

    @extend_schema(request=TicketStatusChangeSerializer, summary="Change ticket status", tags=["Ticket Actions"])
    def patch(self, request, pk):
        try:
            ticket = ServiceRequest.objects.select_related(
                'created_by', 'assigned_to', 'priority'
            ).get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return not_found_response("Ticket not found.")

        user = request.user
        # Permission: Only agent (if assigned) or admin can change status
        can_change = (
            user.role == 'ADMIN' or
            (user.role == 'SUPPORT_AGENT' and ticket.assigned_to == user)
        )
        if not can_change:
            return forbidden_response("You cannot change this ticket's status.")

        serializer = TicketStatusChangeSerializer(
            data=request.data,
            context={'ticket': ticket}
        )
        if not serializer.is_valid():
            return error_response("Invalid status change.", errors=serializer.errors)

        old_status = ticket.status
        new_status = serializer.validated_data['status']

        ticket.status = new_status
        if new_status == ServiceRequest.Status.RESOLVED:
            ticket.resolved_at = timezone.now()
        ticket.save(update_fields=['status', 'resolved_at', 'updated_at'])

        log_history(
            ticket=ticket, user=user,
            action=TicketHistory.ActionType.STATUS_CHANGED,
            old_value=old_status, new_value=new_status,
        )
        notify_status_changed(ticket, old_status, user)

        return success_response(
            f"Ticket status changed from {old_status} to {new_status}.",
            data=TicketDetailSerializer(ticket, context={'request': request}).data,
        )


class TicketResolveView(APIView):
    """POST /api/tickets/{id}/resolve/ - Mark ticket as resolved."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Resolve ticket", tags=["Ticket Actions"])
    def post(self, request, pk):
        try:
            ticket = ServiceRequest.objects.select_related('created_by', 'assigned_to').get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return not_found_response("Ticket not found.")

        user = request.user
        if user.role not in ['ADMIN', 'SUPPORT_AGENT']:
            return forbidden_response("Only agents and admins can resolve tickets.")
        if user.role == 'SUPPORT_AGENT' and ticket.assigned_to != user:
            return forbidden_response("You can only resolve tickets assigned to you.")

        if not ticket.is_valid_transition(ServiceRequest.Status.RESOLVED):
            return error_response(
                f"Cannot resolve ticket in '{ticket.status}' status. "
                "Move ticket to IN_PROGRESS first."
            )

        old_status = ticket.status
        ticket.status = ServiceRequest.Status.RESOLVED
        ticket.resolved_at = timezone.now()
        ticket.save(update_fields=['status', 'resolved_at', 'updated_at'])

        log_history(
            ticket=ticket, user=user,
            action=TicketHistory.ActionType.RESOLVED,
            old_value=old_status, new_value=ServiceRequest.Status.RESOLVED,
        )
        notify_status_changed(ticket, old_status, user)
        return success_response(f"Ticket {ticket.ticket_id} resolved.")


class TicketCloseView(APIView):
    """POST /api/tickets/{id}/close/ - Close a resolved ticket."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Close ticket", tags=["Ticket Actions"])
    def post(self, request, pk):
        try:
            ticket = ServiceRequest.objects.select_related('created_by', 'assigned_to').get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return not_found_response("Ticket not found.")

        user = request.user
        # Only the ticket owner (employee) or admin can close a ticket
        if user.role not in ['ADMIN', 'EMPLOYEE']:
            return forbidden_response("Only the ticket creator or admin can close a ticket.")
        if user.role == 'EMPLOYEE' and ticket.created_by != user:
            return forbidden_response("You can only close your own tickets.")
        if ticket.status != ServiceRequest.Status.RESOLVED:
            return error_response("Only resolved tickets can be closed.")

        old_status = ticket.status
        ticket.status = ServiceRequest.Status.CLOSED
        ticket.closed_at = timezone.now()
        ticket.save(update_fields=['status', 'closed_at', 'updated_at'])

        log_history(
            ticket=ticket, user=user,
            action=TicketHistory.ActionType.CLOSED,
            old_value=old_status, new_value=ServiceRequest.Status.CLOSED,
        )
        return success_response(f"Ticket {ticket.ticket_id} closed.")


class TicketReopenView(APIView):
    """POST /api/tickets/{id}/reopen/ - Reopen a resolved ticket."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Reopen ticket", tags=["Ticket Actions"])
    def post(self, request, pk):
        try:
            ticket = ServiceRequest.objects.select_related('created_by', 'assigned_to').get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return not_found_response("Ticket not found.")

        user = request.user
        if user.role == 'EMPLOYEE' and ticket.created_by != user:
            return forbidden_response("You can only reopen your own tickets.")
        if user.role == 'SUPPORT_AGENT':
            return forbidden_response("Agents cannot reopen tickets.")
        if ticket.status != ServiceRequest.Status.RESOLVED:
            return error_response("Only resolved tickets can be reopened.")

        old_status = ticket.status
        ticket.status = ServiceRequest.Status.REOPENED
        ticket.resolved_at = None  # Reset resolved date
        ticket.save(update_fields=['status', 'resolved_at', 'updated_at'])

        log_history(
            ticket=ticket, user=user,
            action=TicketHistory.ActionType.REOPENED,
            old_value=old_status, new_value=ServiceRequest.Status.REOPENED,
        )
        notify_status_changed(ticket, old_status, user)
        return success_response(f"Ticket {ticket.ticket_id} reopened.")


# ─────────────────────────────────────────
# Comments
# ─────────────────────────────────────────

class TicketCommentListCreateView(APIView):
    """
    GET  /api/tickets/{id}/comments/ - List comments
    POST /api/tickets/{id}/comments/ - Add comment
    """
    permission_classes = [IsAuthenticated]

    def get_ticket(self, pk, user):
        try:
            ticket = ServiceRequest.objects.get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return None, not_found_response("Ticket not found.")

        can_view = (
            user.role == 'ADMIN' or
            ticket.created_by == user or
            ticket.assigned_to == user
        )
        if not can_view:
            return None, forbidden_response()
        return ticket, None

    @extend_schema(summary="List ticket comments", tags=["Ticket Comments"])
    def get(self, request, pk):
        ticket, error = self.get_ticket(pk, request.user)
        if error:
            return error
        comments = ticket.comments.select_related('user').order_by('created_at')
        return success_response(data=TicketCommentSerializer(
            comments, many=True, context={'request': request}
        ).data)

    @extend_schema(request=TicketCommentCreateSerializer, summary="Add comment", tags=["Ticket Comments"])
    def post(self, request, pk):
        ticket, error = self.get_ticket(pk, request.user)
        if error:
            return error

        if ticket.status == ServiceRequest.Status.CLOSED:
            return error_response("Cannot add comments to a closed ticket.")

        serializer = TicketCommentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Invalid comment.", errors=serializer.errors)

        comment = serializer.save(ticket=ticket, user=request.user)

        log_history(
            ticket=ticket, user=request.user,
            action=TicketHistory.ActionType.COMMENT_ADDED,
            description=f"Comment added by {request.user.get_full_name()}",
        )
        notify_comment_added(ticket, request.user)

        return created_response(
            "Comment added.",
            data=TicketCommentSerializer(comment, context={'request': request}).data,
        )


class TicketCommentDetailView(APIView):
    """
    PATCH  /api/tickets/{ticket_id}/comments/{comment_id}/ - Edit comment
    DELETE /api/tickets/{ticket_id}/comments/{comment_id}/ - Delete comment
    """
    permission_classes = [IsAuthenticated]

    def get_comment(self, ticket_pk, comment_pk, user):
        try:
            comment = TicketComment.objects.select_related('ticket', 'user').get(
                pk=comment_pk, ticket__pk=ticket_pk
            )
        except TicketComment.DoesNotExist:
            return None, not_found_response("Comment not found.")

        if comment.user != user and user.role != 'ADMIN':
            return None, forbidden_response("You can only modify your own comments.")
        return comment, None

    @extend_schema(summary="Edit comment", tags=["Ticket Comments"])
    def patch(self, request, pk, comment_pk):
        comment, error = self.get_comment(pk, comment_pk, request.user)
        if error:
            return error
        serializer = TicketCommentCreateSerializer(comment, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return success_response("Comment updated.", TicketCommentSerializer(comment, context={'request': request}).data)
        return error_response("Update failed.", errors=serializer.errors)

    @extend_schema(summary="Delete comment", tags=["Ticket Comments"])
    def delete(self, request, pk, comment_pk):
        comment, error = self.get_comment(pk, comment_pk, request.user)
        if error:
            return error
        comment.delete()
        return success_response("Comment deleted.")


# ─────────────────────────────────────────
# Attachments
# ─────────────────────────────────────────

class TicketAttachmentView(APIView):
    """
    GET  /api/tickets/{id}/attachments/ - List attachments
    POST /api/tickets/{id}/attachments/ - Upload attachment
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_ticket(self, pk, user):
        try:
            ticket = ServiceRequest.objects.get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return None, not_found_response("Ticket not found.")

        can_view = (
            user.role == 'ADMIN' or
            ticket.created_by == user or
            ticket.assigned_to == user
        )
        if not can_view:
            return None, forbidden_response()
        return ticket, None

    @extend_schema(summary="List ticket attachments", tags=["Ticket Attachments"])
    def get(self, request, pk):
        ticket, error = self.get_ticket(pk, request.user)
        if error:
            return error
        attachments = ticket.attachments.select_related('uploaded_by')
        return success_response(data=TicketAttachmentSerializer(
            attachments, many=True, context={'request': request}
        ).data)

    @extend_schema(
        request=TicketAttachmentUploadSerializer,
        summary="Upload attachment",
        tags=["Ticket Attachments"],
    )
    def post(self, request, pk):
        ticket, error = self.get_ticket(pk, request.user)
        if error:
            return error

        if ticket.status == ServiceRequest.Status.CLOSED:
            return error_response("Cannot add attachments to a closed ticket.")

        serializer = TicketAttachmentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Invalid file.", errors=serializer.errors)

        file = serializer.validated_data['file']
        attachment = TicketAttachment.objects.create(
            ticket=ticket,
            uploaded_by=request.user,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            file_type=file.content_type,
        )

        log_history(
            ticket=ticket, user=request.user,
            action=TicketHistory.ActionType.ATTACHMENT_ADDED,
            new_value=file.name,
            description=f"Attachment '{file.name}' uploaded by {request.user.get_full_name()}",
        )

        return created_response(
            "File uploaded.",
            data=TicketAttachmentSerializer(attachment, context={'request': request}).data,
        )


# ─────────────────────────────────────────
# Ticket History
# ─────────────────────────────────────────

class TicketHistoryView(APIView):
    """GET /api/tickets/{id}/history/ - Get immutable audit log."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Get ticket history / audit log", tags=["Ticket History"])
    def get(self, request, pk):
        try:
            ticket = ServiceRequest.objects.get(pk=pk)
        except ServiceRequest.DoesNotExist:
            return not_found_response("Ticket not found.")

        can_view = (
            request.user.role == 'ADMIN' or
            ticket.created_by == request.user or
            ticket.assigned_to == request.user
        )
        if not can_view:
            return forbidden_response()

        history = ticket.history.select_related('changed_by').order_by('created_at')
        return success_response(data=TicketHistorySerializer(history, many=True).data)


# ─────────────────────────────────────────
# Bulk Actions (Admin only)
# ─────────────────────────────────────────

class TicketBulkActionView(APIView):
    """
    POST /api/tickets/bulk-actions/ - Perform bulk operations on multiple tickets.

    Supported actions:
    - bulk_assign:  Assign multiple tickets to an agent
    - bulk_status:  Change status of multiple tickets
    - bulk_close:   Close multiple resolved tickets

    Request body:
    {
        "action": "bulk_assign",
        "ticket_ids": [1, 2, 3],
        "agent_id": 5           # for bulk_assign
        "status": "CLOSED"      # for bulk_status
    }
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(
        summary="Bulk ticket operations (Admin only)",
        tags=["Ticket Actions"],
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'action': {'type': 'string', 'enum': ['bulk_assign', 'bulk_status', 'bulk_close']},
                    'ticket_ids': {'type': 'array', 'items': {'type': 'integer'}},
                    'agent_id': {'type': 'integer', 'description': 'Required for bulk_assign'},
                    'status': {'type': 'string', 'description': 'Required for bulk_status'},
                },
                'required': ['action', 'ticket_ids'],
            }
        }
    )
    def post(self, request):
        action = request.data.get('action')
        ticket_ids = request.data.get('ticket_ids', [])

        if not ticket_ids:
            return error_response('ticket_ids is required and must not be empty.')

        if not isinstance(ticket_ids, list):
            return error_response('ticket_ids must be a list of integers.')

        tickets = ServiceRequest.objects.filter(id__in=ticket_ids)
        found_ids = list(tickets.values_list('id', flat=True))
        missing_ids = [tid for tid in ticket_ids if tid not in found_ids]

        if missing_ids:
            return error_response(
                f"The following ticket IDs were not found: {missing_ids}"
            )

        if action == 'bulk_assign':
            return self._bulk_assign(request, tickets)
        elif action == 'bulk_status':
            return self._bulk_status(request, tickets)
        elif action == 'bulk_close':
            return self._bulk_close(request, tickets)
        else:
            return error_response(
                f"Unknown action '{action}'. Supported: bulk_assign, bulk_status, bulk_close."
            )

    def _bulk_assign(self, request, tickets):
        """Assign multiple tickets to an agent."""
        agent_id = request.data.get('agent_id')
        if not agent_id:
            return error_response('agent_id is required for bulk_assign.')

        try:
            agent = User.objects.get(id=agent_id, role='SUPPORT_AGENT', is_active=True)
        except User.DoesNotExist:
            return error_response('No active support agent found with the given agent_id.')

        updated_count = 0
        for ticket in tickets:
            if ticket.status == ServiceRequest.Status.CLOSED:
                continue  # Skip closed tickets

            old_agent = ticket.assigned_to
            ticket.assigned_to = agent
            if ticket.status == ServiceRequest.Status.OPEN:
                ticket.status = ServiceRequest.Status.ASSIGNED
            ticket.save(update_fields=['assigned_to', 'status', 'updated_at'])

            action_type = TicketHistory.ActionType.REASSIGNED if old_agent else TicketHistory.ActionType.ASSIGNED
            log_history(
                ticket=ticket, user=request.user,
                action=action_type,
                old_value=old_agent.get_full_name() if old_agent else None,
                new_value=agent.get_full_name(),
                description=f'Bulk assigned to {agent.get_full_name()} by {request.user.get_full_name()}',
            )
            notify_ticket_assigned(ticket)
            updated_count += 1

        return success_response(
            f'{updated_count} tickets assigned to {agent.get_full_name()}.'
        )

    def _bulk_status(self, request, tickets):
        """Change status of multiple tickets."""
        from django.utils import timezone as tz
        new_status = request.data.get('status')
        if not new_status:
            return error_response('status is required for bulk_status.')

        valid_statuses = [s[0] for s in ServiceRequest.Status.choices]
        if new_status not in valid_statuses:
            return error_response(
                f"Invalid status '{new_status}'. Valid options: {valid_statuses}"
            )

        updated_count = 0
        skipped = 0
        for ticket in tickets:
            if not ticket.is_valid_transition(new_status):
                skipped += 1
                continue

            old_status = ticket.status
            ticket.status = new_status
            if new_status == ServiceRequest.Status.RESOLVED:
                ticket.resolved_at = tz.now()
            elif new_status == ServiceRequest.Status.CLOSED:
                ticket.closed_at = tz.now()
            ticket.save(update_fields=['status', 'resolved_at', 'closed_at', 'updated_at'])

            log_history(
                ticket=ticket, user=request.user,
                action=TicketHistory.ActionType.STATUS_CHANGED,
                old_value=old_status,
                new_value=new_status,
                description=f'Bulk status change by {request.user.get_full_name()}',
            )
            notify_status_changed(ticket, old_status, request.user)
            updated_count += 1

        msg = f'{updated_count} tickets updated to {new_status}.'
        if skipped:
            msg += f' {skipped} tickets skipped (invalid transitions).'
        return success_response(msg)

    def _bulk_close(self, request, tickets):
        """Close all resolved tickets in the selection."""
        from django.utils import timezone as tz

        updated_count = 0
        skipped = 0
        for ticket in tickets:
            if ticket.status != ServiceRequest.Status.RESOLVED:
                skipped += 1
                continue

            old_status = ticket.status
            ticket.status = ServiceRequest.Status.CLOSED
            ticket.closed_at = tz.now()
            ticket.save(update_fields=['status', 'closed_at', 'updated_at'])

            log_history(
                ticket=ticket, user=request.user,
                action=TicketHistory.ActionType.CLOSED,
                old_value=old_status,
                new_value=ServiceRequest.Status.CLOSED,
                description=f'Bulk closed by {request.user.get_full_name()}',
            )
            updated_count += 1

        msg = f'{updated_count} tickets closed.'
        if skipped:
            msg += f' {skipped} tickets skipped (only RESOLVED tickets can be closed).'
        return success_response(msg)