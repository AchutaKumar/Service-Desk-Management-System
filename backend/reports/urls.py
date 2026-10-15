from django.urls import path
from . import views

urlpatterns = [
    path('tickets-by-status/', views.TicketsByStatusReport.as_view(), name='report-by-status'),
    path('tickets-by-priority/', views.TicketsByPriorityReport.as_view(), name='report-by-priority'),
    path('tickets-by-category/', views.TicketsByCategoryReport.as_view(), name='report-by-category'),
    path('tickets-by-department/', views.TicketsByDepartmentReport.as_view(), name='report-by-department'),
    path('agent-workload/', views.AgentWorkloadReport.as_view(), name='report-agent-workload'),
    path('sla-performance/', views.SLAPerformanceReport.as_view(), name='report-sla'),
    path('overdue-tickets/', views.OverdueTicketsReport.as_view(), name='report-overdue'),
]
