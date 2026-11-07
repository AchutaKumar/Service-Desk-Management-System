"""
ServiceDesk - Production Settings
"""
from .base import *  # noqa
from decouple import config

import dj_database_url

DEBUG = False

_allowed_hosts_raw = config('ALLOWED_HOSTS', default='*')
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_raw.split(',') if h.strip()]
if '*' not in ALLOWED_HOSTS and '.vercel.app' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('.vercel.app')

# ─────────────────────────────────────────
# Database - Cloud Database (PostgreSQL / Neon / Supabase / MySQL)
# ─────────────────────────────────────────
DATABASE_URL = config('DATABASE_URL', default=None)
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
    DATABASES['default'].setdefault('OPTIONS', {})
    if 'mysql' in DATABASES['default'].get('ENGINE', ''):
        DATABASES['default']['OPTIONS'].setdefault('charset', 'utf8mb4')
        DATABASES['default']['OPTIONS'].setdefault('init_command', "SET sql_mode='STRICT_TRANS_TABLES'")
elif config('DB_HOST', default=None):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': config('DB_NAME', default='servicedesk_db'),
            'USER': config('DB_USER', default='root'),
            'PASSWORD': config('DB_PASSWORD', default=''),
            'HOST': config('DB_HOST', default='localhost'),
            'PORT': config('DB_PORT', default='3306'),
            'OPTIONS': {
                'charset': 'utf8mb4',
                'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }
elif os.environ.get('VERCEL'):
    import shutil
    db_path = BASE_DIR / 'db.sqlite3'
    tmp_db = Path('/tmp/db.sqlite3')
    if not tmp_db.exists() and db_path.exists():
        shutil.copy2(db_path, tmp_db)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': tmp_db,
        }
    }

# Security settings for production
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True

# HSTS: tells browsers to always use HTTPS for this domain.
# Set to 1 year (31536000s). Only enable when the site is fully on HTTPS.
# Read https://docs.djangoproject.com/en/stable/ref/settings/#secure-hsts-seconds
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Redirect HTTP → HTTPS at the Django level (as a backstop; your load balancer
# should also do this).  Disable if you're behind a proxy that handles it.
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)

# Static files with WhiteNoise for serverless & containerized serving
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
