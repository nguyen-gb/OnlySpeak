import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
import runpy
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi import Response
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from app.api.auth import refresh
from app.api.admin import (
    delete_line,
    list_conversations,
    list_topics,
    list_users,
    update_conversation,
)
from app.api.conversations import get_conversation as get_public_conversation
from app.api.progress import (
    _calculate_srs,
    get_progress,
    get_review_list,
    get_stats,
    save_progress,
)
from app.database import Base, configure_sqlite_engine
from app.models import (
    Conversation,
    ConversationLine,
    Level,
    PracticeAttempt,
    Speaker,
    Topic,
    User,
    UserProgress,
    AuthSession,
)
from app.schemas.conversation import ConversationCreate, ConversationUpdate
from app.schemas.progress import ProgressCreate
from app.config import settings
from app.services.auth_service import create_refresh_token, hash_refresh_token


def test_strict_payload_validation_and_publish_shape():
    with pytest.raises(ValidationError):
        ProgressCreate(
            attempt_id=uuid4(),
            conversation_id=uuid4(),
            role_played="A",
            completed_lines=2,
            total_lines=1,
        )
    with pytest.raises(ValidationError):
        ProgressCreate(
            attempt_id=uuid4(),
            conversation_id=uuid4(),
            role_played="A",
            completed_lines=1,
            total_lines=1,
            is_completed=True,
            pronunciation_score=float("nan"),
        )
    with pytest.raises(ValidationError):
        ProgressCreate(
            attempt_id=uuid4(),
            conversation_id=uuid4(),
            role_played="A",
            completed_lines=0,
            total_lines=1,
            unexpected=True,
        )
    with pytest.raises(ValidationError):
        ConversationCreate(
            topic_id=uuid4(),
            title="Empty published conversation",
            is_published=True,
            lines=[],
        )


def test_sm2_repetitions_and_failed_recall_reduce_ease():
    interval, ease, repetitions = _calculate_srs(95, 0, 2.5, 0)
    assert (interval, repetitions) == (1.0, 1)
    interval, ease, repetitions = _calculate_srs(95, interval, ease, repetitions)
    assert (interval, repetitions) == (6.0, 2)
    interval, reduced_ease, repetitions = _calculate_srs(
        20, interval, ease, repetitions
    )
    assert interval == 1.0
    assert repetitions == 0
    assert 1.3 <= reduced_ease < ease


async def _new_database():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    configure_sqlite_engine(engine)
    sessions = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, sessions


async def _curriculum(db, *, published=True):
    user = User(email=f"{uuid4()}@example.com", full_name="Domain Test")
    admin = User(email=f"{uuid4()}@example.com", full_name="Admin Test")
    topic = Topic(
        title=f"Topic {uuid4()}",
        level=Level.BEGINNER,
        is_published=published,
    )
    db.add_all([user, admin, topic])
    await db.flush()
    conversation = Conversation(
        topic_id=topic.id,
        title="A complete conversation",
        level=Level.BEGINNER,
        is_published=published,
    )
    db.add(conversation)
    await db.flush()
    line_a = ConversationLine(
        conversation_id=conversation.id,
        speaker=Speaker.A,
        line_order=1,
        text_en="Hello",
    )
    line_b = ConversationLine(
        conversation_id=conversation.id,
        speaker=Speaker.B,
        line_order=2,
        text_en="Hi",
    )
    db.add_all([line_a, line_b])
    await db.commit()
    return user, admin, topic, conversation, line_a, line_b


