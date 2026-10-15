"""
Accounts views - Authentication and user profile endpoints.
"""
import uuid
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiParameter

from common.responses import (
    success_response, created_response, error_response, not_found_response
)
from .serializers import (
    UserRegistrationSerializer, UserProfileSerializer, UserProfileUpdateSerializer,
    PasswordChangeSerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    CustomTokenObtainPairSerializer,
)
from .permissions import IsAdmin

User = get_user_model()


class RegisterView(APIView):
    """
    POST /api/auth/register/
    Public self-registration is disabled. Accounts can only be created by an administrator.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Register new employee (Disabled)",
        description="Public registration is disabled. Accounts are provisioned exclusively by administrators.",
        tags=["Authentication"],
    )
    def post(self, request):
        return error_response(
            message="Public registration is disabled. Accounts can only be created by an administrator.",
            status_code=status.HTTP_403_FORBIDDEN,
        )


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Returns JWT access and refresh tokens + user info.
    """
    serializer_class = CustomTokenObtainPairSerializer

    @extend_schema(summary="Login with email and password", tags=["Authentication"])
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            return success_response(
                message="Login successful.",
                data=response.data,
            )
        return error_response(
            message="Invalid email or password.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the refresh token to invalidate the session.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Logout and blacklist refresh token", tags=["Authentication"])
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return error_response("Refresh token is required.")
            token = RefreshToken(refresh_token)
            token.blacklist()
            return success_response("Logged out successfully.")
        except Exception:
            return error_response("Invalid token.")


class MeView(APIView):
    """
    GET  /api/auth/me/ - Get own profile
    PATCH /api/auth/me/ - Update own profile
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Get current user profile", tags=["Authentication"])
    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return success_response(data=serializer.data)

    @extend_schema(
        request=UserProfileUpdateSerializer,
        summary="Update current user profile",
        tags=["Authentication"],
    )
    def patch(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return success_response(
                message="Profile updated successfully.",
                data=UserProfileSerializer(request.user).data,
            )
        return error_response("Update failed.", errors=serializer.errors)


class PasswordChangeView(APIView):
    """POST /api/auth/password-change/"""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=PasswordChangeSerializer,
        summary="Change own password",
        tags=["Authentication"],
    )
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return success_response("Password changed successfully.")
        return error_response("Password change failed.", errors=serializer.errors)


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/ - Request password reset email."""
    permission_classes = [AllowAny]

    @extend_schema(
        request=PasswordResetRequestSerializer,
        summary="Request password reset email",
        tags=["Authentication"],
    )
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            try:
                user = User.objects.get(email=email, is_active=True)
                # Generate a reset token
                token = uuid.uuid4()
                user.password_reset_token = token
                user.password_reset_token_expiry = timezone.now() + timedelta(hours=24)
                user.save()

                # Send email (console backend in development)
                reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
                send_mail(
                    subject="ServiceDesk - Password Reset Request",
                    message=f"Hi {user.get_full_name()},\n\n"
                            f"Click the link below to reset your password:\n{reset_link}\n\n"
                            f"This link expires in 24 hours.\n\n"
                            f"If you did not request this, please ignore this email.",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    fail_silently=True,
                )
            except User.DoesNotExist:
                pass  # Don't reveal whether email exists

            # Always return success to prevent email enumeration
            return success_response(
                "If this email is registered, a password reset link has been sent."
            )
        return error_response("Invalid request.", errors=serializer.errors)


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm/ - Confirm reset with token."""
    permission_classes = [AllowAny]

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        summary="Confirm password reset",
        tags=["Authentication"],
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return success_response("Password reset successful. You can now log in.")
        return error_response("Password reset failed.", errors=serializer.errors)