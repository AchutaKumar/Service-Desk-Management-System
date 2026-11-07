import json
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from channels.testing import WebsocketCommunicator
from config.asgi import application
from categories.models import Category
from departments.models import Department
from tickets.models import Priority, ServiceRequest, TicketComment

User = get_user_model()


class TicketChatWebSocketTests(TransactionTestCase):
    def setUp(self):
        self.department = Department.objects.create(name="IT Support")
        self.category = Category.objects.create(name="Hardware", description="Hardware issues")
        self.priority = Priority.objects.create(
            name=Priority.PriorityLevel.MEDIUM,
            sla_hours=24,
            description="Medium priority",
        )

        self.employee = User.objects.create_user(
            email="employee@test.com",
            username="alice",
            password="Password123!",
            first_name="Alice",
            last_name="Employee",
            role="EMPLOYEE",
            department=self.department,
        )

        self.agent = User.objects.create_user(
            email="agent@test.com",
            username="bob",
            password="Password123!",
            first_name="Bob",
            last_name="Agent",
            role="SUPPORT_AGENT",
            department=self.department,
        )

        self.other_user = User.objects.create_user(
            email="other@test.com",
            username="charlie",
            password="Password123!",
            first_name="Charlie",
            last_name="Other",
            role="EMPLOYEE",
            department=self.department,
        )

        self.ticket = ServiceRequest.objects.create(
            title="Broken laptop screen",
            description="Screen flickers and turns black",
            category=self.category,
            priority=self.priority,
            department=self.department,
            created_by=self.employee,
            assigned_to=self.agent,
            status=ServiceRequest.Status.IN_PROGRESS,
        )

        self.employee_token = str(RefreshToken.for_user(self.employee).access_token)
        self.agent_token = str(RefreshToken.for_user(self.agent).access_token)
        self.other_token = str(RefreshToken.for_user(self.other_user).access_token)

    async def test_unauthenticated_connection_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/tickets/{self.ticket.id}/chat/"
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4401)
        await communicator.disconnect()

    async def test_unauthorized_user_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/tickets/{self.ticket.id}/chat/?token={self.other_token}"
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4403)
        await communicator.disconnect()

    async def test_authorized_connection_and_message_exchange(self):
        # 1. Connect employee
        employee_comm = WebsocketCommunicator(
            application,
            f"/ws/tickets/{self.ticket.id}/chat/?token={self.employee_token}"
        )
        connected, _ = await employee_comm.connect()
        self.assertTrue(connected)

        init_msg = await employee_comm.receive_json_from()
        self.assertEqual(init_msg["type"], "connection_established")

        # 2. Connect agent
        agent_comm = WebsocketCommunicator(
            application,
            f"/ws/tickets/{self.ticket.id}/chat/?token={self.agent_token}"
        )
        connected, _ = await agent_comm.connect()
        self.assertTrue(connected)

        init_agent = await agent_comm.receive_json_from()
        self.assertEqual(init_agent["type"], "connection_established")

        # 3. Agent sends typing indicator
        await agent_comm.send_json_to({
            "action": "typing",
            "is_typing": True,
        })

        # Employee receives typing indicator
        typing_event = await employee_comm.receive_json_from()
        self.assertEqual(typing_event["type"], "typing")
        self.assertTrue(typing_event["is_typing"])
        self.assertEqual(typing_event["user"]["id"], self.agent.id)

        # 4. Agent sends chat message
        await agent_comm.send_json_to({
            "action": "send_message",
            "message": "Hello Alice, I am looking into your screen issue now.",
        })

        # Both employee and agent receive the message in real time
        emp_msg = await employee_comm.receive_json_from()
        self.assertEqual(emp_msg["type"], "chat_message")
        self.assertEqual(emp_msg["comment"]["content"], "Hello Alice, I am looking into your screen issue now.")
        self.assertEqual(emp_msg["comment"]["user"]["id"], self.agent.id)

        agent_msg = await agent_comm.receive_json_from()
        self.assertEqual(agent_msg["type"], "chat_message")
        self.assertEqual(agent_msg["comment"]["content"], "Hello Alice, I am looking into your screen issue now.")
        comment_id = agent_msg["comment"]["id"]

        # 5. Agent edits message
        await agent_comm.send_json_to({
            "action": "edit_message",
            "comment_id": comment_id,
            "content": "Updated: I am looking into the screen replacement now.",
        })

        emp_edit = await employee_comm.receive_json_from()
        self.assertEqual(emp_edit["type"], "comment_updated")
        self.assertEqual(emp_edit["comment"]["content"], "Updated: I am looking into the screen replacement now.")

        # 6. Agent deletes message
        await agent_comm.send_json_to({
            "action": "delete_message",
            "comment_id": comment_id,
        })

        emp_del = await employee_comm.receive_json_from()
        self.assertEqual(emp_del["type"], "comment_deleted")
        self.assertEqual(emp_del["comment_id"], comment_id)

        # Disconnect
        await employee_comm.disconnect()
        await agent_comm.disconnect()
