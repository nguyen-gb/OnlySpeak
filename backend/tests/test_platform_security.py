import os
import unittest
from datetime import timedelta
from unittest.mock import patch

os.environ.setdefault(
    "ONLYSPEAK_SECRET_KEY",
    "platform-tests-only-secret-value-12345678901234567890",
)
os.environ.setdefault("ONLYSPEAK_ENVIRONMENT", "test")

from fastapi import HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from starlette.requests import Request

from app.api.auth import _clear_auth_cookies, _set_auth_cookies
from app.api.deps import get_current_user
from app.config import Settings
from app.schemas.chat import FreeTalkRequest
from app.schemas.user import UserUpdate
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    verify_token,
)
from app.services.rate_limit import InMemoryRateLimiter, RateLimitExceeded


TEST_SECRET = "test-only-secret-value-that-is-long-and-random-1234567890"


class SettingsSecurityTests(unittest.TestCase):
    def test_rejects_placeholder_or_short_secret(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValidationError):
                Settings(SECRET_KEY="change-me", _env_file=None)

    def test_accepts_prefixed_environment_variables(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ONLYSPEAK_SECRET_KEY": TEST_SECRET,
                "ONLYSPEAK_ENVIRONMENT": "test",
                "ONLYSPEAK_CORS_ORIGINS": '["https://web.example.com"]',
            },
            clear=True,
        ):
            configured = Settings(_env_file=None)

        self.assertEqual(configured.ENVIRONMENT, "test")
        self.assertEqual(configured.CORS_ORIGINS, ["https://web.example.com"])

    def test_production_requires_secure_cookies_and_https_cors(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValidationError):
                Settings(
                    SECRET_KEY=TEST_SECRET,
                    ENVIRONMENT="production",
                    COOKIE_SECURE=False,
                    CORS_ORIGINS=["https://web.example.com"],
                    _env_file=None,
                )
            with self.assertRaises(ValidationError):
                Settings(
                    SECRET_KEY=TEST_SECRET,
                    ENVIRONMENT="production",
                    CORS_ORIGINS=["http://web.example.com"],
                    _env_file=None,
                )

    def test_valid_production_configuration_enables_secure_cookies(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            configured = Settings(
                SECRET_KEY=TEST_SECRET,
                ENVIRONMENT="production",
                DATABASE_URL=(
                    "postgresql+asyncpg://service:strong-password@db.example.com/app"
                ),
                GOOGLE_CLIENT_ID="web-client.apps.googleusercontent.com",
                CORS_ORIGINS=["https://web.example.com"],
                _env_file=None,
            )

        self.assertTrue(configured.cookie_secure)
        self.assertFalse(configured.docs_enabled)

    def test_production_rejects_sqlite_and_explicit_api_docs(self) -> None:
        common = {
            "SECRET_KEY": TEST_SECRET,
            "ENVIRONMENT": "production",
            "GOOGLE_CLIENT_ID": "web-client.apps.googleusercontent.com",
            "CORS_ORIGINS": ["https://web.example.com"],
            "_env_file": None,
        }
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValidationError):
                Settings(
                    **common,
                    DATABASE_URL="sqlite+aiosqlite:///production.db",
                )
            with self.assertRaises(ValidationError):
                Settings(
                    **common,
                    DATABASE_URL=(
                        "postgresql+asyncpg://service:strong-password@db.example.com/app"
                    ),
                    DOCS_ENABLED=True,
                )


class TokenSecurityTests(unittest.TestCase):
    def test_access_and_refresh_tokens_are_not_interchangeable(self) -> None:
        access = create_access_token({"sub": "user-123"})
        refresh = create_refresh_token({"sub": "user-123"})

        self.assertIsNotNone(verify_token(access, expected_type="access"))
        self.assertIsNone(verify_token(access, expected_type="refresh"))
        self.assertIsNotNone(verify_token(refresh, expected_type="refresh"))
        self.assertIsNone(verify_token(refresh, expected_type="access"))

    def test_reserved_claims_cannot_override_access_token_type(self) -> None:
        token = create_access_token(
            {"sub": "user-123", "type": "refresh", "iss": "attacker"}
        )
        payload = verify_token(token, expected_type="access")

        self.assertIsNotNone(payload)
        self.assertEqual(payload["type"], "access")

    def test_expired_token_is_rejected(self) -> None:
        token = create_access_token(
            {"sub": "user-123"}, expires_delta=timedelta(seconds=-1)
        )
        self.assertIsNone(verify_token(token, expected_type="access"))


class AuthenticationDependencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_cookie_cannot_authenticate_a_protected_endpoint(self) -> None:
        class DatabaseMustNotBeUsed:
            async def execute(self, *_: object) -> None:
                raise AssertionError("Refresh token should be rejected before DB access")

        token = create_refresh_token({"sub": "56dad96c-88cf-4391-a4bb-dba1935b999e"})
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/auth/me",
                "headers": [],
                "query_string": b"",
                "server": ("testserver", 80),
                "client": ("127.0.0.1", 1234),
                "scheme": "http",
            }
        )
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        with self.assertRaises(HTTPException) as raised:
            await get_current_user(request, credentials, DatabaseMustNotBeUsed())
        self.assertEqual(raised.exception.status_code, 401)


class CookieSecurityTests(unittest.TestCase):
    def test_session_tokens_are_http_only_path_scoped_cookies(self) -> None:
        response = Response()
        _set_auth_cookies(response, "access-value", "refresh-value")
        cookies = response.headers.getlist("set-cookie")

        self.assertEqual(len(cookies), 2)
        self.assertIn("onlyspeak_access_token=access-value", cookies[0])
        self.assertIn("HttpOnly", cookies[0])
        self.assertIn("Path=/", cookies[0])
        self.assertIn("SameSite=lax", cookies[0])
        self.assertIn("onlyspeak_refresh_token=refresh-value", cookies[1])
        self.assertIn("Path=/api/auth", cookies[1])

    def test_logout_expires_both_cookie_paths(self) -> None:
        response = Response()
        _clear_auth_cookies(response)
        cookies = response.headers.getlist("set-cookie")

        self.assertEqual(len(cookies), 2)
        self.assertTrue(all("Max-Age=0" in cookie for cookie in cookies))
        self.assertTrue(any("Path=/api/auth" in cookie for cookie in cookies))


class ChatSchemaTests(unittest.TestCase):
    def test_chat_payload_is_typed_and_bounded(self) -> None:
        with self.assertRaises(ValidationError):
            FreeTalkRequest.model_validate(
                {
                    "conversation_id": "56dad96c-88cf-4391-a4bb-dba1935b999e",
                    "user_input": "   ",
                }
            )
        with self.assertRaises(ValidationError):
            FreeTalkRequest.model_validate(
                {
                    "conversation_id": "56dad96c-88cf-4391-a4bb-dba1935b999e",
                    "user_input": "hello",
                    "role_played": "C",
                }
            )
        with self.assertRaises(ValidationError):
            FreeTalkRequest.model_validate(
                {
                    "conversation_id": "56dad96c-88cf-4391-a4bb-dba1935b999e",
                    "user_input": "hello",
                    "history": [
                        {"role": "user", "content": "message"} for _ in range(21)
                    ],
                }
            )

    def test_profile_rejects_non_http_avatar_url(self) -> None:
        with self.assertRaises(ValidationError):
            UserUpdate(avatar_url="javascript:alert(1)")
        with self.assertRaises(ValidationError):
            UserUpdate(full_name=None)


class RateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_sliding_window_limit_returns_retry_delay(self) -> None:
        limiter = InMemoryRateLimiter()
        await limiter.check("user", limit=2, window_seconds=60)
        await limiter.check("user", limit=2, window_seconds=60)

        with self.assertRaises(RateLimitExceeded) as raised:
            await limiter.check("user", limit=2, window_seconds=60)
        self.assertGreaterEqual(raised.exception.retry_after, 1)


if __name__ == "__main__":
    unittest.main()
