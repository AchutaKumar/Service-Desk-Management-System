from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    ticket_id = serializers.CharField(source='ticket.ticket_id', read_only=True)
    ticket_title = serializers.CharField(source='ticket.title', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'message', 'ticket_id', 'ticket_title', 'is_read', 'created_at']
