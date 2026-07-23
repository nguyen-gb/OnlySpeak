from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.conversation import Conversation, ConversationLine, Speaker
from app.models.topic import Topic
from app.models.user import User

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    has_role_a = exists(
        select(ConversationLine.id).where(
            ConversationLine.conversation_id == Conversation.id,
            ConversationLine.speaker == Speaker.A,
        )
    )
    has_role_b = exists(
        select(ConversationLine.id).where(
            ConversationLine.conversation_id == Conversation.id,
            ConversationLine.speaker == Speaker.B,
        )
    )
    conversation = (
        await db.execute(
            select(Conversation)
            .join(Topic, Topic.id == Conversation.topic_id)
            .where(
                Conversation.id == conversation_id,
                Conversation.is_published.is_(True),
                Topic.is_published.is_(True),
                has_role_a,
                has_role_b,
            )
        )
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    lines = list(
        (
            await db.execute(
                select(ConversationLine)
                .where(ConversationLine.conversation_id == conversation_id)
                .order_by(ConversationLine.line_order)
            )
        ).scalars()
    )
    return {
        "id": conversation.id,
        "topic_id": conversation.topic_id,
        "title": conversation.title,
        "description": conversation.description,
        "situation": conversation.situation,
        "role_a_name": conversation.role_a_name,
        "role_b_name": conversation.role_b_name,
        "level": conversation.level.value,
        "lines": [
            {
                "id": line.id,
                "speaker": line.speaker.value,
                "line_order": line.line_order,
                "text_en": line.text_en,
                "pronunciation_hint": line.pronunciation_hint,
                "audio_url": line.audio_url,
            }
            for line in lines
        ],
    }
