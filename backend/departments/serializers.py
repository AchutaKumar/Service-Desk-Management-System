from rest_framework import serializers
from .models import Department


class DepartmentSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ['id', 'name', 'description', 'is_active', 'user_count', 'created_at']

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


class DepartmentCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['name', 'description', 'is_active']
