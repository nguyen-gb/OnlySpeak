from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, AuthProvider
from app.schemas.user import (
    GoogleLogin,
    TokenResponse,
    UserResponse,
    UserUpdate,
)
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    verify_token,
    verify_google_token,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        role=user.role.value,
        provider=user.provider.value,
        is_active=user.is_active,
        streak_count=user.streak_count,
        total_xp=user.total_xp,
        daily_goal_count=user.daily_goal_count,
        created_at=user.created_at,
    )


@router.post("/register", response_model=TokenResponse)
async def register():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Email registration is disabled. Please sign in with Google.",
    )


@router.post("/login", response_model=TokenResponse)
async def login():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Email login is disabled. Please sign in with Google.",
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleLogin, db: AsyncSession = Depends(get_db)):
    google_data = await verify_google_token(data.token)
    if not google_data:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    result = await db.execute(
        select(User).where(User.email == google_data["email"])
    )
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=google_data["email"],
            full_name=google_data["name"],
            avatar_url=google_data.get("picture"),
            provider=AuthProvider.GOOGLE,
            provider_id=google_data["sub"],
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    else:
        user.avatar_url = google_data.get("picture") or user.avatar_url
        user.provider_id = user.provider_id or google_data["sub"]
        await db.commit()
        await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        user=_user_response(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    payload = verify_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        user=_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return _user_response(user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.commit()
    await db.refresh(user)
    return _user_response(user)
