"""
Ticket filters using django-filter.

WHY django-filter?
It provides a declarative, DRY way to add filtering to list APIs.
We define what fields can be filtered, and it handles the rest.

Usage example:
    GET /api/tickets/?status=OPEN&priority=HIGH&category=1
    GET /api/tickets/?created_at_after=2024-01-01&created_at_before=2024-12-31
    GET /api/tickets/?search=network+issue
"""
import django_filters
from .models import ServiceRequest


class TicketFilter(django_filters.FilterSet):
    """
    FilterSet for ServiceRequest (Ticket) model.
    Supports filtering by status, priority, category, department, agent, and date ranges.
    """
    # Exact match filters
    status = django_filters.ChoiceFilter(choices=ServiceRequest.Status.choices)
    priority__name = django_filters.ChoiceFilter(
        field_name='priority__name',
        choices=[('LOW', 'Low'), ('MEDIUM', 'Medium'), ('HIGH', 'High'), ('CRITICAL', 'Critical')]
    )
    category = django_filters.NumberFilter(field_name='category__id')
    department = django_filters.NumberFilter(field_name='department__id')
    assigned_to = django_filters.NumberFilter(field_name='assigned_to__id')
    created_by = django_filters.NumberFilter(field_name='created_by__id')

    # Date range filters
    created_at_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_at_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    due_at_after = django_filters.DateTimeFilter(field_name='due_at', lookup_expr='gte')
    due_at_before = django_filters.DateTimeFilter(field_name='due_at', lookup_expr='lte')

    # Boolean filter for overdue tickets
    is_overdue = django_filters.BooleanFilter(method='filter_overdue')

    def filter_overdue(self, queryset, name, value):
        """
        Filter tickets that are past their due date and not yet resolved.
        Uses F() objects and Q() objects for efficient database-level filtering.
        """
        from django.utils import timezone
        from django.db.models import Q

        now = timezone.now()
        if value:
            # Overdue: due_at is in the past AND status is not terminal
            return queryset.filter(
                due_at__lt=now,
            ).exclude(
                status__in=[ServiceRequest.Status.RESOLVED, ServiceRequest.Status.CLOSED]
            )
        else:
            return queryset.filter(
                Q(due_at__gte=now) |
                Q(status__in=[ServiceRequest.Status.RESOLVED, ServiceRequest.Status.CLOSED])
            )

    class Meta:
        model = ServiceRequest
        fields = [
            'status', 'priority__name', 'category', 'department',
            'assigned_to', 'created_by', 'created_at_after', 'created_at_before',
        ]