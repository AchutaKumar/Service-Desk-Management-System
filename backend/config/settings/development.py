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
# If on Vercel without a DATABASE_URL, copy SQLite to writable /tmp
db_path = BASE_DIR / 'db.sqlite3'
if os.environ.get('VERCEL'):
    import shutil
    tmp_db = Path('/tmp/db.sqlite3')
    if not tmp_db.exists() and db_path.exists():
        shutil.copy2(db_path, tmp_db)
    db_path = tmp_db

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': db_path,
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
