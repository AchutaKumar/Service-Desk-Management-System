"""
ServiceDesk - Development Settings
"""
from .base import *  # noqa

DEBUG = True

_allowed_hosts_raw = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,.vercel.app')
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_raw.split(',') if h.strip()]
if '*' not in ALLOWED_HOSTS and '.vercel.app' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('.vercel.app')

# ─────────────────────────────────────────
# Database - SQLite for local development
# Override base.py MySQL setting for easier local setup
# ─────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Show SQL queries in development (uncomment to enable)
# LOGGING = {
#     'version': 1,
#     'handlers': {'console': {'class': 'logging.StreamHandler'}},
#     'loggers': {
#         'django.db.backends': {
#             'handlers': ['console'],
#             'level': 'DEBUG',
#         },
#     },
# }