def test_progress_is_idempotent_and_incomplete_attempts_do_not_reward():
    async def scenario():
        engine, sessions = await _new_database()
        try:
            async with sessions() as db:
                user, _, _, conversation, _, _ = await _curriculum(db)
                attempt_id = uuid4()
                completed = ProgressCreate(
                    attempt_id=attempt_id,
                    conversation_id=conversation.id,
                    role_played="A",
                    completed_lines=1,
                    total_lines=1,
                    is_completed=True,
                    pronunciation_score=92,
                    practice_mode=1,
                    response_times=[1.2],
                )
                first = await save_progress(completed, db, user)
                duplicate = await save_progress(completed, db, user)
                assert first.xp_gained == 32
                assert first.was_duplicate is False
                assert duplicate.xp_gained == 0
                assert duplicate.was_duplicate is True
                assert user.total_xp == 32
                assert await db.scalar(select(func.count(PracticeAttempt.id))) == 1

                with pytest.raises(HTTPException) as reused:
                    await save_progress(
                        completed.model_copy(update={"pronunciation_score": 91}),
                        db,
                        user,
                    )
                assert reused.value.status_code == 409

                incomplete = ProgressCreate(
                    attempt_id=uuid4(),
                    conversation_id=conversation.id,
                    role_played="B",
                    completed_lines=0,
                    total_lines=1,
                    is_completed=False,
                    practice_mode=1,
                    response_times=[],
                )
                partial_response = await save_progress(incomplete, db, user)
                assert partial_response.xp_gained == 0
                assert user.total_xp == 32

                aggregates = list(
                    (
                        await db.execute(
                            select(UserProgress).order_by(UserProgress.role_played)
                        )
                    ).scalars()
                )
                by_role = {item.role_played.value: item for item in aggregates}
                assert by_role["A"].practice_count == 1
                assert by_role["A"].srs_repetitions == 1
                assert by_role["B"].practice_count == 0
                assert by_role["B"].next_review_at is None

                stats = await get_stats(db, user)
                assert stats.total_practiced == 1
                assert stats.total_completed == 1
                assert stats.average_score == 92
                history_response = Response()
                history = await get_progress(
                    history_response, 50, 0, db, user
                )
                assert len(history) == 2
                assert history_response.headers["x-total-count"] == "2"
                assert history[0].is_completed is False

                forged = completed.model_copy(
                    update={"attempt_id": uuid4(), "total_lines": 2, "completed_lines": 2}
                )
                with pytest.raises(HTTPException) as invalid_count:
                    await save_progress(forged, db, user)
                assert invalid_count.value.status_code == 422
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_public_and_admin_endpoints_enforce_practice_ready_conversations():
    async def scenario():
        engine, sessions = await _new_database()
        try:
            async with sessions() as db:
                user, admin, topic, conversation, _, line_b = await _curriculum(db)
                await db.delete(line_b)
                conversation.is_published = False
                await db.commit()

                with pytest.raises(HTTPException) as publish_error:
                    await update_conversation(
                        conversation.id,
                        ConversationUpdate(is_published=True),
                        db,
                        admin,
                    )
                assert publish_error.value.status_code == 409

                conversation.is_published = True
                await db.commit()
                with pytest.raises(HTTPException) as public_error:
                    await get_public_conversation(conversation.id, db, user)
                assert public_error.value.status_code == 404

                replacement = ConversationLine(
                    conversation_id=conversation.id,
                    speaker=Speaker.B,
                    line_order=2,
                    text_en="Hi again",
                )
                db.add(replacement)
                await db.commit()
                with pytest.raises(HTTPException) as delete_error:
                    await delete_line(replacement.id, db, admin)
                assert delete_error.value.status_code == 409
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_sqlite_enforces_cascade_deletes_for_domain_graph():
    async def scenario():
        engine, sessions = await _new_database()
        try:
            async with sessions() as db:
                user, _, topic, conversation, _, _ = await _curriculum(db)
                attempt = ProgressCreate(
                    attempt_id=uuid4(),
                    conversation_id=conversation.id,
                    role_played="A",
                    completed_lines=1,
                    total_lines=1,
                    is_completed=True,
                    pronunciation_score=92,
                    practice_mode=1,
                    response_times=[1.0],
                )
                await save_progress(attempt, db, user)

                await db.delete(topic)
                await db.commit()
                assert await db.scalar(select(func.count(Conversation.id))) == 0
                assert await db.scalar(select(func.count(ConversationLine.id))) == 0
                assert await db.scalar(select(func.count(UserProgress.id))) == 0
                assert await db.scalar(select(func.count(PracticeAttempt.id))) == 0
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_stats_hide_expired_streak_and_unavailable_reviews():
    async def scenario():
        engine, sessions = await _new_database()
        try:
            async with sessions() as db:
                user, _, topic, conversation, _, _ = await _curriculum(db)
                await save_progress(
                    ProgressCreate(
                        attempt_id=uuid4(),
                        conversation_id=conversation.id,
                        role_played="A",
                        completed_lines=1,
                        total_lines=1,
                        is_completed=True,
                        pronunciation_score=92,
                        practice_mode=1,
                        response_times=[1.0],
                    ),
                    db,
                    user,
                )
                now = datetime.now(timezone.utc)
                user.streak_count = 7
                user.last_streak_date = now - timedelta(days=5)
                topic.is_published = False
                progress = (
                    await db.execute(
                        select(UserProgress).where(UserProgress.user_id == user.id)
                    )
                ).scalar_one()
                progress.next_review_at = now - timedelta(days=1)
                await db.commit()

                stats = await get_stats(db, user)
                reviews = await get_review_list(50, db, user)
                assert stats.streak_days == 0
                assert stats.due_for_review == 0
                assert reviews == []
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_refresh_rotation_detects_replay_without_breaking_concurrent_tabs():
    async def scenario():
        engine, sessions = await _new_database()
        try:
            async with sessions() as db:
                user = User(email="session@example.com", full_name="Session Test")
                db.add(user)
                await db.flush()
                user_id = user.id
                session_id = uuid4()
                old_refresh = create_refresh_token(
                    {"sub": str(user_id)},
                    session_id=str(session_id),
                )
                auth_session = AuthSession(
                    id=session_id,
                    user_id=user_id,
                    refresh_token_hash=hash_refresh_token(old_refresh),
                    expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                )
                db.add(auth_session)
                await db.commit()

                def refresh_request() -> Request:
                    cookie = (
                        f"{settings.REFRESH_COOKIE_NAME}={old_refresh}"
                    ).encode()
                    return Request(
                        {
                            "type": "http",
                            "method": "POST",
                            "path": "/api/auth/refresh",
                            "headers": [(b"cookie", cookie)],
                            "query_string": b"",
                            "server": ("testserver", 80),
                            "client": ("127.0.0.1", 1234),
                            "scheme": "http",
                        }
                    )

                first = await refresh(refresh_request(), Response(), db)
                assert first.user.id == user_id
                await db.refresh(auth_session)
                rotated_hash = auth_session.refresh_token_hash
                assert rotated_hash != hash_refresh_token(old_refresh)

                # A near-simultaneous tab can finish with the previous token
                # without replacing the newly rotated refresh credential.
                second = await refresh(refresh_request(), Response(), db)
                assert second.user.id == user_id
                await db.refresh(auth_session)
                assert auth_session.revoked_at is None
                assert auth_session.refresh_token_hash == rotated_hash

                auth_session.previous_valid_until = (
                    datetime.now(timezone.utc) - timedelta(seconds=1)
                )
                await db.commit()
                replay = await refresh(refresh_request(), Response(), db)
                assert replay.status_code == 401
                await db.refresh(auth_session)
                assert auth_session.revoked_at is not None
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_admin_collections_return_complete_pagination_metadata():
    async def scenario():
        engine, sessions = await _new_database()
        try:
            async with sessions() as db:
                _, admin, _, _, _, _ = await _curriculum(db)
                topics = await list_topics(1, 0, db, admin)
                conversations = await list_conversations(None, 1, 0, db, admin)
                users = await list_users(1, 0, db, admin)

                for page in (topics, conversations, users):
                    assert page["limit"] == 1
                    assert page["offset"] == 0
                    assert page["total"] >= 1
                    assert len(page["items"]) == 1
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_migration_preserves_legacy_json_and_srs_evidence():
    migration = runpy.run_path(
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "c91d8b7e4a21_add_immutable_practice_attempts.py"
    )
    rows = [
        {
            "role_played": "A",
            "mode_scores": '{"1":{"best":95,"success_count":2}}',
        },
        {
            "role_played": "A",
            "mode_scores": {"1": {"best": 92, "success_count": 2}},
        },
    ]
    merged = migration["_merge_mode_scores"](rows)
    sanitized = migration["_number_list"]('[95,"bad",-4,101]', 0, 100, 20)

    assert merged["1"]["best"] == 95
    assert merged["1"]["total_success_count"] == 4
    assert merged["1"]["role_success_counts"] == {"A": 4, "B": 0}
    assert sanitized == [95, 0, 0, 100]
    assert migration["_infer_srs_repetitions"](4, datetime.now(), 6) == 2
