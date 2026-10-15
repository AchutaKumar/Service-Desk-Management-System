"""
ServiceDesk - Settings Package Init
Automatically selects development or production settings based on DEBUG env var.
"""
from decouple import config

env = config('DJANGO_ENV', default='development')

if env == 'production':
    from .production import *  # noqa
else:
    from .development import *  # noqa
