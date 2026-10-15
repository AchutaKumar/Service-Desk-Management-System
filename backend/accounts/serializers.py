"""
Accounts serializers - Handles data validation and transformation for:
- User registration
- Login (JWT tokens)
- Profile updates
- Password change / reset
"""
import uuid
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from departments.models import Department

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Customizes the JWT token payload to include user role and name.
    This data is available in the token so the frontend knows the role immediately.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims to the token payload
        token['email'] = user.email
        token['role'] = user.role
        token['full_name'] = user.get_full_name()
        token['is_active'] = user.is_active
        return token

    def validate(self, attrs):
        # Use email field (we switched USERNAME_FIELD to email)
        data = super().validate(attrs)
        # Add user info to the response body (not just the token)
        data['user'] = {
            'id': self.user.id,
            'email': self.user.email,
            'full_name': self.user.get_full_name(),
            'role': self.user.role,
            'is_active': self.user.is_active,
        }
        return data


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Handles new employee self-registration.
    Validates password strength and uniqueness of email/username.
    """
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        source='department',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'phone', 'department_id', 'password', 'password_confirm',
        ]
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
        }

    def validate(self, attrs):
        # Check that both passwords match
        if attrs['password'] != attrs.pop('password_confirm'):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        # New registrations are always EMPLOYEE role
        validated_data['role'] = User.Role.EMPLOYEE
        user = User.objects.create_user(**validated_data)
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Read-only profile serializer with full department details.
    Used when viewing any user's profile.
    """
    full_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'full_name', 'phone', 'role', 'department', 'department_name',
            'profile_picture', 'is_active', 'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'email', 'role', 'date_joined', 'last_login', 'is_active']

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Allows users to update their own profile (limited fields)."""

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone', 'profile_picture']


class PasswordChangeSerializer(serializers.Serializer):
    """Allows authenticated users to change their password."""
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({"new_password_confirm": "Passwords do not match."})
        return attrs

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()


class PasswordResetRequestSerializer(serializers.Serializer):
    """Step 1: User provides their email to request a password reset."""
    email = serializers.EmailField()

    def validate_email(self, value):
        if not User.objects.filter(email=value, is_active=True).exists():
            # Don't reveal whether the email exists (security)
            pass
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Step 2: User provides the token and new password."""
    token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({"new_password_confirm": "Passwords do not match."})

        # Find user by token
        try:
            user = User.objects.get(
                password_reset_token=attrs['token'],
                is_active=True,
            )
        except User.DoesNotExist:
            raise serializers.ValidationError({"token": "Invalid or expired token."})

        # Check if token is expired (24 hours)
        if user.password_reset_token_expiry and user.password_reset_token_expiry < timezone.now():
            raise serializers.ValidationError({"token": "Token has expired."})

        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['new_password'])
        user.password_reset_token = None
        user.password_reset_token_expiry = None
        user.save()


# ─────────────────────────────────────────
# Admin User Management Serializers
# ─────────────────────────────────────────

class AdminUserListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing users (admin only)."""
    full_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'full_name', 'role',
            'department', 'department_name', 'is_active', 'date_joined',
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """Admin creates users (can set any role)."""
    password = serializers.CharField(write_only=True, validators=[validate_password])
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source='department',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'phone', 'role', 'department_id', 'password', 'is_active',
        ]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """Admin updates user details."""
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source='department',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'role',
            'department_id', 'is_active',
        ]