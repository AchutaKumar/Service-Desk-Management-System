"""
Category and SubCategory models for ticket classification.
"""
from django.db import models


class Category(models.Model):
    """
    Ticket category (Hardware, Software, Network, etc.).
    Admins manage these. Employees select a category when creating a ticket.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'categories_category'
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class SubCategory(models.Model):
    """
    Optional subcategory within a category.
    Example: Category=Software, SubCategory=MS Office / Antivirus
    """
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='subcategories',
    )
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'categories_subcategory'
        unique_together = ('category', 'name')
        ordering = ['name']

    def __str__(self):
        return f"{self.category.name} → {self.name}"