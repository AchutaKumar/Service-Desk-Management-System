from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from common.responses import success_response, created_response, error_response, not_found_response
from accounts.permissions import IsAdmin
from .models import Department
from .serializers import DepartmentSerializer, DepartmentCreateUpdateSerializer


class DepartmentListCreateView(APIView):
    """GET /api/departments/ - List | POST - Create (Admin only)"""

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    @extend_schema(summary="List departments", tags=["Departments"])
    def get(self, request):
        departments = Department.objects.all()
        if not request.user.role == 'ADMIN':
            departments = departments.filter(is_active=True)
        serializer = DepartmentSerializer(departments, many=True)
        return success_response(data=serializer.data)

    @extend_schema(request=DepartmentCreateUpdateSerializer, summary="Create department", tags=["Departments"])
    def post(self, request):
        serializer = DepartmentCreateUpdateSerializer(data=request.data)
        if serializer.is_valid():
            dept = serializer.save()
            return created_response("Department created successfully.", DepartmentSerializer(dept).data)
        return error_response("Creation failed.", errors=serializer.errors)


class DepartmentDetailView(APIView):
    """GET/PATCH/DELETE /api/departments/{id}/"""

    def get_permissions(self):
        if self.request.method in ['PATCH', 'PUT', 'DELETE']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    def get_object(self, pk):
        try:
            return Department.objects.get(pk=pk)
        except Department.DoesNotExist:
            return None

    @extend_schema(summary="Get department detail", tags=["Departments"])
    def get(self, request, pk):
        dept = self.get_object(pk)
        if not dept:
            return not_found_response("Department not found.")
        return success_response(data=DepartmentSerializer(dept).data)

    @extend_schema(request=DepartmentCreateUpdateSerializer, summary="Update department", tags=["Departments"])
    def patch(self, request, pk):
        dept = self.get_object(pk)
        if not dept:
            return not_found_response("Department not found.")
        serializer = DepartmentCreateUpdateSerializer(dept, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return success_response("Department updated.", DepartmentSerializer(dept).data)
        return error_response("Update failed.", errors=serializer.errors)

    @extend_schema(summary="Delete department", tags=["Departments"])
    def delete(self, request, pk):
        dept = self.get_object(pk)
        if not dept:
            return not_found_response("Department not found.")
        dept.delete()
        return success_response("Department deleted.")
