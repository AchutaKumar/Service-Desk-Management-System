"""
Departments app - Django Admin registrations.
"""
from django.contrib import admin
from .models import Department


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'user_count', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'description']

    def user_count(self, obj):
        return obj.users.count()
    user_count.short_description = 'Members'
