"""
Real-time User Notification WebSocket Consumer.

Allows connected clients (agents, employees, admins) to receive instant
notifications when ticket comments are added, tickets assigned, status updated, etc.
"""
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)
            return

        self.room_group_name = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def notification_message(self, event):
        """Forward notification payload to client."""
        await self.send_json({
            "type": "notification",
            "notification": event["notification"],
        })
