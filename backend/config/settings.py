"""
ServiceDesk - Configuration Shim
Forwards all settings to the modular config/settings/ package.
"""
from decouple import config
from config.settings.base import *  # noqa

_env = config('DJANGO_ENV', default='development')

if _env == 'production':
    from config.settings.production import *  # noqa
else:
    from config.settings.development import *  # noqa
