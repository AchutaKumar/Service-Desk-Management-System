"""
Quick setup script: creates an admin user and seed data for testing.
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from django.contrib.auth import get_user_model
from tickets.models import Priority

User = get_user_model()

# Create admin user
if not User.objects.filter(email='admin@servicedesk.com').exists():
    admin = User.objects.create_user(
        email='admin@servicedesk.com',
        username='admin',
        first_name='Admin',
        last_name='User',
        password='Admin@1234',
        role='ADMIN',
        is_staff=True,
        is_superuser=True,
        is_active=True,
    )
    print(f"[OK] Admin user created: {admin.email} / Admin@1234")
else:
    print("[SKIP] Admin user already exists")

# Create agent user
if not User.objects.filter(email='agent@servicedesk.com').exists():
    agent = User.objects.create_user(
        email='agent@servicedesk.com',
        username='agent1',
        first_name='Support',
        last_name='Agent',
        password='Agent@1234',
        role='SUPPORT_AGENT',
        is_active=True,
    )
    print(f"[OK] Agent user created: {agent.email} / Agent@1234")
else:
    print("[SKIP] Agent user already exists")

# Create employee user
if not User.objects.filter(email='employee@servicedesk.com').exists():
    emp = User.objects.create_user(
        email='employee@servicedesk.com',
        username='employee1',
        first_name='Test',
        last_name='Employee',
        password='Employee@1234',
        role='EMPLOYEE',
        is_active=True,
    )
    print(f"[OK] Employee user created: {emp.email} / Employee@1234")
else:
    print("[SKIP] Employee user already exists")

# Seed priorities if not present
priorities = [
    ('LOW', 48, 'Low priority issues with minimal business impact.'),
    ('MEDIUM', 24, 'Medium priority issues affecting some users.'),
    ('HIGH', 8, 'High priority issues affecting multiple users or critical systems.'),
    ('CRITICAL', 2, 'Critical issues causing complete system outage or data loss.'),
]
for name, sla, desc in priorities:
    p, created = Priority.objects.get_or_create(name=name, defaults={'sla_hours': sla, 'description': desc})
    if created:
        print(f"[OK] Priority created: {name}")
    else:
        print(f"[SKIP] Priority already exists: {name}")

print("\n[DONE] Test seed complete.")
print("Admin: admin@servicedesk.com / Admin@1234")
print("Agent: agent@servicedesk.com / Agent@1234")
print("Employee: employee@servicedesk.com / Employee@1234")
