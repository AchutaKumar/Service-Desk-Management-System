"""
Ticket Real-time Chat Consumer.

Handles WebSocket connections for real-time ticket discussion/comments:
- Live bidirectional chat between employee and support agent / admin
- Typing indicators ("Agent Sarah is typing...")
- Live message edits and deletions
- Real-time ticket status updates
"""
import json
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import ServiceRequest, TicketComment, TicketHistory
from .services import log_history, notify_comment_added

logger = logging.getLogger(__name__)
User = get_user_model()


class TicketChatConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for real-time ticket conversation.
    Room group: ticket_{ticket_id}
    """

    async def connect(self):
        self.user = self.scope.get('user')
        self.ticket_id = self.scope['url_route']['kwargs'].get('ticket_id')
        self.room_group_name = f"ticket_{self.ticket_id}"

        # 1. Require authenticated user
        if not self.user or not self.user.is_authenticated:
            logger.warning(f"Unauthenticated WebSocket connection rejected for ticket {self.ticket_id}")
            await self.close(code=4401)
            return

        # 2. Check ticket permission
        can_view, error_msg = await self.check_ticket_permission(self.ticket_id, self.user)
        if not can_view:
            logger.warning(f"Forbidden WebSocket connection for user {self.user.id} on ticket {self.ticket_id}: {error_msg}")
            await self.close(code=4403)
            return

        # 3. Join channel layer room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )

        await self.accept()

        # 4. Send initial connection confirmation to client
        await self.send_json({
            "type": "connection_established",
            "ticket_id": int(self.ticket_id),
            "user": {
                "id": self.user.id,
                "full_name": self.user.get_full_name(),
                "role": self.user.role,
            },
            "message": "Connected to real-time chat.",
        })

    async def disconnect(self, close_code):
        # Leave room group
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name,
            )

    async def receive_json(self, content):
        """
        Handle incoming WebSocket messages from the client.
        Supported actions:
        - "send_message" / "chat_message": Post a new comment
        - "typing": Broadcast typing status to room
        - "edit_message": Edit own comment
        - "delete_message": Delete own comment
        """
        action = content.get('action') or content.get('type')

        if action in ['send_message', 'chat_message']:
            await self.handle_send_message(content)
        elif action == 'typing':
            await self.handle_typing(content)
        elif action == 'edit_message':
            await self.handle_edit_message(content)
        elif action == 'delete_message':
            await self.handle_delete_message(content)
        elif action == 'ping':
            await self.send_json({"type": "pong"})
        else:
            await self.send_json({
                "type": "error",
                "message": f"Unknown action: {action}",
            })

    async def handle_send_message(self, content):
        """Create and broadcast a new comment."""
        message_text = (content.get('message') or content.get('content') or '').strip()
        if not message_text:
            await self.send_json({
                "type": "error",
                "message": "Comment content cannot be empty.",
            })
            return

        result = await self.save_comment(self.ticket_id, self.user, message_text)
        if not result['success']:
            await self.send_json({
                "type": "error",
                "message": result['error'],
            })
            return

        # Broadcast new comment to the entire room group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "comment": result['comment'],
            },
        )

    async def handle_typing(self, content):
        """Broadcast typing status indicator to other users in the room."""
        is_typing = bool(content.get('is_typing', False))
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "typing_indicator",
                "user": {
                    "id": self.user.id,
                    "full_name": self.user.get_full_name(),
                    "role": self.user.role,
                },
                "is_typing": is_typing,
            },
        )

    async def handle_edit_message(self, content):
        """Edit an existing comment if author or admin."""
        comment_id = content.get('comment_id')
        new_text = (content.get('content') or content.get('message') or '').strip()

        if not comment_id or not new_text:
            await self.send_json({
                "type": "error",
                "message": "comment_id and non-empty content are required.",
            })
            return

        result = await self.edit_comment(self.ticket_id, comment_id, self.user, new_text)
        if not result['success']:
            await self.send_json({
                "type": "error",
                "message": result['error'],
            })
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "comment_updated",
                "comment": result['comment'],
            },
        )

    async def handle_delete_message(self, content):
        """Delete an existing comment if author or admin."""
        comment_id = content.get('comment_id')
        if not comment_id:
            await self.send_json({
                "type": "error",
                "message": "comment_id is required.",
            })
            return

        result = await self.delete_comment(self.ticket_id, comment_id, self.user)
        if not result['success']:
            await self.send_json({
                "type": "error",
                "message": result['error'],
            })
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "comment_deleted",
                "comment_id": comment_id,
            },
        )

    # ─────────────────────────────────────────────────────────────
    # Channel Layer Event Handlers (Dispatched to WebSocket client)
    # ─────────────────────────────────────────────────────────────

    async def chat_message(self, event):
        """Send received comment to WebSocket client."""
        await self.send_json({
            "type": "chat_message",
            "comment": event["comment"],
        })

    async def comment_updated(self, event):
        """Send updated comment to WebSocket client."""
        await self.send_json({
            "type": "comment_updated",
            "comment": event["comment"],
        })

    async def comment_deleted(self, event):
        """Notify client that a comment was deleted."""
        await self.send_json({
            "type": "comment_deleted",
            "comment_id": event["comment_id"],
        })

    async def typing_indicator(self, event):
        """Send typing status to client (ignore if own user)."""
        if event["user"]["id"] != self.user.id:
            await self.send_json({
                "type": "typing",
                "user": event["user"],
                "is_typing": event["is_typing"],
            })

    async def ticket_status_changed(self, event):
        """Notify client of real-time ticket status transition."""
        await self.send_json({
            "type": "ticket_status_changed",
            "ticket_id": event.get("ticket_id", int(self.ticket_id)),
            "status": event.get("status"),
            "data": event.get("data"),
        })

    # ─────────────────────────────────────────────────────────────
    # Database Helper Methods (Synchronous ORM wrapped in async)
    # ─────────────────────────────────────────────────────────────

    @database_sync_to_async
    def check_ticket_permission(self, ticket_id, user):
        """Validate if user has permission to view ticket."""
        try:
            ticket = ServiceRequest.objects.select_related('created_by', 'assigned_to').get(pk=ticket_id)
        except ServiceRequest.DoesNotExist:
            return False, "Ticket not found."

        if user.role == 'ADMIN':
            return True, None
        if ticket.created_by_id == user.id:
            return True, None
        if user.role == 'SUPPORT_AGENT':
            if ticket.assigned_to_id == user.id or ticket.assigned_to_id is None:
                return True, None

        return False, "You do not have permission to view this ticket."

    @database_sync_to_async
    def save_comment(self, ticket_id, user, message_text):
        """Create a comment in the database, audit history, and notification."""
        try:
            ticket = ServiceRequest.objects.select_related('created_by', 'assigned_to').get(pk=ticket_id)
        except ServiceRequest.DoesNotExist:
            return {"success": False, "error": "Ticket not found."}

        if ticket.status == ServiceRequest.Status.CLOSED:
            return {"success": False, "error": "Cannot add comments to a closed ticket."}

        # Check comment permission: Admin, creator, or assigned agent
        is_owner = ticket.created_by_id == user.id
        is_assigned = ticket.assigned_to_id == user.id
        is_admin = user.role == 'ADMIN'

        if not (is_admin or is_owner or is_assigned):
            return {"success": False, "error": "You are not authorized to comment on this ticket."}

        comment = TicketComment.objects.create(
            ticket=ticket,
            user=user,
            content=message_text,
        )

        # Log audit history
        log_history(
            ticket=ticket,
            user=user,
            action=TicketHistory.ActionType.COMMENT_ADDED,
            description=f"Comment added by {user.get_full_name()}",
        )

        # Send notifications
        notify_comment_added(ticket, user)

        return {
            "success": True,
            "comment": {
                "id": comment.id,
                "content": comment.content,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "full_name": user.get_full_name(),
                    "role": user.role,
                },
                "is_own_comment": False,  # Client will evaluate based on auth user
                "created_at": comment.created_at.isoformat(),
                "updated_at": comment.updated_at.isoformat(),
            },
        }

    @database_sync_to_async
    def edit_comment(self, ticket_id, comment_id, user, new_text):
        """Update comment content."""
        try:
            comment = TicketComment.objects.select_related('ticket', 'user').get(
                pk=comment_id, ticket__pk=ticket_id
            )
        except TicketComment.DoesNotExist:
            return {"success": False, "error": "Comment not found."}

        if comment.user_id != user.id and user.role != 'ADMIN':
            return {"success": False, "error": "You can only edit your own comments."}

        comment.content = new_text
        comment.save(update_fields=['content', 'updated_at'])

        return {
            "success": True,
            "comment": {
                "id": comment.id,
                "content": comment.content,
                "user": {
                    "id": comment.user.id,
                    "email": comment.user.email,
                    "full_name": comment.user.get_full_name(),
                    "role": comment.user.role,
                },
                "is_own_comment": False,
                "created_at": comment.created_at.isoformat(),
                "updated_at": comment.updated_at.isoformat(),
            },
        }

    @database_sync_to_async
    def delete_comment(self, ticket_id, comment_id, user):
        """Delete a comment."""
        try:
            comment = TicketComment.objects.select_related('ticket', 'user').get(
                pk=comment_id, ticket__pk=ticket_id
            )
        except TicketComment.DoesNotExist:
            return {"success": False, "error": "Comment not found."}

        if comment.user_id != user.id and user.role != 'ADMIN':
            return {"success": False, "error": "You can only delete your own comments."}

        comment.delete()
        return {"success": True}

