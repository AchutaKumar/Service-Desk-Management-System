"""
Admin-facing User Management Views.
Separated from auth views for cleaner URL structure.
"""
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema

from common.responses import success_response, created_response, error_response, not_found_response
from .serializers import (
    AdminUserListSerializer, AdminUserCreateSerializer, AdminUserUpdateSerializer,
    UserProfileSerializer,
)
from .permissions import IsAdmin

User = get_user_model()


class UserListCreateView(APIView):
    """
    GET  /api/users/ - List all users (Admin only)
    POST /api/users/ - Create a new user (Admin only)
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="List all users", tags=["User Management"])
    def get(self, request):
        users = User.objects.select_related('department').order_by('-date_joined')

        # Optional filtering
        role = request.query_params.get('role')
        if role:
            users = users.filter(role=role)

        is_active = request.query_params.get('is_active')
        if is_active is not None:
            users = users.filter(is_active=is_active.lower() == 'true')

        serializer = AdminUserListSerializer(users, many=True)
        return success_response(data=serializer.data)

    @extend_schema(request=AdminUserCreateSerializer, summary="Create user", tags=["User Management"])
    def post(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return created_response(
                message="User created successfully.",
                data=AdminUserListSerializer(user).data,
            )
        return error_response("User creation failed.", errors=serializer.errors)


class UserDetailView(APIView):
    """
    GET   /api/users/{id}/ - Get user detail
    PATCH /api/users/{id}/ - Update user
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_object(self, pk):
        try:
            return User.objects.select_related('department').get(pk=pk)
        except User.DoesNotExist:
            return None

    @extend_schema(summary="Get user detail", tags=["User Management"])
    def get(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return not_found_response("User not found.")
        return success_response(data=UserProfileSerializer(user).data)

    @extend_schema(request=AdminUserUpdateSerializer, summary="Update user", tags=["User Management"])
    def patch(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return not_found_response("User not found.")
        serializer = AdminUserUpdateSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return success_response(
                message="User updated successfully.",
                data=UserProfileSerializer(user).data,
            )
        return error_response("Update failed.", errors=serializer.errors)


class UserActivateView(APIView):
    """POST /api/users/{id}/activate/ - Activate a user account."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Activate user account", tags=["User Management"])
    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            user.is_active = True
            user.save()
            return success_response(f"User {user.get_full_name()} has been activated.")
        except User.DoesNotExist:
            return not_found_response("User not found.")


class UserDeactivateView(APIView):
    """POST /api/users/{id}/deactivate/ - Deactivate a user account."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="Deactivate user account", tags=["User Management"])
    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            if user == request.user:
                return error_response("You cannot deactivate your own account.")
            user.is_active = False
            user.save()
            return success_response(f"User {user.get_full_name()} has been deactivated.")
        except User.DoesNotExist:
            return not_found_response("User not found.")


class AgentListView(APIView):
    """GET /api/users/agents/ - List all support agents."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(summary="List all support agents", tags=["User Management"])
    def get(self, request):
        agents = User.objects.filter(
            role='SUPPORT_AGENT'
        ).select_related('department').order_by('first_name')
        serializer = AdminUserListSerializer(agents, many=True)
        return success_response(data=serializer.data)
