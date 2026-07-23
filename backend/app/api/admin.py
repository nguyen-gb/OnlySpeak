from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_admin_user
from app.database import get_db
from app.models.conversation import Conversation, ConversationLine, Speaker
from app.models.progress import UserProgress
from app.models.topic import Level, Topic
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationLineCreate,
    ConversationLineUpdate,
    ConversationUpdate,
)
from app.schemas.topic import TopicCreate, TopicUpdate
from app.services.tts_service import (
    TTSServiceError,
    generate_conversation_audio,
    remove_generated_audio,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def _commit_or_conflict(
    db: AsyncSession,
    detail: str,
) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        ) from exc


async def _conversation_speakers(
    db: AsyncSession,
    conversation_id: UUID,
    *,
    excluding_line_id: UUID | None = None,
) -> list[Speaker]:
    query = select(ConversationLine.speaker).where(
        ConversationLine.conversation_id == conversation_id
    )
    if excluding_line_id is not None:
        query = query.where(ConversationLine.id != excluding_line_id)
    return list((await db.execute(query)).scalars())


async def _ensure_practice_ready(
    db: AsyncSession,
    conversation_id: UUID,
) -> None:
    speakers = set(await _conversation_speakers(db, conversation_id))
    if speakers != {Speaker.A, Speaker.B}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A published conversation must contain at least one line for each role",
        )


