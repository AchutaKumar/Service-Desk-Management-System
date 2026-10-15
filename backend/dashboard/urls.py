from django.urls import path
from . import views

urlpatterns = [
    path('employee/', views.EmployeeDashboardView.as_view(), name='dashboard-employee'),
    path('agent/', views.AgentDashboardView.as_view(), name='dashboard-agent'),
    path('admin/', views.AdminDashboardView.as_view(), name='dashboard-admin'),
]
