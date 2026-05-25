from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.topic import Topic
from app.models.conversation import Conversation
from app.schemas.topic import TopicResponse

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("", response_model=list[TopicResponse])
async def get_topics(
    level: str = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(Topic).where(Topic.is_published == True).order_by(Topic.sort_order)
    )
    if level:
        query = query.where(Topic.level == level)

    result = await db.execute(query)
    topics = result.scalars().all()

    response = []
    for topic in topics:
        conv_count = await db.execute(
            select(func.count(Conversation.id)).where(
                Conversation.topic_id == topic.id,
                Conversation.is_published == True,
            )
        )
        count = conv_count.scalar()
        response.append(
            TopicResponse(
                id=topic.id,
                title=topic.title,
                description=topic.description,
                icon=topic.icon,
                level=topic.level.value,
                sort_order=topic.sort_order,
                is_published=topic.is_published,
                created_at=topic.created_at,
                conversation_count=count,
            )
        )

    return response


@router.get("/{topic_id}")
async def get_topic(
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Topic).where(Topic.id == topic_id, Topic.is_published == True)
    )
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    conv_result = await db.execute(
        select(Conversation)
        .where(
            Conversation.topic_id == topic_id,
            Conversation.is_published == True,
        )
        .order_by(Conversation.sort_order)
    )
    conversations = conv_result.scalars().all()

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
                "id": c.id,
                "title": c.title,
                "description": c.description,
                "situation": c.situation,
                "role_a_name": c.role_a_name,
                "role_b_name": c.role_b_name,
                "level": c.level.value,
                "line_count": len(c.lines),
            }
            for c in conversations
        ],
    }