async def _locked_conversation(
    db: AsyncSession,
    conversation_id: UUID,
) -> Conversation | None:
    """Serialize mutations that can affect a conversation's invariants."""

    return (
        await db.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    users_count = await db.scalar(select(func.count(User.id)))
    topics_count = await db.scalar(select(func.count(Topic.id)))
    conversations_count = await db.scalar(select(func.count(Conversation.id)))
    practices_count = await db.scalar(
        select(func.coalesce(func.sum(UserProgress.practice_count), 0))
    )
    return {
        "users": int(users_count or 0),
        "topics": int(topics_count or 0),
        "conversations": int(conversations_count or 0),
        "total_practices": int(practices_count or 0),
    }


@router.get("/topics")
async def list_topics(
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation_count = (
        select(func.count(Conversation.id))
        .where(Conversation.topic_id == Topic.id)
        .correlate(Topic)
        .scalar_subquery()
    )
    rows = (
        await db.execute(
            select(Topic, conversation_count.label("conversation_count"))
            .order_by(Topic.sort_order, Topic.created_at)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    total = await db.scalar(select(func.count(Topic.id)))
    items = [
        {
            "id": topic.id,
            "title": topic.title,
            "description": topic.description,
            "icon": topic.icon,
            "level": topic.level.value,
            "sort_order": topic.sort_order,
            "is_published": topic.is_published,
            "created_at": topic.created_at,
            "conversation_count": int(count or 0),
        }
        for topic, count in rows
    ]
    return {
        "items": items,
        "total": int(total or 0),
        "limit": limit,
        "offset": offset,
    }


@router.post("/topics", status_code=status.HTTP_201_CREATED)
async def create_topic(
    data: TopicCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    values = data.model_dump()
    values["level"] = Level(values["level"])
    topic = Topic(**values)
    db.add(topic)
    await _commit_or_conflict(db, "Topic conflicts with an existing record")
    await db.refresh(topic)
    return {"id": topic.id, "message": "Topic created"}


@router.put("/topics/{topic_id}")
async def update_topic(
    topic_id: UUID,
    data: TopicUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    topic = (
        await db.execute(select(Topic).where(Topic.id == topic_id))
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    values = data.model_dump(exclude_unset=True)
    if "level" in values:
        values["level"] = Level(values["level"])
    for key, value in values.items():
        setattr(topic, key, value)
    await _commit_or_conflict(db, "Topic update conflicts with existing data")
    return {"message": "Topic updated"}


@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    topic = (
        await db.execute(select(Topic).where(Topic.id == topic_id))
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    audio_urls = list(
        (
            await db.execute(
                select(ConversationLine.audio_url)
                .join(
                    Conversation,
                    ConversationLine.conversation_id == Conversation.id,
                )
                .where(
                    Conversation.topic_id == topic_id,
                    ConversationLine.audio_url.isnot(None),
                )
            )
        ).scalars()
    )
    await db.delete(topic)
    await db.commit()
    for audio_url in audio_urls:
        remove_generated_audio(audio_url)
    return {"message": "Topic deleted"}


@router.get("/conversations")
async def list_conversations(
    topic_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    line_count = (
        select(func.count(ConversationLine.id))
        .where(ConversationLine.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )
    base_filter = []
    if topic_id is not None:
        base_filter.append(Conversation.topic_id == topic_id)
    query = (
        select(Conversation, line_count.label("line_count"))
        .where(*base_filter)
        .order_by(Conversation.sort_order, Conversation.created_at)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(query)).all()
    total = await db.scalar(
        select(func.count(Conversation.id)).where(*base_filter)
    )
    items = [
        {
            "id": conversation.id,
            "topic_id": conversation.topic_id,
            "title": conversation.title,
            "description": conversation.description,
            "role_a_name": conversation.role_a_name,
            "role_b_name": conversation.role_b_name,
            "level": conversation.level.value,
            "sort_order": conversation.sort_order,
            "is_published": conversation.is_published,
            "line_count": int(count or 0),
            "created_at": conversation.created_at,
        }
        for conversation, count in rows
    ]
    return {
        "items": items,
        "total": int(total or 0),
        "limit": limit,
        "offset": offset,
    }


@router.get("/conversations/{conv_id}")
async def get_conversation(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation = (
        await db.execute(select(Conversation).where(Conversation.id == conv_id))
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    lines = list(
        (
            await db.execute(
                select(ConversationLine)
                .where(ConversationLine.conversation_id == conv_id)
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


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    topic_exists = await db.scalar(
        select(Topic.id).where(Topic.id == data.topic_id)
    )
    if topic_exists is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    conversation = Conversation(
        topic_id=data.topic_id,
        title=data.title,
        description=data.description,
        situation=data.situation,
        role_a_name=data.role_a_name,
        role_b_name=data.role_b_name,
        level=Level(data.level),
        sort_order=data.sort_order,
        is_published=data.is_published,
    )
    db.add(conversation)
    await db.flush()
    db.add_all(
        [
            ConversationLine(
                conversation_id=conversation.id,
                speaker=Speaker(line_data.speaker),
                line_order=line_data.line_order,
                text_en=line_data.text_en,
                pronunciation_hint=line_data.pronunciation_hint,
            )
            for line_data in data.lines
        ]
    )
    await _commit_or_conflict(
        db,
        "Conversation line_order values must be unique",
    )
    return {"id": conversation.id, "message": "Conversation created"}


@router.put("/conversations/{conv_id}")
async def update_conversation(
    conv_id: UUID,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation = await _locked_conversation(db, conv_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    values = data.model_dump(exclude_unset=True)
    if values.get("is_published") is True and not conversation.is_published:
        await _ensure_practice_ready(db, conv_id)
    if "level" in values:
        values["level"] = Level(values["level"])
    for key, value in values.items():
        setattr(conversation, key, value)
    await _commit_or_conflict(db, "Conversation update conflicts with existing data")
    return {"message": "Conversation updated"}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation = await _locked_conversation(db, conv_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    audio_urls = list(
        (
            await db.execute(
                select(ConversationLine.audio_url).where(
                    ConversationLine.conversation_id == conv_id,
                    ConversationLine.audio_url.isnot(None),
                )
            )
        ).scalars()
    )
    await db.delete(conversation)
    await db.commit()
    for audio_url in audio_urls:
        remove_generated_audio(audio_url)
    return {"message": "Conversation deleted"}


@router.post(
    "/conversations/{conv_id}/lines",
    status_code=status.HTTP_201_CREATED,
)
async def add_line(
    conv_id: UUID,
    data: ConversationLineCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation = await _locked_conversation(db, conv_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    current_line_count = await db.scalar(
        select(func.count(ConversationLine.id)).where(
            ConversationLine.conversation_id == conv_id
        )
    )
    if int(current_line_count or 0) >= 200:
        raise HTTPException(
            status_code=422,
            detail="A conversation is limited to 200 lines",
        )
    line = ConversationLine(
        conversation_id=conv_id,
        speaker=Speaker(data.speaker),
        line_order=data.line_order,
        text_en=data.text_en,
        pronunciation_hint=data.pronunciation_hint,
    )
    db.add(line)
    await _commit_or_conflict(
        db,
        "line_order must be unique within a conversation",
    )
    await db.refresh(line)
    return {"id": line.id, "message": "Line added"}


@router.put("/lines/{line_id}")
async def update_line(
    line_id: UUID,
    data: ConversationLineUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation_id = await db.scalar(
        select(ConversationLine.conversation_id).where(
            ConversationLine.id == line_id
        )
    )
    if conversation_id is None:
        raise HTTPException(status_code=404, detail="Line not found")
    conversation = await _locked_conversation(db, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    line = (
        await db.execute(
            select(ConversationLine)
            .where(
                ConversationLine.id == line_id,
                ConversationLine.conversation_id == conversation.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=404, detail="Line not found")
    values = data.model_dump(exclude_unset=True)
    if conversation.is_published and "speaker" in values:
        remaining = await _conversation_speakers(
            db,
            conversation.id,
            excluding_line_id=line.id,
        )
        remaining.append(Speaker(values["speaker"]))
        if set(remaining) != {Speaker.A, Speaker.B}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unpublish the conversation before removing its last line for a role",
            )
    next_speaker = (
        Speaker(values["speaker"]) if "speaker" in values else line.speaker
    )
    content_changed = (
        ("text_en" in values and values["text_en"] != line.text_en)
        or next_speaker != line.speaker
    )
    stale_audio_url = line.audio_url if content_changed else None
    if "speaker" in values:
        values["speaker"] = next_speaker
    for key, value in values.items():
        setattr(line, key, value)
    if content_changed:
        line.audio_url = None
    await _commit_or_conflict(
        db,
        "line_order must be unique within a conversation",
    )
    remove_generated_audio(stale_audio_url)
    return {"message": "Line updated"}


@router.delete("/lines/{line_id}")
async def delete_line(
    line_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation_id = await db.scalar(
        select(ConversationLine.conversation_id).where(
            ConversationLine.id == line_id
        )
    )
    if conversation_id is None:
        raise HTTPException(status_code=404, detail="Line not found")
    conversation = await _locked_conversation(db, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    line = (
        await db.execute(
            select(ConversationLine)
            .where(
                ConversationLine.id == line_id,
                ConversationLine.conversation_id == conversation.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=404, detail="Line not found")
    if conversation.is_published:
        remaining = await _conversation_speakers(
            db,
            conversation.id,
            excluding_line_id=line.id,
        )
        if set(remaining) != {Speaker.A, Speaker.B}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unpublish the conversation before removing its last line for a role",
            )
    stale_audio_url = line.audio_url
    await db.delete(line)
    await db.commit()
    remove_generated_audio(stale_audio_url)
    return {"message": "Line deleted"}


@router.post("/conversations/{conv_id}/generate-audio")
async def gen_audio(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    conversation_exists = await db.scalar(
        select(Conversation.id).where(Conversation.id == conv_id)
    )
    if conversation_exists is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    lines = list(
        (
            await db.execute(
                select(ConversationLine)
                .where(ConversationLine.conversation_id == conv_id)
                .order_by(ConversationLine.line_order)
            )
        ).scalars()
    )
    if not lines:
        raise HTTPException(status_code=400, detail="No lines to generate audio for")

    # Copy the provider inputs and release the transaction/connection while the
    # network-bound TTS work runs.
    snapshots = [
        SimpleNamespace(
            id=line.id,
            conversation_id=line.conversation_id,
            speaker=line.speaker,
            line_order=line.line_order,
            text_en=line.text_en,
            audio_url=line.audio_url,
        )
        for line in lines
    ]
    snapshots_by_id = {snapshot.id: snapshot for snapshot in snapshots}
    await db.rollback()
    try:
        audio_results = await generate_conversation_audio(snapshots)
    except TTSServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    successful = {
        result["line_id"]: result["audio_url"]
        for result in audio_results
        if result.get("audio_url")
    }
    applied_ids: set[UUID] = set()
    replaced_audio_urls: dict[UUID, str] = {}
    if successful:
        try:
            # Use the same lock order as line mutations: conversation first,
            # then line rows. This prevents stale TTS generated from an old
            # snapshot being committed after an editor changes the text.
            locked_conversation = await _locked_conversation(db, conv_id)
            saved_lines = []
            if locked_conversation is not None:
                saved_lines = list(
                    (
                        await db.execute(
                            select(ConversationLine)
                            .where(
                                ConversationLine.conversation_id == conv_id,
                                ConversationLine.id.in_(successful),
                            )
                            .with_for_update()
                        )
                    ).scalars()
                )
            for line in saved_lines:
                snapshot = snapshots_by_id[line.id]
                if (
                    line.text_en == snapshot.text_en
                    and line.speaker == snapshot.speaker
                ):
                    if line.audio_url and line.audio_url != successful[line.id]:
                        replaced_audio_urls[line.id] = line.audio_url
                    line.audio_url = successful[line.id]
                    applied_ids.add(line.id)
            await db.commit()
        except Exception:
            await db.rollback()
            # Files whose URL was already referenced before this batch must be
            # retained; newly generated versions are safe to discard here.
            for line_id, audio_url in successful.items():
                if snapshots_by_id[line_id].audio_url != audio_url:
                    remove_generated_audio(str(audio_url))
            raise

    for line_id, audio_url in successful.items():
        if line_id not in applied_ids:
            remove_generated_audio(str(audio_url))
        else:
            remove_generated_audio(replaced_audio_urls.get(line_id))

    generated_count = len(applied_ids)
    failed_ids = [
        str(snapshot.id) for snapshot in snapshots if snapshot.id not in applied_ids
    ]
    return {
        "message": f"Generated audio for {generated_count} of {len(snapshots)} lines",
        "generated_count": generated_count,
        "failed_count": len(failed_ids),
        "failed_line_ids": failed_ids,
    }


@router.get("/users")
async def list_users(
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    del admin
    users = list(
        (
            await db.execute(
                select(User)
                .order_by(User.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
        ).scalars()
    )
    total = await db.scalar(select(func.count(User.id)))
    items = [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "provider": user.provider.value,
            "is_active": user.is_active,
            "created_at": user.created_at,
        }
        for user in users
    ]
    return {
        "items": items,
        "total": int(total or 0),
        "limit": limit,
        "offset": offset,
    }


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Administrators cannot deactivate their own account",
        )
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"message": f"User {'activated' if user.is_active else 'deactivated'}"}
