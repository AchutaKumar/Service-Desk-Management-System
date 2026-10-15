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

# Static files with WhiteNoise for serverless & containerized serving
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
