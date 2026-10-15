from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from common.responses import success_response, created_response, error_response, not_found_response
from accounts.permissions import IsAdmin
from .models import Category, SubCategory
from .serializers import (
    CategorySerializer, CategoryCreateUpdateSerializer,
    SubCategorySerializer, SubCategoryCreateSerializer,
)


class CategoryListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    @extend_schema(summary="List categories", tags=["Categories"])
    def get(self, request):
        cats = Category.objects.prefetch_related('subcategories')
        if request.user.role != 'ADMIN':
            cats = cats.filter(is_active=True)
        return success_response(data=CategorySerializer(cats, many=True).data)

    @extend_schema(request=CategoryCreateUpdateSerializer, summary="Create category", tags=["Categories"])
    def post(self, request):
        s = CategoryCreateUpdateSerializer(data=request.data)
        if s.is_valid():
            cat = s.save()
            return created_response("Category created.", CategorySerializer(cat).data)
        return error_response("Failed.", errors=s.errors)


class CategoryDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ['PATCH', 'PUT', 'DELETE']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    def get_object(self, pk):
        try:
            return Category.objects.prefetch_related('subcategories').get(pk=pk)
        except Category.DoesNotExist:
            return None

    @extend_schema(summary="Get category", tags=["Categories"])
    def get(self, request, pk):
        cat = self.get_object(pk)
        if not cat:
            return not_found_response("Category not found.")
        return success_response(data=CategorySerializer(cat).data)

    @extend_schema(request=CategoryCreateUpdateSerializer, summary="Update category", tags=["Categories"])
    def patch(self, request, pk):
        cat = self.get_object(pk)
        if not cat:
            return not_found_response("Category not found.")
        s = CategoryCreateUpdateSerializer(cat, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return success_response("Updated.", CategorySerializer(cat).data)
        return error_response("Failed.", errors=s.errors)

    @extend_schema(summary="Delete category", tags=["Categories"])
    def delete(self, request, pk):
        cat = self.get_object(pk)
        if not cat:
            return not_found_response("Category not found.")
        cat.delete()
        return success_response("Category deleted.")


class SubCategoryListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    @extend_schema(summary="List subcategories for a category", tags=["Categories"])
    def get(self, request, cat_pk):
        subs = SubCategory.objects.filter(category_id=cat_pk, is_active=True)
        return success_response(data=SubCategorySerializer(subs, many=True).data)

    @extend_schema(request=SubCategoryCreateSerializer, summary="Create subcategory", tags=["Categories"])
    def post(self, request, cat_pk):
        data = request.data.copy()
        data['category'] = cat_pk
        s = SubCategoryCreateSerializer(data=data)
        if s.is_valid():
            sub = s.save()
            return created_response("Subcategory created.", SubCategorySerializer(sub).data)
        return error_response("Failed.", errors=s.errors)
