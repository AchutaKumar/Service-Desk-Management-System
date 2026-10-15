"""
Department model.
"""
from django.db import models


class Department(models.Model):
    """
    Represents a company department (HR, Finance, IT, etc.).
    Users belong to departments, and tickets can be associated with departments.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departments_department'
        ordering = ['name']

    def __str__(self):
        return self.name