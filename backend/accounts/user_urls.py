"""
User management URL patterns (admin-facing).
"""
from django.urls import path
from .user_views import (
    UserListCreateView, UserDetailView,
    UserActivateView, UserDeactivateView, AgentListView,
)

urlpatterns = [
    path('', UserListCreateView.as_view(), name='user-list-create'),
    path('agents/', AgentListView.as_view(), name='agent-list'),
    path('<int:pk>/', UserDetailView.as_view(), name='user-detail'),
    path('<int:pk>/activate/', UserActivateView.as_view(), name='user-activate'),
    path('<int:pk>/deactivate/', UserDeactivateView.as_view(), name='user-deactivate'),
]
