"""
Ticket Serializers.

Handles data transformation between Python objects and JSON.
Uses nested serializers to avoid N+1 queries with select_related/prefetch_related in views.
"""
from django.conf import settings
from rest_framework import serializers
from .models import ServiceRequest, TicketComment, TicketAttachment, TicketHistory, Priority
from categories.serializers import CategorySerializer, SubCategorySerializer
from departments.serializers import DepartmentSerializer


class PrioritySerializer(serializers.ModelSerializer):
    class Meta:
        model = Priority
        fields = ['id', 'name', 'sla_hours', 'description']


class UserMinimalSerializer(serializers.Serializer):
    """Minimal user representation used inside ticket serializers."""
    id = serializers.IntegerField()
    email = serializers.EmailField()
    full_name = serializers.SerializerMethodField()
    role = serializers.CharField()

    def get_full_name(self, obj):
        return obj.get_full_name()


class TicketCommentSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    is_own_comment = serializers.SerializerMethodField()

    class Meta:
        model = TicketComment
        fields = ['id', 'user', 'content', 'is_own_comment', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_is_own_comment(self, obj):
        request = self.context.get('request')
        if request:
            return obj.user == request.user
        return False


class TicketCommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketComment
        fields = ['content']

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("Comment cannot be empty.")
        return value


class TicketAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = UserMinimalSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = [
            'id', 'uploaded_by', 'file_url', 'original_filename',
            'file_size', 'file_size_mb', 'file_type', 'created_at',
        ]

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class TicketAttachmentUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketAttachment
        fields = ['file']

    def validate_file(self, value):
        # File size validation
        max_size = getattr(settings, 'MAX_UPLOAD_SIZE', 10 * 1024 * 1024)
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File size must be under {max_size // (1024*1024)}MB. "
                f"Your file is {round(value.size / (1024*1024), 2)}MB."
            )

        # File type validation
        allowed_types = getattr(settings, 'ALLOWED_ATTACHMENT_TYPES', [])
        if value.content_type not in allowed_types:
            raise serializers.ValidationError(
                f"File type '{value.content_type}' is not allowed. "
                f"Allowed types: images, PDF, Word, Excel, text files."
            )
        return value


class TicketHistorySerializer(serializers.ModelSerializer):
    changed_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = TicketHistory
        fields = [
            'id', 'changed_by', 'action', 'old_value',
            'new_value', 'description', 'created_at',
        ]


class TicketListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for ticket list views.
    Uses select_related to avoid N+1 queries.
    """
    category_name = serializers.CharField(source='category.name', read_only=True)
    priority_name = serializers.CharField(source='priority.name', read_only=True)
    priority_sla_hours = serializers.IntegerField(source='priority.sla_hours', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    sla_status = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ServiceRequest
        fields = [
            'id', 'ticket_id', 'title', 'status',
            'category_name', 'priority_name', 'priority_sla_hours',
            'department_name', 'created_by_name', 'assigned_to_name',
            'sla_status', 'is_overdue',
            'created_at', 'updated_at', 'due_at',
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else None

    def get_sla_status(self, obj):
        return obj.sla_status


class TicketDetailSerializer(serializers.ModelSerializer):
    """
    Full ticket detail serializer with all related objects.
    """
    category = CategorySerializer(read_only=True)
    subcategory = SubCategorySerializer(read_only=True)
    priority = PrioritySerializer(read_only=True)
    department = DepartmentSerializer(read_only=True)
    created_by = UserMinimalSerializer(read_only=True)
    assigned_to = UserMinimalSerializer(read_only=True)
    comments = TicketCommentSerializer(many=True, read_only=True)
    attachments = TicketAttachmentSerializer(many=True, read_only=True)
    history = TicketHistorySerializer(many=True, read_only=True)
    sla_status = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    comment_count = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRequest
        fields = [
            'id', 'ticket_id', 'title', 'description', 'status',
            'category', 'subcategory', 'priority', 'department',
            'created_by', 'assigned_to',
            'sla_status', 'is_overdue',
            'created_at', 'updated_at', 'due_at', 'resolved_at', 'closed_at',
            'comments', 'attachments', 'history',
            'comment_count', 'attachment_count',
        ]

    def get_sla_status(self, obj):
        return obj.sla_status

    def get_comment_count(self, obj):
        return obj.comments.count()

    def get_attachment_count(self, obj):
        return obj.attachments.count()


class TicketCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new ticket.
    Employees fill in: title, description, category, subcategory, priority, department.
    ticket_id, created_by, status, due_at are set automatically.
    """
    class Meta:
        model = ServiceRequest
        fields = [
            'title', 'description', 'category', 'subcategory',
            'priority', 'department',
        ]

    def validate_category(self, value):
        if not value.is_active:
            raise serializers.ValidationError("This category is not active.")
        return value

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Title cannot be empty.")
        if len(value.strip()) < 5:
            raise serializers.ValidationError("Title must be at least 5 characters.")
        return value

    def validate_description(self, value):
        if not value.strip():
            raise serializers.ValidationError("Description cannot be empty.")
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Description must be at least 10 characters.")
        return value


class TicketStatusChangeSerializer(serializers.Serializer):
    """Used for the PATCH /api/tickets/{id}/status/ endpoint."""
    status = serializers.ChoiceField(choices=ServiceRequest.Status.choices)
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate_status(self, value):
        ticket = self.context.get('ticket')
        if ticket and not ticket.is_valid_transition(value):
            allowed = ServiceRequest.VALID_TRANSITIONS.get(ticket.status, [])
            raise serializers.ValidationError(
                f"Cannot transition from '{ticket.status}' to '{value}'. "
                f"Allowed transitions: {allowed}"
            )
        return value


class TicketAssignSerializer(serializers.Serializer):
    """Used for the POST /api/tickets/{id}/assign/ endpoint."""
    agent_id = serializers.IntegerField()

    def validate_agent_id(self, value):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            agent = User.objects.get(id=value, role='SUPPORT_AGENT', is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError("No active support agent found with this ID.")
        return value