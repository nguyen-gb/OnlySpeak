from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationLine

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.is_published == True,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    lines_result = await db.execute(
        select(ConversationLine)
        .where(ConversationLine.conversation_id == conversation_id)
        .order_by(ConversationLine.line_order)
    )
    lines = lines_result.scalars().all()

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
