from __future__ import annotations

import hashlib
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict
from urllib.parse import urlsplit

import httpx
import jwt

from app.config import settings


logger = logging.getLogger(__name__)
TokenType = Literal["access", "refresh"]
RESERVED_CLAIMS = {"aud", "exp", "iat", "iss", "jti", "nbf", "sid", "type"}


class GoogleIdentity(TypedDict):
    email: str
    name: str
    picture: str
    sub: str


class GoogleAuthConfigurationError(RuntimeError):
    """Google login is unavailable because the server is not configured."""


class GoogleProviderError(RuntimeError):
    """Google's verification service could not be reached reliably."""


def _create_token(
    data: dict[str, object],
    token_type: TokenType,
    lifetime: timedelta,
    *,
    session_id: str | None = None,
) -> str:
    subject = str(data.get("sub", "")).strip()
    if not subject:
        raise ValueError("Token subject is required")

    now = datetime.now(timezone.utc)
    claims = {key: value for key, value in data.items() if key not in RESERVED_CLAIMS}
    claims.update(
        {
            "sub": subject,
            "type": token_type,
            "iat": now,
            "nbf": now,
            "exp": now + lifetime,
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "jti": str(uuid.uuid4()),
        }
    )
    if session_id:
        claims["sid"] = str(session_id)
    return jwt.encode(
        claims,
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )


def create_access_token(
    data: dict[str, object],
    expires_delta: timedelta | None = None,
    *,
    session_id: str | None = None,
) -> str:
    return _create_token(
        data,
        "access",
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        session_id=session_id,
    )


def create_refresh_token(
    data: dict[str, object],
    *,
    session_id: str | None = None,
) -> str:
    return _create_token(
        data,
        "refresh",
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        session_id=session_id,
    )


def hash_refresh_token(token: str) -> str:
    """Store only a one-way fingerprint of a refresh credential."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, expected_type: TokenType | None = None) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={
                "require": ["sub", "type", "iat", "nbf", "exp", "iss", "aud", "jti"]
            },
        )
    except jwt.PyJWTError:
        return None

    token_type = payload.get("type")
    if token_type not in {"access", "refresh"}:
        return None
    if expected_type is not None and token_type != expected_type:
        return None
    if not isinstance(payload.get("sub"), str) or not payload["sub"].strip():
        return None
    return payload


async def verify_google_token(token: str) -> GoogleIdentity | None:
    """Verify a Google ID token against Google's tokeninfo service."""

    allowed_client_ids = {
        client_id
        for client_id in (
            settings.GOOGLE_CLIENT_ID,
            settings.GOOGLE_IOS_CLIENT_ID,
            settings.GOOGLE_ANDROID_CLIENT_ID,
        )
        if client_id
    }
    if not allowed_client_ids:
        raise GoogleAuthConfigurationError("Google OAuth client ID is not configured")

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROVIDER_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": token},
                headers={"Accept": "application/json"},
            )
    except httpx.RequestError as exc:
        logger.warning("Google token verification unavailable: %s", type(exc).__name__)
        raise GoogleProviderError("Google token verification is unavailable") from exc

    if response.status_code in {429, 500, 502, 503, 504}:
        logger.warning("Google token verification returned status %s", response.status_code)
        raise GoogleProviderError("Google token verification is unavailable")
    if response.status_code != 200:
        return None

    try:
        data = response.json()
    except ValueError as exc:
        logger.warning("Google token verification returned malformed JSON")
        raise GoogleProviderError("Google token verification returned an invalid response") from exc
    if not isinstance(data, dict):
        logger.warning("Google token verification returned an invalid JSON shape")
        raise GoogleProviderError("Google token verification returned an invalid response")

    issuer = data.get("iss")
    email_verified = data.get("email_verified")
    try:
        expires_at = int(data.get("exp", 0))
    except (TypeError, ValueError):
        return None

    email = data.get("email")
    subject = data.get("sub")
    if isinstance(email, str):
        email = email.strip()
    if isinstance(subject, str):
        subject = subject.strip()
    if (
        data.get("aud") not in allowed_client_ids
        or issuer not in {"accounts.google.com", "https://accounts.google.com"}
        or email_verified not in (True, "true")
        or expires_at <= int(time.time())
        or not isinstance(email, str)
        or not email
        or len(email) > 255
        or not isinstance(subject, str)
        or not subject
        or len(subject) > 255
    ):
        return None

    name = data.get("name")
    picture = data.get("picture")
    normalized_name = name.strip() if isinstance(name, str) else ""
    normalized_picture = picture.strip() if isinstance(picture, str) else ""
    parsed_picture = urlsplit(normalized_picture)
    if parsed_picture.scheme != "https" or not parsed_picture.netloc:
        normalized_picture = ""
    return {
        "email": email,
        "name": normalized_name or email.split("@", 1)[0],
        "picture": normalized_picture,
        "sub": subject,
    }
