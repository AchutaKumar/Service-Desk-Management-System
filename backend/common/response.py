from rest_framework.response import Response


def ok(message="OK", data=None, code=200):
    payload = {"success": True, "message": message}
    if data is not None:
        payload["data"] = data
    return Response(payload, status=code)


def created(message="Created", data=None):
    return ok(message, data, code=201)


def fail(message="Error", errors=None, code=400):
    payload = {"success": False, "message": message}
    if errors is not None:
        payload["errors"] = errors
    return Response(payload, status=code)