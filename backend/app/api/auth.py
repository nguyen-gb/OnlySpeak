from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload

from app.api.deps import enforce_cookie_origin, get_current_user
from app.config import settings
from app.database import get_db
from app.models.auth_session import AuthSession
from app.models.user import AuthProvider, User
from app.schemas.user import GoogleLogin, TokenResponse, UserResponse, UserUpdate
from app.services.auth_service import (
    GoogleAuthConfigurationError,
    GoogleProviderError,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    verify_google_token,
    verify_token,
)
from app.services.rate_limit import RateLimitExceeded, rate_limiter


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_response(user: User) -> UserResponse:
    return UserResponse.model_validate(user)


def _set_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    _set_access_cookie(response, access_token)
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",
        **_cookie_options(),
    )
    _set_no_store(response)


def _cookie_options() -> dict[str, object]:
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.COOKIE_SAMESITE,
        "domain": settings.COOKIE_DOMAIN,
    }


def _set_access_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key=settings.ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        **_cookie_options(),
    )
    _set_no_store(response)


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        settings.ACCESS_COOKIE_NAME,
        path="/",
        domain=settings.COOKIE_DOMAIN,
    )
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path="/api/auth",
        domain=settings.COOKIE_DOMAIN,
    )
    _set_no_store(response)


def _invalid_session_response(detail: str) -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": detail},
    )
    _clear_auth_cookies(response)
    return response


async def _check_auth_rate_limit(request: Request, action: str) -> None:
    client_host = request.client.host if request.client else "unknown"
    try:
        await rate_limiter.check(
            f"auth:{action}:{client_host}",
            limit=settings.AUTH_RATE_LIMIT_PER_MINUTE,
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication requests",
            headers={"Retry-After": str(exc.retry_after)},
        ) from None


def _link_verified_google_account(user: User, provider_id: str) -> None:
    """Validate an existing Google link or upgrade a legacy local account.

    Email/password login is no longer available. Older releases nevertheless
    left users as LOCAL after a successful Google login and only populated
    provider_id. Only that exact legacy subject match is upgraded: a verified
    email alone is not sufficient proof for linking an unlinked local account.
    """

    if not user.provider_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is not linked to Google",
        )
    if user.provider_id != provider_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Google account does not match the linked account",
        )
    if user.provider == AuthProvider.LOCAL:
        user.provider = AuthProvider.GOOGLE
        user.password_hash = None
    elif user.provider != AuthProvider.GOOGLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account cannot be linked to Google",
        )
    user.provider_id = provider_id


async def _find_google_account(
    db: AsyncSession,
    email: str,
    provider_id: str,
) -> User | None:
    """Resolve a returning Google user by stable subject before mutable email."""

    subject_matches = list(
        (
            await db.execute(
                select(User)
                .options(noload(User.progress))
                .where(User.provider_id == provider_id)
                .order_by(User.created_at)
                .limit(2)
                .with_for_update()
            )
        ).scalars()
    )
    if len(subject_matches) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Multiple accounts are linked to this Google identity",
        )

    subject_user = subject_matches[0] if subject_matches else None
    if subject_user is not None:
        if subject_user.email != email:
            email_owner = (
                await db.execute(
                    select(User)
                    .options(noload(User.progress))
                    .where(User.email == email)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if email_owner is not None and email_owner.id != subject_user.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="The Google email belongs to another account",
                )
            subject_user.email = email
        return subject_user

    return (
        await db.execute(
            select(User)
            .options(noload(User.progress))
            .where(User.email == email)
            .with_for_update()
        )
    ).scalar_one_or_none()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _session_identity(payload: dict) -> tuple[UUID, UUID] | None:
    try:
        return UUID(payload["sub"]), UUID(payload["sid"])
    except (KeyError, TypeError, ValueError):
        return None


def _create_session_tokens(user: User, session_id: UUID) -> tuple[str, str]:
    subject = str(user.id)
    return (
        create_access_token({"sub": subject}, session_id=str(session_id)),
        create_refresh_token({"sub": subject}, session_id=str(session_id)),
    )


async def _issue_new_session(
    response: Response,
    user: User,
    db: AsyncSession,
) -> TokenResponse:
    session_id = uuid4()
    access_token, refresh_token = _create_session_tokens(user, session_id)
    now = datetime.now(timezone.utc)
    db.add(
        AuthSession(
            id=session_id,
            user_id=user.id,
            refresh_token_hash=hash_refresh_token(refresh_token),
            expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            created_at=now,
            updated_at=now,
        )
    )
    await db.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(user=_user_response(user))


@router.post("/register", response_model=TokenResponse)
async def register() -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Email registration is disabled. Please sign in with Google.",
    )


