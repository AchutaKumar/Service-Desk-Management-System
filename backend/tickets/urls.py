from django.urls import path
from . import views

urlpatterns = [
    # Priorities
    path('priorities/', views.PriorityListView.as_view(), name='priority-list'),
    path('priorities/<int:pk>/', views.PriorityDetailView.as_view(), name='priority-detail'),

    # Ticket List and Create
    path('', views.TicketListCreateView.as_view(), name='ticket-list-create'),

    # Ticket Detail
    path('<int:pk>/', views.TicketDetailView.as_view(), name='ticket-detail'),

    # Ticket Actions
    path('<int:pk>/assign/', views.TicketAssignView.as_view(), name='ticket-assign'),
    path('<int:pk>/status/', views.TicketStatusChangeView.as_view(), name='ticket-status'),
    path('<int:pk>/resolve/', views.TicketResolveView.as_view(), name='ticket-resolve'),
    path('<int:pk>/close/', views.TicketCloseView.as_view(), name='ticket-close'),
    path('<int:pk>/reopen/', views.TicketReopenView.as_view(), name='ticket-reopen'),

    # Comments
    path('<int:pk>/comments/', views.TicketCommentListCreateView.as_view(), name='ticket-comments'),
    path('<int:pk>/comments/<int:comment_pk>/', views.TicketCommentDetailView.as_view(), name='ticket-comment-detail'),

    # Attachments
    path('<int:pk>/attachments/', views.TicketAttachmentView.as_view(), name='ticket-attachments'),

    # History
    path('<int:pk>/history/', views.TicketHistoryView.as_view(), name='ticket-history'),

    # Bulk actions
    path('bulk-actions/', views.TicketBulkActionView.as_view(), name='ticket-bulk-actions'),
]
