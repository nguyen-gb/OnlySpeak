from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from app.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.topic import Topic
from app.models.conversation import Conversation, ConversationLine
from app.models.progress import UserProgress
from app.schemas.topic import TopicCreate, TopicUpdate
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationLineCreate,
    ConversationLineUpdate,
)
from app.services.tts_service import generate_conversation_audio

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============ DASHBOARD STATS ============


@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    users_count = (await db.execute(select(func.count(User.id)))).scalar()
    topics_count = (await db.execute(select(func.count(Topic.id)))).scalar()
    conversations_count = (
        await db.execute(select(func.count(Conversation.id)))
    ).scalar()
    practices_count = (
        await db.execute(select(func.count(UserProgress.id)))
    ).scalar()

    return {
        "users": users_count,
        "topics": topics_count,
        "conversations": conversations_count,
        "total_practices": practices_count,
    }


# ============ TOPICS ============


@router.get("/topics")
async def list_topics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(Topic).order_by(Topic.sort_order))
    topics = result.scalars().all()

    response = []
    for topic in topics:
        conv_count = await db.execute(
            select(func.count(Conversation.id)).where(
                Conversation.topic_id == topic.id
            )
        )
        response.append(
            {
                "id": topic.id,
                "title": topic.title,
                "description": topic.description,
                "icon": topic.icon,
                "level": topic.level.value,
                "sort_order": topic.sort_order,
                "is_published": topic.is_published,
                "created_at": topic.created_at,
                "conversation_count": conv_count.scalar(),
            }
        )

    return response


@router.post("/topics")
async def create_topic(
    data: TopicCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    topic = Topic(**data.model_dump())
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return {"id": topic.id, "message": "Topic created"}


@router.put("/topics/{topic_id}")
async def update_topic(
    topic_id: UUID,
    data: TopicUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(topic, key, value)
    await db.commit()
    return {"message": "Topic updated"}


@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    await db.delete(topic)
    await db.commit()
    return {"message": "Topic deleted"}


# ============ CONVERSATIONS ============


@router.get("/conversations")
async def list_conversations(
    topic_id: UUID = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    query = select(Conversation).order_by(Conversation.sort_order)
    if topic_id:
        query = query.where(Conversation.topic_id == topic_id)

    result = await db.execute(query)
    conversations = result.scalars().all()

    return [
        {
            "id": c.id,
            "topic_id": c.topic_id,
            "title": c.title,
            "description": c.description,
            "role_a_name": c.role_a_name,
            "role_b_name": c.role_b_name,
            "level": c.level.value,
            "sort_order": c.sort_order,
            "is_published": c.is_published,
            "line_count": len(c.lines),
            "created_at": c.created_at,
        }
        for c in conversations
    ]


@router.get("/conversations/{conv_id}")
async def get_conversation(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    lines_result = await db.execute(
        select(ConversationLine)
        .where(ConversationLine.conversation_id == conv_id)
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
        "sort_order": conversation.sort_order,
        "is_published": conversation.is_published,
        "created_at": conversation.created_at,
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


@router.post("/conversations")
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    conversation = Conversation(
        topic_id=data.topic_id,
        title=data.title,
        description=data.description,
        situation=data.situation,
        role_a_name=data.role_a_name,
        role_b_name=data.role_b_name,
        level=data.level,
        sort_order=data.sort_order,
        is_published=data.is_published,
    )
    db.add(conversation)
    await db.flush()

    for line_data in data.lines:
        line = ConversationLine(
            conversation_id=conversation.id,
            speaker=line_data.speaker,
            line_order=line_data.line_order,
            text_en=line_data.text_en,
            pronunciation_hint=line_data.pronunciation_hint,
        )
        db.add(line)

    await db.commit()
    await db.refresh(conversation)
    return {"id": conversation.id, "message": "Conversation created"}


@router.put("/conversations/{conv_id}")
async def update_conversation(
    conv_id: UUID,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(conversation, key, value)
    await db.commit()
    return {"message": "Conversation updated"}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conversation)
    await db.commit()
    return {"message": "Conversation deleted"}


# ============ CONVERSATION LINES ============


@router.post("/conversations/{conv_id}/lines")
async def add_line(
    conv_id: UUID,
    data: ConversationLineCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    line = ConversationLine(
        conversation_id=conv_id,
        speaker=data.speaker,
        line_order=data.line_order,
        text_en=data.text_en,
        pronunciation_hint=data.pronunciation_hint,
    )
    db.add(line)
    await db.commit()
    await db.refresh(line)
    return {"id": line.id, "message": "Line added"}


@router.put("/lines/{line_id}")
async def update_line(
    line_id: UUID,
    data: ConversationLineUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(ConversationLine).where(ConversationLine.id == line_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(line, key, value)
    await db.commit()
    return {"message": "Line updated"}


@router.delete("/lines/{line_id}")
async def delete_line(
    line_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(ConversationLine).where(ConversationLine.id == line_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")

    await db.delete(line)
    await db.commit()
    return {"message": "Line deleted"}


# ============ GENERATE AUDIO ============


@router.post("/conversations/{conv_id}/generate-audio")
async def gen_audio(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(
        select(ConversationLine)
        .where(ConversationLine.conversation_id == conv_id)
        .order_by(ConversationLine.line_order)
    )
    lines = result.scalars().all()

    if not lines:
        raise HTTPException(
            status_code=400, detail="No lines to generate audio for"
        )

    audio_results = await generate_conversation_audio(lines)

    for audio in audio_results:
        line_result = await db.execute(
            select(ConversationLine).where(
                ConversationLine.id == audio["line_id"]
            )
        )
        line = line_result.scalar_one()
        line.audio_url = audio["audio_url"]

    await db.commit()
    return {"message": f"Generated audio for {len(lines)} lines"}


# ============ USERS MANAGEMENT ============


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "provider": u.provider.value,
            "is_active": u.is_active,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = not user.is_active
    await db.commit()
    return {"message": f"User {'activated' if user.is_active else 'deactivated'}"}
