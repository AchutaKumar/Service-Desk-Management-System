"""
JWT Authentication Middleware for Channels / WebSockets.

Authenticates WebSocket connections using JWT access tokens passed via:
1. Query string: ?token=<access_token>
2. Headers: Authorization: Bearer <access_token>
"""
from urllib.parse import parse_qs
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_string):
    """Validate JWT token and return active user, or AnonymousUser."""
    if not token_string:
        return AnonymousUser()
    try:
        access_token = AccessToken(token_string)
        user_id = access_token.get('user_id')
        if not user_id:
            return AnonymousUser()
        return User.objects.get(id=user_id, is_active=True)
    except (InvalidToken, TokenError, User.DoesNotExist, Exception):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Channels middleware that parses the JWT token from the query string
    or the Authorization header and populates scope['user'].
    """

    async def __call__(self, scope, receive, send):
        token = None

        # 1. Try to read token from query parameters
        query_string = scope.get('query_string', b'').decode('utf-8')
        if query_string:
            params = parse_qs(query_string)
            token_list = params.get('token')
            if token_list:
                token = token_list[0]

        # 2. Try to read from headers if not in query params
        if not token:
            headers = dict(scope.get('headers', []))
            auth_header = headers.get(b'authorization', b'').decode('utf-8')
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ', 1)[1]

        scope['user'] = await get_user_from_token(token)
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)

