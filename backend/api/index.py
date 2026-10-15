"""
WSGI entrypoint for Vercel Serverless Functions.
Vercel's Python runtime discovers and executes this `app` callable.
"""
import os
import sys
from pathlib import Path

# Ensure the backend root is on the Python path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('DJANGO_ENV', 'production')

from django.core.wsgi import get_wsgi_application

# Vercel looks for `app` by convention
app = get_wsgi_application()