@router.post("/login", response_model=TokenResponse)
async def login() -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Email login is disabled. Please sign in with Google.",
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(
    data: GoogleLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    enforce_cookie_origin(request)
    await _check_auth_rate_limit(request, "google")

    try:
        google_data = await verify_google_token(data.token)
    except GoogleAuthConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        ) from exc
    except GoogleProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is temporarily unavailable",
        ) from exc

    if not google_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    user = await _find_google_account(
        db,
        google_data["email"],
        google_data["sub"],
    )

    if not user:
        user = User(
            email=google_data["email"],
            full_name=google_data["name"][:255],
            avatar_url=google_data["picture"][:500] or None,
            provider=AuthProvider.GOOGLE,
            provider_id=google_data["sub"],
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # Concurrent first logins can race on either the unique email or
            # external-provider identity constraint.
            await db.rollback()
            user = await _find_google_account(
                db,
                google_data["email"],
                google_data["sub"],
            )
            if not user:
                raise
            _link_verified_google_account(user, google_data["sub"])
        else:
            await db.refresh(user)
    else:
        _link_verified_google_account(user, google_data["sub"])

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled",
        )

    user.avatar_url = google_data["picture"][:500] or user.avatar_url
    user.provider_id = google_data["sub"]
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Google account conflicts with an existing account",
        ) from exc
    await db.refresh(user)
    return await _issue_new_session(response, user, db)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse | Response:
    enforce_cookie_origin(request)
    await _check_auth_rate_limit(request, "refresh")

    refresh_token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    payload = verify_token(refresh_token or "", expected_type="refresh")
    if not payload:
        return _invalid_session_response("Invalid or expired refresh token")

    identity = _session_identity(payload)
    if identity is None:
        return _invalid_session_response("Invalid refresh token")
    user_id, session_id = identity

    now = datetime.now(timezone.utc)
    session = (
        await db.execute(
            select(AuthSession)
            .where(
                AuthSession.id == session_id,
                AuthSession.user_id == user_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        return _invalid_session_response("Invalid or expired refresh token")
    if _as_utc(session.expires_at) <= now:
        session.revoked_at = now
        await db.commit()
        return _invalid_session_response("Invalid or expired refresh token")

    token_hash = hash_refresh_token(refresh_token)
    matches_current = hmac.compare_digest(token_hash, session.refresh_token_hash)
    previous_deadline = (
        _as_utc(session.previous_valid_until)
        if session.previous_valid_until is not None
        else None
    )
    matches_previous = bool(
        session.previous_refresh_token_hash
        and previous_deadline is not None
        and previous_deadline >= now
        and hmac.compare_digest(
            token_hash,
            session.previous_refresh_token_hash,
        )
    )
    if not matches_current and not matches_previous:
        # A used/unknown refresh credential indicates replay. Revoking the
        # family also invalidates access tokens carrying this session id.
        session.revoked_at = now
        session.previous_refresh_token_hash = None
        session.previous_valid_until = None
        await db.commit()
        return _invalid_session_response("Refresh token reuse detected")

    result = await db.execute(
        select(User).options(noload(User.progress)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        session.revoked_at = now
        await db.commit()
        return _invalid_session_response("User not found or inactive")

    if matches_previous:
        # A second tab can submit the just-rotated token. Issue only a fresh
        # access cookie so it cannot overwrite the current shared refresh cookie.
        user_response = _user_response(user)
        access_token = create_access_token(
            {"sub": str(user.id)},
            session_id=str(session.id),
        )
        await db.rollback()
        _set_access_cookie(response, access_token)
        return TokenResponse(user=user_response)

    access_token, new_refresh_token = _create_session_tokens(user, session.id)
    session.previous_refresh_token_hash = session.refresh_token_hash
    session.previous_valid_until = now + timedelta(
        seconds=settings.REFRESH_REUSE_GRACE_SECONDS
    )
    session.refresh_token_hash = hash_refresh_token(new_refresh_token)
    session.expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session.updated_at = now
    await db.commit()
    _set_auth_cookies(response, access_token, new_refresh_token)
    return TokenResponse(user=_user_response(user))


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    enforce_cookie_origin(request)
    identities: set[tuple[UUID, UUID]] = set()
    for cookie_name, expected_type in (
        (settings.ACCESS_COOKIE_NAME, "access"),
        (settings.REFRESH_COOKIE_NAME, "refresh"),
    ):
        token = request.cookies.get(cookie_name)
        payload = verify_token(token or "", expected_type=expected_type)
        if payload:
            identity = _session_identity(payload)
            if identity is not None:
                identities.add(identity)

    now = datetime.now(timezone.utc)
    for user_id, session_id in identities:
        session = (
            await db.execute(
                select(AuthSession)
                .where(
                    AuthSession.id == session_id,
                    AuthSession.user_id == user_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if session is not None and session.revoked_at is None:
            session.revoked_at = now
    if identities:
        await db.commit()
    _clear_auth_cookies(response)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(response: Response, user: User = Depends(get_current_user)) -> UserResponse:
    _set_no_store(response)
    return _user_response(user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.commit()
    await db.refresh(user)
    _set_no_store(response)
    return _user_response(user)
