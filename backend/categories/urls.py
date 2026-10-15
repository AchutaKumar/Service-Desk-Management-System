from django.urls import path
from . import views

urlpatterns = [
    path('', views.CategoryListCreateView.as_view(), name='category-list-create'),
    path('<int:pk>/', views.CategoryDetailView.as_view(), name='category-detail'),
    path('<int:cat_pk>/subcategories/', views.SubCategoryListCreateView.as_view(), name='subcategory-list'),
]
