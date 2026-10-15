"""
Dashboard views for each role.

Uses Django ORM aggregation (Count, annotate) to compute stats in a single
database query instead of making multiple API calls.

WHY aggregation?
Instead of fetching all tickets and counting in Python (slow),
we use COUNT at the database level (fast, efficient).
"""
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from common.responses import success_response, forbidden_response
from accounts.permissions import IsAdmin, IsSupportAgent, IsEmployee


class EmployeeDashboardView(APIView):
    """GET /api/dashboard/employee/ - Employee's own ticket statistics."""
    permission_classes = [IsAuthenticated, IsEmployee]

    @extend_schema(summary="Employee dashboard stats", tags=["Dashboard"])
    def get(self, request):
        from tickets.models import ServiceRequest
        from tickets.serializers import TicketListSerializer

        user = request.user
        # Base queryset for this employee's tickets
        # Using select_related for efficiency
        qs = ServiceRequest.objects.filter(
            created_by=user
        ).select_related('category', 'priority', 'assigned_to')

        # Aggregate counts in ONE database query using annotate/aggregate
        stats = qs.aggregate(
            total=Count('id'),
            open=Count('id', filter=Q(status='OPEN')),
            assigned=Count('id', filter=Q(status='ASSIGNED')),
            in_progress=Count('id', filter=Q(status='IN_PROGRESS')),
            waiting=Count('id', filter=Q(status='WAITING_FOR_USER')),
            resolved=Count('id', filter=Q(status='RESOLVED')),
            closed=Count('id', filter=Q(status='CLOSED')),
            reopened=Count('id', filter=Q(status='REOPENED')),
        )

        # Recent tickets (last 5)
        recent = qs.order_by('-created_at')[:5]

        # High priority tickets
        high_priority = qs.filter(
            priority__name__in=['HIGH', 'CRITICAL'],
            status__in=['OPEN', 'ASSIGNED', 'IN_PROGRESS']
        ).order_by('due_at')[:5]

        return success_response(data={
            'ticket_counts': stats,
            'recent_tickets': TicketListSerializer(recent, many=True, context={'request': request}).data,
            'high_priority_tickets': TicketListSerializer(high_priority, many=True, context={'request': request}).data,
        })


class AgentDashboardView(APIView):
    """GET /api/dashboard/agent/ - Agent's ticket workload and stats."""
    permission_classes = [IsAuthenticated, IsSupportAgent]

    @extend_schema(summary="Agent dashboard stats", tags=["Dashboard"])
    def get(self, request):
        from tickets.models import ServiceRequest
        from tickets.serializers import TicketListSerializer

        user = request.user
        now = timezone.now()

        # Agent's assigned tickets
        qs = ServiceRequest.objects.filter(
            assigned_to=user
        ).select_related('category', 'priority', 'created_by')

        stats = qs.aggregate(
            total_assigned=Count('id'),
            open=Count('id', filter=Q(status='OPEN')),
            in_progress=Count('id', filter=Q(status='IN_PROGRESS')),
            waiting=Count('id', filter=Q(status='WAITING_FOR_USER')),
            resolved=Count('id', filter=Q(status='RESOLVED')),
            overdue=Count('id', filter=Q(
                due_at__lt=now,
            ) & ~Q(status__in=['RESOLVED', 'CLOSED'])),
        )

        # Available (unassigned) tickets
        available = ServiceRequest.objects.filter(
            status='OPEN', assigned_to__isnull=True
        ).select_related('category', 'priority').order_by('created_at')[:10]

        # Recently updated
        recent = qs.order_by('-updated_at')[:5]

        # Near SLA breach
        near_sla = qs.filter(
            due_at__gt=now,
            due_at__lte=now + timezone.timedelta(hours=2),
        ).exclude(status__in=['RESOLVED', 'CLOSED']).order_by('due_at')[:5]

        return success_response(data={
            'ticket_counts': stats,
            'available_tickets': TicketListSerializer(available, many=True, context={'request': request}).data,
            'recent_tickets': TicketListSerializer(recent, many=True, context={'request': request}).data,
            'near_sla_breach': TicketListSerializer(near_sla, many=True, context={'request': request}).data,
        })


class AdminDashboardView(APIView):
    """GET /api/dashboard/admin/ - System-wide statistics."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Admin dashboard stats", tags=["Dashboard"])
    def get(self, request):
        from tickets.models import ServiceRequest
        from tickets.serializers import TicketListSerializer
        from django.contrib.auth import get_user_model
        from categories.models import Category
        from departments.models import Department

        User = get_user_model()
        now = timezone.now()

        # Overall ticket stats
        ticket_stats = ServiceRequest.objects.aggregate(
            total=Count('id'),
            open=Count('id', filter=Q(status='OPEN')),
            assigned=Count('id', filter=Q(status='ASSIGNED')),
            in_progress=Count('id', filter=Q(status='IN_PROGRESS')),
            waiting=Count('id', filter=Q(status='WAITING_FOR_USER')),
            resolved=Count('id', filter=Q(status='RESOLVED')),
            closed=Count('id', filter=Q(status='CLOSED')),
            critical=Count('id', filter=Q(priority__name='CRITICAL') & ~Q(status__in=['RESOLVED', 'CLOSED'])),
            overdue=Count('id', filter=Q(due_at__lt=now) & ~Q(status__in=['RESOLVED', 'CLOSED'])),
        )

        # User stats
        user_stats = User.objects.aggregate(
            total_users=Count('id'),
            active_users=Count('id', filter=Q(is_active=True)),
            total_agents=Count('id', filter=Q(role='SUPPORT_AGENT')),
            total_employees=Count('id', filter=Q(role='EMPLOYEE')),
        )

        # Tickets by category (using values() + annotate())
        by_category = ServiceRequest.objects.values(
            'category__name'
        ).annotate(count=Count('id')).order_by('-count')

        # Tickets by priority
        by_priority = ServiceRequest.objects.values(
            'priority__name'
        ).annotate(count=Count('id')).order_by('-count')

        # Tickets by department
        by_department = ServiceRequest.objects.values(
            'department__name'
        ).annotate(count=Count('id')).order_by('-count')

        # Agent workload
        agent_workload = User.objects.filter(
            role='SUPPORT_AGENT', is_active=True
        ).annotate(
            active_tickets=Count(
                'assigned_tickets',
                filter=Q(assigned_tickets__status__in=['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'])
            )
        ).values('id', 'first_name', 'last_name', 'email', 'active_tickets').order_by('-active_tickets')

        # Recent critical/overdue tickets
        urgent_tickets = ServiceRequest.objects.filter(
            Q(priority__name='CRITICAL') | Q(due_at__lt=now)
        ).exclude(status__in=['RESOLVED', 'CLOSED']).select_related(
            'category', 'priority', 'created_by', 'assigned_to'
        ).order_by('due_at')[:10]

        return success_response(data={
            'ticket_stats': ticket_stats,
            'user_stats': user_stats,
            'by_category': list(by_category),
            'by_priority': list(by_priority),
            'by_department': list(by_department),
            'agent_workload': list(agent_workload),
            'urgent_tickets': TicketListSerializer(urgent_tickets, many=True, context={'request': request}).data,
        })
