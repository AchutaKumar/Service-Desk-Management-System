from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from common.responses import success_response, not_found_response
from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    """GET /api/notifications/ - Get my notifications."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="List my notifications", tags=["Notifications"])
    def get(self, request):
        notifications = Notification.objects.filter(
            recipient=request.user
        ).select_related('ticket')[:50]  # Limit to 50 most recent
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return success_response(data={
            'unread_count': unread_count,
            'notifications': NotificationSerializer(notifications, many=True).data,
        })


class NotificationMarkReadView(APIView):
    """PATCH /api/notifications/{id}/read/ - Mark notification as read."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Mark notification as read", tags=["Notifications"])
    def patch(self, request, pk):
        try:
            notif = Notification.objects.get(pk=pk, recipient=request.user)
            notif.is_read = True
            notif.save(update_fields=['is_read'])
            return success_response("Notification marked as read.")
        except Notification.DoesNotExist:
            return not_found_response("Notification not found.")


class NotificationMarkAllReadView(APIView):
    """POST /api/notifications/read-all/ - Mark all notifications as read."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Mark all notifications as read", tags=["Notifications"])
    def post(self, request):
        count = Notification.objects.filter(
            recipient=request.user, is_read=False
        ).update(is_read=True)
        return success_response(f"{count} notifications marked as read.")