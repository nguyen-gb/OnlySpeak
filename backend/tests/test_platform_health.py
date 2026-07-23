import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault(
    "ONLYSPEAK_SECRET_KEY",
    "platform-tests-only-secret-value-12345678901234567890",
)
os.environ.setdefault("ONLYSPEAK_ENVIRONMENT", "test")

from fastapi.testclient import TestClient

from app.main import _readiness_response, app


async def _raise_unhandled_error() -> None:
    raise RuntimeError("test-only unhandled error")


app.add_api_route(
    "/api/__test/unhandled-error",
    _raise_unhandled_error,
    methods=["GET"],
    include_in_schema=False,
)


class FakeConnectionContext:
    def __init__(self, *, fails: bool = False) -> None:
        self.fails = fails

    async def __aenter__(self) -> "FakeConnectionContext":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def execute(self, _: object) -> None:
        if self.fails:
            raise ConnectionError("database unavailable")


class FakeEngine:
    def __init__(self, *, fails: bool = False) -> None:
        self.fails = fails

    def connect(self) -> FakeConnectionContext:
        return FakeConnectionContext(fails=self.fails)


class ReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_readiness_is_healthy_only_when_database_responds(self) -> None:
        with patch("app.main.engine", FakeEngine()):
            response = await _readiness_response()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.body), {"status": "ok", "database": "ok"})

    async def test_readiness_returns_503_when_database_fails(self) -> None:
        with patch("app.main.engine", FakeEngine(fails=True)):
            response = await _readiness_response()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.body)["database"], "unavailable")


class OpenAPIContractTests(unittest.TestCase):
    def test_refresh_has_no_javascript_readable_token_body(self) -> None:
        schema = app.openapi()
        refresh_operation = schema["paths"]["/api/auth/refresh"]["post"]
        self.assertNotIn("requestBody", refresh_operation)
        token_schema = schema["components"]["schemas"]["TokenResponse"]
        self.assertNotIn("access_token", token_schema["properties"])
        self.assertNotIn("refresh_token", token_schema["properties"])

    def test_liveness_does_not_depend_on_database(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/live")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_oversized_request_is_rejected_before_body_parsing(self) -> None:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/register",
                content=b"x" * 1_048_577,
                headers={"Content-Type": "application/json"},
            )
        self.assertEqual(response.status_code, 413)

    def test_chunked_oversized_request_is_rejected_with_cors_headers(self) -> None:
        def chunks():
            yield b"x" * 600_000
            yield b"x" * 600_000

        with TestClient(app) as client:
            response = client.post(
                "/api/auth/register",
                content=chunks(),
                headers={
                    "Content-Type": "application/json",
                    "Origin": "http://localhost:3000",
                },
            )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "http://localhost:3000",
        )
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")

    def test_unhandled_error_keeps_cors_and_security_headers(self) -> None:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(
                "/api/__test/unhandled-error",
                headers={
                    "Origin": "http://localhost:3000",
                    "X-Request-ID": "test-unhandled-error",
                },
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Internal server error"})
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "http://localhost:3000",
        )
        self.assertEqual(response.headers.get("x-request-id"), "test-unhandled-error")
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")


if __name__ == "__main__":
    unittest.main()
