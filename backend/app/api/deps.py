from uuid import UUID
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload

from app.config import settings
from app.database import get_db
from app.models.auth_session import AuthSession
from app.models.user import User, UserRole
from app.services.auth_service import verify_token


security = HTTPBearer(auto_error=False)
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def enforce_cookie_origin(request: Request) -> None:
    """Reject unsafe browser cookie requests from untrusted origins."""

    if request.method in SAFE_METHODS:
        return

    origin = request.headers.get("origin")
    if not origin:
        if settings.ENVIRONMENT == "production":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Origin header required",
            )
        return

    request_origin = str(request.base_url).rstrip("/")
    allowed_origins = {*settings.CORS_ORIGINS, request_origin}
    if origin.rstrip("/") not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Untrusted request origin",
        )


def _unauthorized(detail: str = "Invalid or expired access token") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    bearer_token = credentials.credentials if credentials else None
    cookie_token = request.cookies.get(settings.ACCESS_COOKIE_NAME)
    token = bearer_token or cookie_token
    if not token:
        raise _unauthorized("Authentication required")

    if cookie_token and not bearer_token:
        enforce_cookie_origin(request)

    payload = verify_token(token, expected_type="access")
    if not payload:
        raise _unauthorized()

    try:
        user_id = UUID(payload["sub"])
        session_id = UUID(payload["sid"])
    except (KeyError, TypeError, ValueError):
        raise _unauthorized() from None

    result = await db.execute(
        select(User)
        .join(
            AuthSession,
            (AuthSession.user_id == User.id) & (AuthSession.id == session_id),
        )
        .options(noload(User.progress))
        .where(
            User.id == user_id,
            User.is_active.is_(True),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(timezone.utc),
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise _unauthorized("User not found or inactive")

    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
