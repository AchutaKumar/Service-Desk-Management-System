"""
ASGI config for ServiceDesk project with Django Channels support.

Routes HTTP traffic to standard Django ASGI application and
WebSocket traffic to Channels with JWT Authentication Middleware.
"""
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Initialize Django ASGI application early to ensure AppRegistry is populated
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from tickets.middleware import JWTAuthMiddlewareStack
import tickets.routing
import notifications.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(
            tickets.routing.websocket_urlpatterns + notifications.routing.websocket_urlpatterns
        )
    ),
})
