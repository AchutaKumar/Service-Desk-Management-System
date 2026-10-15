"""
Tickets app - Django Admin registrations.
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import Priority, ServiceRequest, TicketComment, TicketAttachment, TicketHistory


@admin.register(Priority)
class PriorityAdmin(admin.ModelAdmin):
    list_display = ['name', 'sla_hours', 'description']
    ordering = ['sla_hours']
    search_fields = ['name']


class TicketCommentInline(admin.TabularInline):
    model = TicketComment
    extra = 0
    readonly_fields = ['user', 'content', 'created_at', 'updated_at']
    can_delete = False


class TicketAttachmentInline(admin.TabularInline):
    model = TicketAttachment
    extra = 0
    readonly_fields = ['uploaded_by', 'original_filename', 'file_size', 'file_type', 'created_at']
    can_delete = False


class TicketHistoryInline(admin.TabularInline):
    model = TicketHistory
    extra = 0
    readonly_fields = ['changed_by', 'action', 'old_value', 'new_value', 'description', 'created_at']
    can_delete = False
    ordering = ['created_at']


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = [
        'ticket_id', 'title', 'status', 'priority',
        'category', 'created_by', 'assigned_to',
        'is_overdue_display', 'created_at', 'due_at',
    ]
    list_filter = ['status', 'priority', 'category', 'department', 'created_at']
    search_fields = ['ticket_id', 'title', 'description', 'created_by__email', 'assigned_to__email']
    ordering = ['-created_at']
    readonly_fields = ['ticket_id', 'created_at', 'updated_at', 'resolved_at', 'closed_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Ticket Info', {
            'fields': ('ticket_id', 'title', 'description', 'status'),
        }),
        ('Classification', {
            'fields': ('category', 'subcategory', 'priority', 'department'),
        }),
        ('People', {
            'fields': ('created_by', 'assigned_to'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'due_at', 'resolved_at', 'closed_at'),
            'classes': ('collapse',),
        }),
    )

    inlines = [TicketCommentInline, TicketAttachmentInline, TicketHistoryInline]

    def is_overdue_display(self, obj):
        if obj.is_overdue:
            return format_html('<span style="color: red; font-weight: bold;">⚠ Overdue</span>')
        return format_html('<span style="color: green;">OK</span>')
    is_overdue_display.short_description = 'SLA Status'

    actions = ['mark_as_resolved', 'mark_as_closed']

    def mark_as_resolved(self, request, queryset):
        from django.utils import timezone
        updated = queryset.filter(
            status__in=['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER']
        ).update(
            status='RESOLVED',
            resolved_at=timezone.now(),
        )
        self.message_user(request, f'{updated} tickets marked as resolved.')
    mark_as_resolved.short_description = 'Mark selected tickets as RESOLVED'

    def mark_as_closed(self, request, queryset):
        from django.utils import timezone
        updated = queryset.filter(status='RESOLVED').update(
            status='CLOSED',
            closed_at=timezone.now(),
        )
        self.message_user(request, f'{updated} resolved tickets marked as CLOSED.')
    mark_as_closed.short_description = 'Mark selected resolved tickets as CLOSED'


@admin.register(TicketComment)
class TicketCommentAdmin(admin.ModelAdmin):
    list_display = ['ticket', 'user', 'content_preview', 'created_at']
    list_filter = ['created_at']
    search_fields = ['ticket__ticket_id', 'user__email', 'content']
    readonly_fields = ['created_at', 'updated_at']

    def content_preview(self, obj):
        return obj.content[:80] + '...' if len(obj.content) > 80 else obj.content
    content_preview.short_description = 'Content'


@admin.register(TicketAttachment)
class TicketAttachmentAdmin(admin.ModelAdmin):
    list_display = ['ticket', 'uploaded_by', 'original_filename', 'file_size_mb', 'file_type', 'created_at']
    list_filter = ['file_type', 'created_at']
    search_fields = ['ticket__ticket_id', 'uploaded_by__email', 'original_filename']
    readonly_fields = ['created_at', 'file_size_mb']


@admin.register(TicketHistory)
class TicketHistoryAdmin(admin.ModelAdmin):
    list_display = ['ticket', 'changed_by', 'action', 'old_value', 'new_value', 'created_at']
    list_filter = ['action', 'created_at']
    search_fields = ['ticket__ticket_id', 'changed_by__email', 'description']
    readonly_fields = ['ticket', 'changed_by', 'action', 'old_value', 'new_value', 'description', 'created_at']

    def has_add_permission(self, request):
        return False  # History is immutable - no manual additions

    def has_change_permission(self, request, obj=None):
        return False  # History is immutable - no edits

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser  # Only superusers can delete history
