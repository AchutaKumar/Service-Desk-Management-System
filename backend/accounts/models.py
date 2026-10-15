"""
Custom User Model for ServiceDesk.

WHY a custom user model?
Django's built-in User model uses 'username' as the primary identifier.
We want to use 'email' as the login identifier (more professional).
Django recommends defining a custom user model at the START of a project.
Changing it later requires complex migrations.

ROLES:
- EMPLOYEE: Regular company employee who submits tickets.
- SUPPORT_AGENT: IT support staff who resolves tickets.
- ADMIN: System administrator with full access.
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """
    Custom manager that uses email instead of username for authentication.
    Django requires us to define create_user and create_superuser.
    """

    def create_user(self, email, password=None, **extra_fields):
        """Create a regular user with email and password."""
        if not email:
            raise ValueError("The Email field is required.")
        email = self.normalize_email(email)  # Lowercase the domain part
        extra_fields.setdefault('is_active', True)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)  # Hashes the password using PBKDF2
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create an admin superuser."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model using email as the primary authentication field.

    AbstractBaseUser: provides password hashing and authentication.
    PermissionsMixin: provides is_staff, is_superuser, groups, user_permissions.
    """

    class Role(models.TextChoices):
        EMPLOYEE = 'EMPLOYEE', 'Employee'
        SUPPORT_AGENT = 'SUPPORT_AGENT', 'Support Agent'
        ADMIN = 'ADMIN', 'Admin'

    # Primary fields
    id = models.BigAutoField(primary_key=True)
    email = models.EmailField(unique=True, db_index=True)
    username = models.CharField(max_length=150, unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True, null=True)

    # Role
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.EMPLOYEE,
        db_index=True,
    )

    # Department - ForeignKey (defined as string to avoid circular import)
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
    )

    # Profile picture (optional)
    profile_picture = models.ImageField(
        upload_to='profile_pictures/',
        null=True,
        blank=True,
    )

    # Status and timestamps
    is_active = models.BooleanField(default=True, db_index=True)
    is_staff = models.BooleanField(default=False)  # Required for Django admin
    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)

    # Password reset token (simple approach without external packages)
    password_reset_token = models.UUIDField(null=True, blank=True)
    password_reset_token_expiry = models.DateTimeField(null=True, blank=True)

    # Tell Django to use email as the login field
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']

    objects = UserManager()

    class Meta:
        db_table = 'accounts_user'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-date_joined']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['role']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        return self.first_name

    @property
    def is_employee(self):
        return self.role == self.Role.EMPLOYEE

    @property
    def is_support_agent(self):
        return self.role == self.Role.SUPPORT_AGENT

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN