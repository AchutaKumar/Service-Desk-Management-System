"""
Admin Reports Views.
Provides aggregated statistics with date filtering.
"""
from django.utils import timezone
from django.db.models import Count, Q, Avg, F
from datetime import timedelta, datetime
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter
from common.responses import success_response, error_response
from accounts.permissions import IsAdmin


def get_date_range(request):
    """
    Parse date range from query params.
    Supports: today, last7, last30, custom (with date_from, date_to).
    """
    preset = request.GET.get('range', 'last30')
    now = timezone.now()

    if preset == 'today':
        date_from = now.replace(hour=0, minute=0, second=0)
        date_to = now
    elif preset == 'last7':
        date_from = now - timedelta(days=7)
        date_to = now
    elif preset == 'custom':
        try:
            date_from = datetime.fromisoformat(request.GET.get('date_from', ''))
            date_to = datetime.fromisoformat(request.GET.get('date_to', ''))
            date_from = timezone.make_aware(date_from)
            date_to = timezone.make_aware(date_to)
        except (ValueError, TypeError):
            return None, None, error_response("Invalid date format. Use ISO format: YYYY-MM-DD")
    else:  # last30 (default)
        date_from = now - timedelta(days=30)
        date_to = now

    return date_from, date_to, None


class TicketsByStatusReport(APIView):
    """GET /api/reports/tickets-by-status/?range=last30"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Tickets by status report", tags=["Reports"])
    def get(self, request):
        from tickets.models import ServiceRequest
        date_from, date_to, err = get_date_range(request)
        if err:
            return err

        data = ServiceRequest.objects.filter(
            created_at__gte=date_from, created_at__lte=date_to
        ).values('status').annotate(count=Count('id')).order_by('status')

        return success_response(data={
            'date_from': date_from,
            'date_to': date_to,
            'results': list(data),
        })


class TicketsByPriorityReport(APIView):
    """GET /api/reports/tickets-by-priority/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Tickets by priority report", tags=["Reports"])
    def get(self, request):
        from tickets.models import ServiceRequest
        date_from, date_to, err = get_date_range(request)
        if err:
            return err

        data = ServiceRequest.objects.filter(
            created_at__gte=date_from, created_at__lte=date_to
        ).values('priority__name').annotate(count=Count('id')).order_by('-count')

        return success_response(data={'results': list(data)})


class TicketsByCategoryReport(APIView):
    """GET /api/reports/tickets-by-category/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Tickets by category report", tags=["Reports"])
    def get(self, request):
        from tickets.models import ServiceRequest
        date_from, date_to, err = get_date_range(request)
        if err:
            return err

        data = ServiceRequest.objects.filter(
            created_at__gte=date_from, created_at__lte=date_to
        ).values('category__name').annotate(count=Count('id')).order_by('-count')

        return success_response(data={'results': list(data)})


class TicketsByDepartmentReport(APIView):
    """GET /api/reports/tickets-by-department/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Tickets by department report", tags=["Reports"])
    def get(self, request):
        from tickets.models import ServiceRequest
        date_from, date_to, err = get_date_range(request)
        if err:
            return err

        data = ServiceRequest.objects.filter(
            created_at__gte=date_from, created_at__lte=date_to
        ).values('department__name').annotate(count=Count('id')).order_by('-count')

        return success_response(data={'results': list(data)})


class AgentWorkloadReport(APIView):
    """GET /api/reports/agent-workload/ - Current workload per agent."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Agent workload report", tags=["Reports"])
    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        agents = User.objects.filter(
            role='SUPPORT_AGENT', is_active=True
        ).annotate(
            total_assigned=Count('assigned_tickets'),
            active=Count('assigned_tickets', filter=Q(
                assigned_tickets__status__in=['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER']
            )),
            resolved=Count('assigned_tickets', filter=Q(assigned_tickets__status='RESOLVED')),
        ).values('id', 'first_name', 'last_name', 'email', 'total_assigned', 'active', 'resolved')

        return success_response(data={'results': list(agents)})


class SLAPerformanceReport(APIView):
    """GET /api/reports/sla-performance/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="SLA performance report", tags=["Reports"])
    def get(self, request):
        from tickets.models import ServiceRequest
        date_from, date_to, err = get_date_range(request)
        if err:
            return err

        qs = ServiceRequest.objects.filter(
            created_at__gte=date_from, created_at__lte=date_to
        )

        total = qs.count()
        resolved = qs.filter(status__in=['RESOLVED', 'CLOSED']).count()
        within_sla = qs.filter(
            status__in=['RESOLVED', 'CLOSED'],
            resolved_at__lte=F('due_at'),
        ).count()
        overdue = qs.filter(
            due_at__lt=timezone.now()
        ).exclude(status__in=['RESOLVED', 'CLOSED']).count()

        return success_response(data={
            'total': total,
            'resolved': resolved,
            'within_sla': within_sla,
            'overdue': overdue,
            'sla_compliance_rate': f"{round((within_sla / resolved * 100), 1) if resolved else 0}%",
        })


class OverdueTicketsReport(APIView):
    """GET /api/reports/overdue-tickets/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Overdue tickets report", tags=["Reports"])
    def get(self, request):
        from tickets.models import ServiceRequest
        from tickets.serializers import TicketListSerializer

        overdue = ServiceRequest.objects.filter(
            due_at__lt=timezone.now()
        ).exclude(
            status__in=['RESOLVED', 'CLOSED']
        ).select_related('category', 'priority', 'created_by', 'assigned_to').order_by('due_at')

        return success_response(data={
            'count': overdue.count(),
            'tickets': TicketListSerializer(overdue, many=True, context={'request': request}).data,
        })
