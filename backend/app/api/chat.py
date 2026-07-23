from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.chat import FreeTalkRequest, FreeTalkResponse
from app.services.ai_service import (
    AIConfigurationError,
    AIContentBlockedError,
    AIProviderError,
    AIProviderTimeoutError,
    AIResponseError,
    ai_service,
)
from app.services.rate_limit import RateLimitExceeded, rate_limiter


router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/free-talk", response_model=FreeTalkResponse)
async def free_talk(
    data: FreeTalkRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FreeTalkResponse:
    try:
        await rate_limiter.check(
            f"chat:{user.id}",
            limit=settings.CHAT_RATE_LIMIT_PER_MINUTE,
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many Free Talk requests",
            headers={"Retry-After": str(exc.retry_after)},
        ) from None

    result = await db.execute(
        select(
            Conversation.title,
            Conversation.situation,
            Conversation.role_a_name,
            Conversation.role_b_name,
        ).where(
            Conversation.id == data.conversation_id,
            Conversation.is_published.is_(True),
        )
    )
    conversation = result.one_or_none()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    situation = conversation.situation or conversation.title
    partner_role = (
        conversation.role_a_name
        if data.role_played == "B"
        else conversation.role_b_name
    )
    # The provider call can take seconds. End the read transaction first so it
    # does not occupy a database connection while waiting on the network.
    await db.rollback()

    try:
        return await ai_service.get_free_talk_response(
            data.user_input,
            [message.model_dump() for message in data.history],
            situation,
            partner_role,
        )
    except AIConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Free Talk is not configured",
        ) from exc
    except AIContentBlockedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This message could not be processed by the AI safety filters",
        ) from exc
    except AIProviderTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI provider timed out",
        ) from exc
    except AIResponseError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned an invalid response",
        ) from exc
    except AIProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider is temporarily unavailable",
        ) from exc
