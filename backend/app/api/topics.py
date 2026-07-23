from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.conversation import Conversation, ConversationLine, Speaker
from app.models.topic import Level, Topic
from app.models.user import User
from app.schemas.topic import TopicResponse

router = APIRouter(prefix="/api/topics", tags=["topics"])


def _has_role_line(role: Speaker):
    return exists(
        select(ConversationLine.id).where(
            ConversationLine.conversation_id == Conversation.id,
            ConversationLine.speaker == role,
        )
    )


@router.get("", response_model=list[TopicResponse])
async def get_topics(
    level: Level | None = None,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    conversation_count = (
        select(func.count(Conversation.id))
        .where(
            Conversation.topic_id == Topic.id,
            Conversation.is_published.is_(True),
            _has_role_line(Speaker.A),
            _has_role_line(Speaker.B),
        )
        .correlate(Topic)
        .scalar_subquery()
    )
    query = (
        select(Topic, conversation_count.label("conversation_count"))
        .where(Topic.is_published.is_(True))
        .order_by(Topic.sort_order, Topic.created_at)
        .offset(offset)
        .limit(limit)
    )
    if level is not None:
        query = query.where(Topic.level == level)

    rows = (await db.execute(query)).all()
    return [
        TopicResponse(
            id=topic.id,
            title=topic.title,
            description=topic.description,
            icon=topic.icon,
            level=topic.level.value,
            sort_order=topic.sort_order,
            is_published=topic.is_published,
            created_at=topic.created_at,
            conversation_count=int(count or 0),
        )
        for topic, count in rows
    ]


@router.get("/{topic_id}")
async def get_topic(
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    topic = (
        await db.execute(
            select(Topic).where(
                Topic.id == topic_id,
                Topic.is_published.is_(True),
            )
        )
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    line_count = (
        select(func.count(ConversationLine.id))
        .where(ConversationLine.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )
    rows = (
        await db.execute(
            select(Conversation, line_count.label("line_count"))
            .where(
                Conversation.topic_id == topic_id,
                Conversation.is_published.is_(True),
                _has_role_line(Speaker.A),
                _has_role_line(Speaker.B),
            )
            .order_by(Conversation.sort_order, Conversation.created_at)
        )
    ).all()

    return {
        "topic": {
            "id": topic.id,
            "title": topic.title,
            "description": topic.description,
            "icon": topic.icon,
            "level": topic.level.value,
            "sort_order": topic.sort_order,
            "is_published": topic.is_published,
            "created_at": topic.created_at,
        },
        "conversations": [
            {
                "id": conversation.id,
                "title": conversation.title,
                "description": conversation.description,
                "situation": conversation.situation,
                "role_a_name": conversation.role_a_name,
                "role_b_name": conversation.role_b_name,
                "level": conversation.level.value,
                "line_count": int(count),
            }
            for conversation, count in rows
        ],
    }
