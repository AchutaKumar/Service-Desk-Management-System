"""
Management command: seed_data

Seeds the database with essential initial data:
  - Priority levels (LOW, MEDIUM, HIGH, CRITICAL) with SLA hours
  - Default departments (IT, HR, Finance, Operations)
  - Default categories (Hardware, Software, Network, Access, Other)
  - Demo admin user (admin@servicedesk.com / Admin@1234)
  - Demo support agent (agent@servicedesk.com / Agent@1234)
  - Demo employee (employee@servicedesk.com / Employee@1234)

Usage:
    python manage.py seed_data
    python manage.py seed_data --skip-users   (seed data only, skip demo users)
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Seeds the database with essential initial data for ServiceDesk.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--skip-users',
            action='store_true',
            help='Skip creating demo users.',
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete all existing seeded data and re-create (DANGEROUS in production!).',
        )

    def handle(self, *args, **options):
        self._ensure_utf8_output()
        self.stdout.write(self.style.MIGRATE_HEADING('=== ServiceDesk Data Seeder ==='))

        self._seed_priorities(options.get('reset', False))
        self._seed_departments()
        self._seed_categories()

        if not options.get('skip_users', False):
            self._seed_demo_users()

        self.stdout.write(self.style.SUCCESS('\n✓ Seeding complete!'))
        self.stdout.write('')
        self.stdout.write('You can now log in with:')
        self.stdout.write('  Admin:    admin@servicedesk.com    / Admin@1234')
        self.stdout.write('  Agent:    agent@servicedesk.com    / Agent@1234')
        self.stdout.write('  Employee: employee@servicedesk.com / Employee@1234')

    def _ensure_utf8_output(self):
        """
        Windows consoles default to cp1252, which cannot encode the
        checkmark/arrow glyphs used in this command's output.
        Force UTF-8 so seeding does not crash with UnicodeEncodeError.
        """
        for stream in (self.stdout, self.stderr):
            underlying = getattr(stream, '_out', None)
            if underlying is not None and hasattr(underlying, 'reconfigure'):
                try:
                    underlying.reconfigure(encoding='utf-8', errors='replace')
                except (ValueError, OSError):
                    pass

    def _seed_priorities(self, reset=False):
        from tickets.models import Priority

        self.stdout.write('\n[1/4] Seeding Priorities...')

        if reset:
            Priority.objects.all().delete()
            self.stdout.write('  ↳ Cleared existing priorities.')

        priorities = [
            {'name': 'LOW',      'sla_hours': 72,  'description': 'Low priority issues — cosmetic bugs, non-urgent requests.'},
            {'name': 'MEDIUM',   'sla_hours': 24,  'description': 'Medium priority issues — functional but workarounds exist.'},
            {'name': 'HIGH',     'sla_hours': 8,   'description': 'High priority issues — significant impact on productivity.'},
            {'name': 'CRITICAL', 'sla_hours': 2,   'description': 'Critical issues — complete outage, no workaround, business stopped.'},
        ]

        created = 0
        for p in priorities:
            _, is_new = Priority.objects.get_or_create(
                name=p['name'],
                defaults={'sla_hours': p['sla_hours'], 'description': p['description']},
            )
            if is_new:
                created += 1
                self.stdout.write(f'  ✓ Created priority: {p["name"]} ({p["sla_hours"]}h SLA)')
            else:
                self.stdout.write(f'  - Priority already exists: {p["name"]}')

        self.stdout.write(self.style.SUCCESS(f'  → {created} priorities created.'))

    def _seed_departments(self):
        from departments.models import Department

        self.stdout.write('\n[2/4] Seeding Departments...')

        departments = [
            {'name': 'IT Department',       'description': 'Information Technology and Infrastructure'},
            {'name': 'HR Department',        'description': 'Human Resources and People Operations'},
            {'name': 'Finance Department',   'description': 'Finance and Accounting'},
            {'name': 'Operations',           'description': 'Business Operations and Facilities'},
            {'name': 'Marketing',            'description': 'Marketing and Communications'},
            {'name': 'Sales',               'description': 'Sales and Business Development'},
        ]

        created = 0
        for d in departments:
            _, is_new = Department.objects.get_or_create(
                name=d['name'],
                defaults={'description': d['description']},
            )
            if is_new:
                created += 1
                self.stdout.write(f'  ✓ Created department: {d["name"]}')
            else:
                self.stdout.write(f'  - Department already exists: {d["name"]}')

        self.stdout.write(self.style.SUCCESS(f'  → {created} departments created.'))

    def _seed_categories(self):
        from categories.models import Category, SubCategory

        self.stdout.write('\n[3/4] Seeding Categories...')

        categories_data = [
            {
                'name': 'Hardware',
                'description': 'Physical hardware issues — computers, monitors, printers, peripherals.',
                'subcategories': [
                    'Desktop Computer', 'Laptop', 'Monitor', 'Printer', 'Scanner',
                    'Keyboard / Mouse', 'Other Hardware',
                ],
            },
            {
                'name': 'Software',
                'description': 'Software installation, errors, and application issues.',
                'subcategories': [
                    'Application Error', 'Installation / Upgrade', 'License Issue',
                    'Operating System', 'Microsoft Office', 'Email Client', 'Other Software',
                ],
            },
            {
                'name': 'Network / Connectivity',
                'description': 'Network, internet, and connectivity problems.',
                'subcategories': [
                    'No Internet', 'Slow Connection', 'VPN Issue', 'Wi-Fi Problem',
                    'Network Drive Access', 'Other Network',
                ],
            },
            {
                'name': 'Account / Access',
                'description': 'User account issues, password resets, and access requests.',
                'subcategories': [
                    'Password Reset', 'Account Locked', 'New Account Request',
                    'Permission Request', 'Other Access',
                ],
            },
            {
                'name': 'Email',
                'description': 'Email-related issues — sending, receiving, configuration.',
                'subcategories': [
                    'Cannot Send Email', 'Cannot Receive Email',
                    'Email Configuration', 'Spam / Phishing', 'Other Email',
                ],
            },
            {
                'name': 'General Request',
                'description': 'General IT service requests not covered by other categories.',
                'subcategories': [
                    'New Equipment Request', 'Software Request', 'IT Consultation', 'Other',
                ],
            },
        ]

        created_cats = 0
        created_subs = 0

        for cat_data in categories_data:
            cat, is_new = Category.objects.get_or_create(
                name=cat_data['name'],
                defaults={'description': cat_data['description']},
            )
            if is_new:
                created_cats += 1
                self.stdout.write(f'  ✓ Created category: {cat_data["name"]}')

            for sub_name in cat_data.get('subcategories', []):
                _, sub_is_new = SubCategory.objects.get_or_create(
                    name=sub_name,
                    category=cat,
                    defaults={},
                )
                if sub_is_new:
                    created_subs += 1

        self.stdout.write(self.style.SUCCESS(
            f'  → {created_cats} categories and {created_subs} subcategories created.'
        ))

    def _seed_demo_users(self):
        self.stdout.write('\n[4/4] Seeding Demo Users...')

        demo_users = [
            {
                'email': 'admin@servicedesk.com',
                'username': 'admin',
                'first_name': 'System',
                'last_name': 'Admin',
                'role': 'ADMIN',
                'password': 'Admin@1234',
                'is_staff': True,
                'is_superuser': True,
            },
            {
                'email': 'agent@servicedesk.com',
                'username': 'agent1',
                'first_name': 'John',
                'last_name': 'Agent',
                'role': 'SUPPORT_AGENT',
                'password': 'Agent@1234',
            },
            {
                'email': 'employee@servicedesk.com',
                'username': 'employee1',
                'first_name': 'Jane',
                'last_name': 'Employee',
                'role': 'EMPLOYEE',
                'password': 'Employee@1234',
            },
        ]

        created = 0
        for user_data in demo_users:
            password = user_data.pop('password')
            email = user_data['email']

            if User.objects.filter(email=email).exists():
                self.stdout.write(f'  - User already exists: {email}')
                continue

            user = User.objects.create_user(password=password, **user_data)
            created += 1
            self.stdout.write(f'  ✓ Created user: {email} (role: {user.role})')

        self.stdout.write(self.style.SUCCESS(f'  → {created} demo users created.'))
