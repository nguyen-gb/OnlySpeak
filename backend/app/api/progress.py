import math
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_current_user
from app.database import get_db
from app.models.conversation import Conversation, ConversationLine, Speaker
from app.models.progress import PracticeAttempt, UserProgress
from app.models.topic import Topic
from app.models.user import User
from app.schemas.progress import (
    PracticeAttemptResponse,
    ProgressCreate,
    ProgressResponse,
    ProgressSaveResponse,
    ProgressStatsResponse,
)

router = APIRouter(prefix="/api/progress", tags=["progress"])

MASTERY_THRESHOLD = 90
MASTERY_STREAK_REQUIRED = 5
MAX_HISTORY = 20
MAX_RESPONSE_HISTORY = 50
MAX_FREE_TALK_TURNS = 20

# A mode unlocks the next mode only after enough completed sessions pass its
# own rule. Best score alone is display progress, not unlock state.
MODE_UNLOCK_RULES = {
    1: {"score": 90, "successes": 3},
    2: {"score": 90, "successes": 3},
    3: {"score": 90, "successes": 3},
    4: {"score": 90, "successes": 5, "response_time": 3.0},
    5: {"score": 90, "successes": 2},
}
ROLE_SUCCESS_CAP_BY_MODE = {1: 2, 2: 2, 3: 2, 4: 3, 5: 1}


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _role_key(role: str | Speaker | None) -> str | None:
    if not role:
        return None
    value = getattr(role, "value", role)
    value = str(value).upper()
    return value if value in {"A", "B"} else None


def _calculate_srs(
    score: float,
    interval: float,
    ease_factor: float,
    repetitions: int = 0,
) -> tuple[float, float, int]:
    """Apply the SM-2 interval/ease rules to one completed recall."""

    if score >= 95:
        quality = 5
    elif score >= 85:
        quality = 4
    elif score >= 70:
        quality = 3
    elif score >= 50:
        quality = 2
    elif score >= 30:
        quality = 1
    else:
        quality = 0

    current_ease = max(float(ease_factor or 2.5), 1.3)
    new_ease = max(
        1.3,
        current_ease
        + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    )

    if quality < 3:
        return 1.0, round(new_ease, 3), 0

    new_repetitions = max(int(repetitions or 0), 0) + 1
    if new_repetitions == 1:
        new_interval = 1
    elif new_repetitions == 2:
        new_interval = 6
    else:
        new_interval = max(1, round(max(interval, 1) * current_ease))

    return float(min(new_interval, 3650)), round(new_ease, 3), new_repetitions


def _calculate_mastery(
    practice_count: int,
    best_score: float,
    streak_perfect: int,
    scores_history: list[float],
) -> float:
    if not scores_history or practice_count <= 0:
        return 0.0

    streak_factor = min(streak_perfect / MASTERY_STREAK_REQUIRED, 1.0) * 40
    recent = scores_history[-5:]
    recent_factor = (sum(recent) / len(recent) / 100) * 30
    best_factor = (best_score / 100) * 15
    volume_factor = min(
        math.log2(practice_count + 1) / math.log2(11), 1.0
    ) * 15
    return round(min(streak_factor + recent_factor + best_factor + volume_factor, 100), 1)


def _empty_mode_data() -> dict:
    return {
        "best": 0.0,
        "streak": 0,
        "success_count": 0,
        "total_success_count": 0,
        "role_success_counts": {"A": 0, "B": 0},
        "passed": False,
        "passed_at": None,
        "last_success_at": None,
    }


def _safe_nonnegative_int(value) -> int:
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError, OverflowError):
        return 0


def _safe_score(value) -> float:
    try:
        score = float(value or 0)
    except (TypeError, ValueError, OverflowError):
        return 0.0
    return min(max(score, 0.0), 100.0) if math.isfinite(score) else 0.0


def _effective_success_count(data: dict, mode: int) -> int:
    required = MODE_UNLOCK_RULES.get(mode, {}).get("successes")
    role_counts = data.get("role_success_counts") or {}
    role_cap = ROLE_SUCCESS_CAP_BY_MODE.get(mode)
    if role_cap:
        count = sum(
            min(_safe_nonnegative_int(role_counts.get(role)), role_cap)
            for role in ("A", "B")
        )
    else:
        count = _safe_nonnegative_int(
            data.get("total_success_count") or data.get("success_count")
        )
    return min(count, int(required)) if required else count


def _normalize_mode_data(
    raw: dict | None,
    mode: int,
    role_played: str | Speaker | None = None,
) -> dict:
    data = _empty_mode_data()
    if isinstance(raw, dict):
        data.update(raw)

    data["best"] = _safe_score(data.get("best"))
    data["streak"] = _safe_nonnegative_int(data.get("streak"))
    legacy_success_count = _safe_nonnegative_int(data.get("success_count"))
    raw_role_counts = data.get("role_success_counts")
    raw_role_counts = raw_role_counts if isinstance(raw_role_counts, dict) else {}
    role_counts = {
        "A": _safe_nonnegative_int(raw_role_counts.get("A")),
        "B": _safe_nonnegative_int(raw_role_counts.get("B")),
    }

    role_key = _role_key(role_played)
    if role_key and not any(role_counts.values()) and legacy_success_count:
        role_counts[role_key] = legacy_success_count

    data["role_success_counts"] = role_counts
    data["total_success_count"] = max(
        _safe_nonnegative_int(data.get("total_success_count")),
        legacy_success_count,
        sum(role_counts.values()),
    )
    data["success_count"] = _effective_success_count(data, mode)
    required = MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)
    data["passed"] = data["success_count"] >= required
    data["passed_at"] = data.get("passed_at") or None
    data["last_success_at"] = data.get("last_success_at") or None
    return data


def _session_passed_mode(mode: int, score: float, session_avg_rt: float) -> bool:
    rule = MODE_UNLOCK_RULES.get(mode)
    if not rule or score < rule["score"]:
        return False
    response_time = rule.get("response_time")
    if response_time is not None:
        return 0 < session_avg_rt < response_time
    return True


def _calculate_current_mode(mode_scores: dict, *, now: datetime | None = None) -> int:
    del now  # Kept as a keyword for compatibility with existing internal callers.
    unlocked = 1
    for mode in (1, 2, 3):
        if not _normalize_mode_data(mode_scores.get(str(mode)), mode)["passed"]:
            return unlocked
        unlocked = mode + 1
    if not _normalize_mode_data(mode_scores.get("4"), 4)["passed"]:
        return unlocked
    return 5


def _merge_mode_scores(
    base: dict,
    incoming: dict,
    role_played: str | Speaker | None = None,
) -> dict:
    merged = dict(base or {})
    for raw_mode_key, raw_data in (incoming or {}).items():
        try:
            mode = int(raw_mode_key)
        except (TypeError, ValueError):
            continue
        if mode not in MODE_UNLOCK_RULES:
            continue

        mode_key = str(mode)
        current = _normalize_mode_data(merged.get(mode_key), mode)
        new = _normalize_mode_data(raw_data, mode, role_played)
        current["best"] = max(current["best"], new["best"])
        current["streak"] = max(current["streak"], new["streak"])
        current["total_success_count"] = (
            _safe_nonnegative_int(current.get("total_success_count"))
            + _safe_nonnegative_int(new.get("total_success_count"))
        )
        current_counts = current.get("role_success_counts") or {}
        new_counts = new.get("role_success_counts") or {}
        current["role_success_counts"] = {
            role: _safe_nonnegative_int(current_counts.get(role))
            + _safe_nonnegative_int(new_counts.get(role))
            for role in ("A", "B")
        }
        current["success_count"] = _effective_success_count(current, mode)
        current["passed"] = (
            current["success_count"]
            >= MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)
        )

        current_last = current.get("last_success_at")
        new_last = new.get("last_success_at")
        if new_last and (not current_last or new_last > current_last):
            current["last_success_at"] = new_last
        current_passed_at = current.get("passed_at")
        new_passed_at = new.get("passed_at")
        if new_passed_at and (
            not current_passed_at or new_passed_at < current_passed_at
        ):
            current["passed_at"] = new_passed_at
        merged[mode_key] = current
    return merged


def _to_response(
    progress: UserProgress,
    conversation: Conversation | None = None,
) -> ProgressResponse:
    mode_scores = {}
    for mode_key, mode_data in (progress.mode_scores or {}).items():
        try:
            mode_scores[str(int(mode_key))] = _normalize_mode_data(
                mode_data,
                int(mode_key),
                progress.role_played,
            )
        except (TypeError, ValueError):
            continue

    return ProgressResponse(
        id=progress.id,
        user_id=progress.user_id,
        conversation_id=progress.conversation_id,
        conversation_title=conversation.title if conversation else "",
        conversation_situation=(conversation.situation or "") if conversation else "",
        role_played=progress.role_played.value,
        completed_lines=progress.completed_lines,
        total_lines=progress.total_lines,
        is_completed=progress.is_completed,
        pronunciation_score=progress.pronunciation_score,
        practice_count=progress.practice_count,
        best_score=progress.best_score,
        streak_perfect=progress.streak_perfect,
        mastery_level=progress.mastery_level,
        scores_history=list(progress.scores_history or []),
        current_mode=max(progress.current_mode, _calculate_current_mode(mode_scores)),
        mode_scores=mode_scores,
        avg_response_time=progress.avg_response_time,
        next_review_at=_as_utc(progress.next_review_at),
        review_interval=progress.review_interval,
        last_practiced_at=_as_utc(progress.last_practiced_at),
        created_at=_as_utc(progress.created_at),
    )


def _to_grouped_response(
    items: list[UserProgress],
    conversation: Conversation | None = None,
) -> ProgressResponse:
    if not items:
        raise ValueError("at least one progress aggregate is required")
    ordered = sorted(
        items,
        key=lambda item: _as_utc(item.last_practiced_at),
        reverse=True,
    )
    latest = ordered[0]
    response = _to_response(latest, conversation)
    roles = sorted({_role_key(item.role_played) for item in ordered if _role_key(item.role_played)})
    merged_scores: dict = {}
    scores_history: list[float] = []
    response_times: list[float] = []
    for progress in sorted(ordered, key=lambda item: _as_utc(item.last_practiced_at)):
        merged_scores = _merge_mode_scores(
            merged_scores,
            progress.mode_scores or {},
            progress.role_played,
        )
        scores_history.extend(progress.scores_history or [])
        response_times.extend(progress.response_times or [])

    scores = [
        item.pronunciation_score
        for item in ordered
        if item.pronunciation_score is not None
    ]
    response.role_played = "/".join(roles)
    response.completed_lines = sum(item.completed_lines for item in ordered)
    response.total_lines = sum(item.total_lines for item in ordered)
    response.is_completed = any(item.is_completed for item in ordered)
    response.pronunciation_score = (
        round(sum(scores) / len(scores), 1) if scores else None
    )
    response.practice_count = sum(item.practice_count for item in ordered)
    response.best_score = max((item.best_score for item in ordered), default=0)
    response.streak_perfect = max(
        (item.streak_perfect for item in ordered), default=0
    )
    response.mastery_level = max(
        (item.mastery_level for item in ordered), default=0
    )
    response.scores_history = scores_history[-MAX_HISTORY:]
    response.current_mode = _calculate_current_mode(merged_scores)
    response.mode_scores = merged_scores
    response.avg_response_time = (
        round(sum(response_times) / len(response_times), 2)
        if response_times
        else 0
    )
    review_dates = [
        _as_utc(item.next_review_at)
        for item in ordered
        if item.next_review_at is not None
    ]
    response.next_review_at = min(review_dates) if review_dates else None
    response.review_interval = min(
        (item.review_interval for item in ordered if item.practice_count > 0),
        default=latest.review_interval,
    )
    response.last_practiced_at = _as_utc(latest.last_practiced_at)
    response.created_at = min(_as_utc(item.created_at) for item in ordered)
    return response


def _to_attempt_response(
    attempt: PracticeAttempt,
    conversation: Conversation,
) -> PracticeAttemptResponse:
    return PracticeAttemptResponse(
        id=attempt.id,
        attempt_id=attempt.client_attempt_id,
        user_id=attempt.user_id,
        conversation_id=attempt.conversation_id,
        conversation_title=conversation.title,
        conversation_situation=conversation.situation or "",
        role_played=attempt.role_played.value,
        completed_lines=attempt.completed_lines,
        total_lines=attempt.total_lines,
        is_completed=attempt.is_completed,
        pronunciation_score=attempt.pronunciation_score,
        practice_mode=attempt.practice_mode,
        response_times=list(attempt.response_times or []),
        avg_response_time=attempt.avg_response_time,
        xp_gained=attempt.xp_awarded,
        practice_count=attempt.session_count,
        is_legacy=attempt.is_legacy,
        last_practiced_at=_as_utc(attempt.created_at),
        created_at=_as_utc(attempt.created_at),
    )


def _attempt_matches(attempt: PracticeAttempt, data: ProgressCreate) -> bool:
    return (
        attempt.conversation_id == data.conversation_id
        and attempt.role_played.value == data.role_played
        and attempt.completed_lines == data.completed_lines
        and attempt.total_lines == data.total_lines
        and attempt.is_completed == data.is_completed
        and attempt.pronunciation_score == data.pronunciation_score
        and attempt.practice_mode == data.practice_mode
        and list(attempt.response_times or []) == list(data.response_times)
    )


async def _practice_context(
    data: ProgressCreate,
    db: AsyncSession,
) -> tuple[Conversation, int]:
    conversation = (
        await db.execute(
            select(Conversation)
            .join(Topic, Topic.id == Conversation.topic_id)
            .where(
                Conversation.id == data.conversation_id,
                Conversation.is_published.is_(True),
                Topic.is_published.is_(True),
            )
        )
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    counts_result = await db.execute(
        select(ConversationLine.speaker, func.count(ConversationLine.id))
        .where(ConversationLine.conversation_id == conversation.id)
        .group_by(ConversationLine.speaker)
    )
    counts = {speaker.value: int(count) for speaker, count in counts_result.all()}
    if not counts.get("A") or not counts.get("B"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conversation is not ready for practice",
        )

    if data.practice_mode < 5:
        expected_lines = counts[data.role_played]
        if data.total_lines != expected_lines:
            raise HTTPException(
                status_code=422,
                detail=f"total_lines must equal the server line count ({expected_lines})",
            )
        if data.is_completed and data.completed_lines != expected_lines:
            raise HTTPException(
                status_code=422,
                detail="A completed attempt must include every line for the selected role",
            )
    else:
        expected_lines = data.total_lines
        if data.total_lines > MAX_FREE_TALK_TURNS:
            raise HTTPException(
                status_code=422,
                detail=f"Free Talk is limited to {MAX_FREE_TALK_TURNS} turns",
            )
        if data.is_completed and not (1 <= data.completed_lines == data.total_lines):
            raise HTTPException(
                status_code=422,
                detail="A completed Free Talk attempt requires at least one completed turn",
            )

    if len(data.response_times) > data.completed_lines:
        raise HTTPException(
            status_code=422,
            detail="response_times cannot contain more entries than completed_lines",
        )
    if data.is_completed and len(data.response_times) != data.completed_lines:
        raise HTTPException(
            status_code=422,
            detail="A completed attempt requires one response time per completed line",
        )
    return conversation, expected_lines


def _calculate_xp(mode: int, score: float, completed_lines: int) -> int:
    xp = 10 + min(completed_lines, 20) * 2
    if score >= 90:
        xp += 20
    if mode == 3:
        xp += 10
    elif mode == 4:
        xp += 20
    return xp


def _update_user_streak(user: User, now: datetime) -> None:
    last_streak = _as_utc(user.last_streak_date)
    if last_streak is None:
        user.streak_count = 1
        user.last_streak_date = now
        return
    days = (now.date() - last_streak.date()).days
    if days <= 0:
        return
    user.streak_count = user.streak_count + 1 if days == 1 else 1
    user.last_streak_date = now


def _effective_streak_count(user: User, now: datetime) -> int:
    """Return the live streak without mutating it during a read request."""

    last_streak = _as_utc(user.last_streak_date)
    if last_streak is None:
        return 0
    days_since_practice = (now.date() - last_streak.date()).days
    if days_since_practice > 1:
        return 0
    return max(int(user.streak_count or 0), 0)


def _save_response(
    progress_items: list[UserProgress],
    conversation: Conversation,
    attempt_id: UUID,
    *,
    xp_gained: int,
    was_duplicate: bool,
) -> ProgressSaveResponse:
    aggregate = _to_grouped_response(progress_items, conversation)
    return ProgressSaveResponse(
        **aggregate.model_dump(),
        attempt_id=attempt_id,
        xp_gained=xp_gained,
        was_duplicate=was_duplicate,
    )


@router.post("", response_model=ProgressSaveResponse)
async def save_progress(
    data: ProgressCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Serialize submissions per user. This closes the first-insert race for the
    # aggregate and also makes the XP/idempotency check atomic on PostgreSQL.
    locked_user = (
        await db.execute(select(User).where(User.id == user.id).with_for_update())
    ).scalar_one()

    duplicate = (
        await db.execute(
            select(PracticeAttempt).where(
                PracticeAttempt.user_id == locked_user.id,
                PracticeAttempt.client_attempt_id == data.attempt_id,
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        if not _attempt_matches(duplicate, data):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="attempt_id was already used with a different payload",
            )
        conversation = (
            await db.execute(
                select(Conversation).where(Conversation.id == data.conversation_id)
            )
        ).scalar_one()
        progress_items = list(
            (
                await db.execute(
                    select(UserProgress).where(
                        UserProgress.user_id == locked_user.id,
                        UserProgress.conversation_id == data.conversation_id,
                    )
                )
            ).scalars()
        )
        return _save_response(
            progress_items,
            conversation,
            data.attempt_id,
            xp_gained=0,
            was_duplicate=True,
        )

    conversation, expected_lines = await _practice_context(data, db)
    progress_items = list(
        (
            await db.execute(
                select(UserProgress)
                .where(
                    UserProgress.user_id == locked_user.id,
                    UserProgress.conversation_id == data.conversation_id,
                )
                .with_for_update()
            )
        ).scalars()
    )

    merged_before: dict = {}
    for item in progress_items:
        merged_before = _merge_mode_scores(
            merged_before, item.mode_scores or {}, item.role_played
        )
    unlocked_mode = _calculate_current_mode(merged_before)
    if data.practice_mode > unlocked_mode:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Practice mode {data.practice_mode} is locked; current mode is {unlocked_mode}",
        )

    role = Speaker(data.role_played)
    progress = next(
        (item for item in progress_items if item.role_played == role),
        None,
    )
    now = datetime.now(timezone.utc)
    response_times = [float(value) for value in data.response_times]
    session_avg_rt = (
        round(sum(response_times) / len(response_times), 2)
        if response_times
        else 0.0
    )
    score = float(data.pronunciation_score) if data.pronunciation_score is not None else None
    xp_gained = (
        _calculate_xp(data.practice_mode, score, expected_lines)
        if data.is_completed and score is not None
        else 0
    )

    if progress is None:
        progress = UserProgress(
            user_id=locked_user.id,
            conversation_id=data.conversation_id,
            role_played=role,
            completed_lines=data.completed_lines,
            total_lines=data.total_lines,
            is_completed=False,
            pronunciation_score=None,
            practice_count=0,
            best_score=0,
            streak_perfect=0,
            mastery_level=0,
            scores_history=[],
            current_mode=unlocked_mode,
            mode_scores={},
            response_times=[],
            avg_response_time=0,
            review_interval=1,
            ease_factor=2.5,
            srs_repetitions=0,
            next_review_at=None,
            last_practiced_at=now,
        )
        db.add(progress)
        progress_items.append(progress)
    else:
        progress.last_practiced_at = now
        progress.total_lines = data.total_lines
        if progress.is_completed:
            # Curriculum edits can reduce the number of lines after a prior
            # completion. Keep the aggregate valid without treating a partial
            # retry as a new completion.
            progress.completed_lines = min(
                progress.completed_lines, data.total_lines
            )
        else:
            progress.completed_lines = max(progress.completed_lines, data.completed_lines)

    if data.is_completed and score is not None:
        progress.completed_lines = data.completed_lines
        progress.total_lines = data.total_lines
        progress.is_completed = True
        progress.pronunciation_score = score
        progress.practice_count += 1
        progress.best_score = max(progress.best_score, score)
        progress.streak_perfect = (
            progress.streak_perfect + 1 if score >= MASTERY_THRESHOLD else 0
        )

        history = list(progress.scores_history or [])
        history.append(score)
        progress.scores_history = history[-MAX_HISTORY:]
        response_history = list(progress.response_times or [])
        response_history.extend(response_times)
        progress.response_times = response_history[-MAX_RESPONSE_HISTORY:]
        progress.avg_response_time = (
            round(sum(progress.response_times) / len(progress.response_times), 2)
            if progress.response_times
            else 0
        )

        mode_scores = dict(progress.mode_scores or {})
        mode_key = str(data.practice_mode)
        mode_data = _normalize_mode_data(
            mode_scores.get(mode_key), data.practice_mode, role
        )
        was_passed = mode_data["passed"]
        mode_data["best"] = max(mode_data["best"], score)
        if _session_passed_mode(data.practice_mode, score, session_avg_rt):
            mode_data["streak"] += 1
            mode_data["total_success_count"] += 1
            mode_data["role_success_counts"][role.value] += 1
            mode_data["success_count"] = _effective_success_count(
                mode_data, data.practice_mode
            )
            mode_data["last_success_at"] = now.isoformat()
        else:
            mode_data["streak"] = 0
        mode_data["passed"] = (
            mode_data["success_count"]
            >= MODE_UNLOCK_RULES[data.practice_mode]["successes"]
        )
        if mode_data["passed"] and not was_passed:
            mode_data["passed_at"] = now.isoformat()
        mode_scores[mode_key] = mode_data
        progress.mode_scores = mode_scores

        interval, ease, repetitions = _calculate_srs(
            score,
            progress.review_interval,
            progress.ease_factor,
            progress.srs_repetitions,
        )
        progress.review_interval = interval
        progress.ease_factor = ease
        progress.srs_repetitions = repetitions
        progress.next_review_at = now + timedelta(days=interval)
        progress.mastery_level = _calculate_mastery(
            progress.practice_count,
            progress.best_score,
            progress.streak_perfect,
            progress.scores_history,
        )

        locked_user.total_xp = int(locked_user.total_xp or 0) + xp_gained
        _update_user_streak(locked_user, now)
        flag_modified(progress, "mode_scores")
        flag_modified(progress, "scores_history")
        flag_modified(progress, "response_times")

    attempt = PracticeAttempt(
        client_attempt_id=data.attempt_id,
        user_id=locked_user.id,
        conversation_id=data.conversation_id,
        role_played=role,
        completed_lines=data.completed_lines,
        total_lines=data.total_lines,
        is_completed=data.is_completed,
        pronunciation_score=score,
        practice_mode=data.practice_mode,
        response_times=response_times,
        avg_response_time=session_avg_rt,
        xp_awarded=xp_gained,
        created_at=now,
    )
    db.add(attempt)

    merged_after: dict = {}
    for item in progress_items:
        merged_after = _merge_mode_scores(
            merged_after, item.mode_scores or {}, item.role_played
        )
    current_mode = _calculate_current_mode(merged_after)
    for item in progress_items:
        item.current_mode = current_mode

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        duplicate = (
            await db.execute(
                select(PracticeAttempt).where(
                    PracticeAttempt.user_id == user.id,
                    PracticeAttempt.client_attempt_id == data.attempt_id,
                )
            )
        ).scalar_one_or_none()
        if duplicate is None or not _attempt_matches(duplicate, data):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Progress could not be saved because of a concurrent update",
            ) from exc
        conversation = (
            await db.execute(
                select(Conversation).where(Conversation.id == data.conversation_id)
            )
        ).scalar_one()
        progress_items = list(
            (
                await db.execute(
                    select(UserProgress).where(
                        UserProgress.user_id == user.id,
                        UserProgress.conversation_id == data.conversation_id,
                    )
                )
            ).scalars()
        )
        return _save_response(
            progress_items,
            conversation,
            data.attempt_id,
            xp_gained=0,
            was_duplicate=True,
        )

    return _save_response(
        progress_items,
        conversation,
        data.attempt_id,
        xp_gained=xp_gained,
        was_duplicate=False,
    )


@router.get("", response_model=list[PracticeAttemptResponse])
async def get_progress(
    response: Response,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = await db.scalar(
        select(func.count(PracticeAttempt.id)).where(
            PracticeAttempt.user_id == user.id
        )
    )
    response.headers["X-Total-Count"] = str(int(total or 0))
    result = await db.execute(
        select(PracticeAttempt, Conversation)
        .join(Conversation, PracticeAttempt.conversation_id == Conversation.id)
        .where(PracticeAttempt.user_id == user.id)
        .order_by(PracticeAttempt.created_at.desc(), PracticeAttempt.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        _to_attempt_response(attempt, conversation)
        for attempt, conversation in result.all()
    ]


async def _progress_groups(
    db: AsyncSession,
    user_id: UUID,
) -> list[tuple[Conversation, list[UserProgress]]]:
    result = await db.execute(
        select(UserProgress, Conversation)
        .join(Conversation, UserProgress.conversation_id == Conversation.id)
        .where(UserProgress.user_id == user_id)
        .order_by(UserProgress.last_practiced_at.desc())
    )
    grouped: dict[UUID, tuple[Conversation, list[UserProgress]]] = {}
    for progress, conversation in result.all():
        if conversation.id not in grouped:
            grouped[conversation.id] = (conversation, [])
        grouped[conversation.id][1].append(progress)
    return list(grouped.values())


@router.get("/stats", response_model=ProgressStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    groups = await _progress_groups(db, user.id)
    summaries = [
        _to_grouped_response(items, conversation)
        for conversation, items in groups
    ]
    summaries.sort(key=lambda item: item.last_practiced_at, reverse=True)

    average_row = (
        await db.execute(
            select(
                func.sum(
                    PracticeAttempt.pronunciation_score
                    * PracticeAttempt.session_count
                ),
                func.sum(PracticeAttempt.session_count),
            ).where(
                PracticeAttempt.user_id == user.id,
                PracticeAttempt.is_completed.is_(True),
                PracticeAttempt.pronunciation_score.isnot(None),
            )
        )
    ).one()
    weighted_total, score_count = average_row
    average_score = (
        round(float(weighted_total) / int(score_count), 1)
        if weighted_total is not None and score_count
        else None
    )

    now = datetime.now(timezone.utc)
    total_practiced = sum(item.practice_count for item in summaries)
    total_completed = sum(1 for item in summaries if item.is_completed)
    mastered = [item for item in summaries if item.mastery_level >= 95]
    mastered_values = [
        item.mastery_level for item in summaries if item.mastery_level > 0
    ]
    due_for_review = await db.scalar(
        select(func.count(func.distinct(UserProgress.conversation_id)))
        .join(Conversation, UserProgress.conversation_id == Conversation.id)
        .join(Topic, Conversation.topic_id == Topic.id)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.practice_count > 0,
            UserProgress.next_review_at.isnot(None),
            UserProgress.next_review_at <= now,
            Conversation.is_published.is_(True),
            Topic.is_published.is_(True),
        )
    )

    return ProgressStatsResponse(
        total_practiced=total_practiced,
        total_completed=total_completed,
        average_score=average_score,
        streak_days=_effective_streak_count(user, now),
        total_mastered=len(mastered),
        overall_mastery=(
            round(sum(mastered_values) / len(mastered_values), 1)
            if mastered_values
            else 0.0
        ),
        due_for_review=int(due_for_review or 0),
        recent_progress=summaries[:10],
    )


@router.get("/mastery")
async def get_mastery_map(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    groups = await _progress_groups(db, user.id)
    mastery_map = {}
    for conversation, items in groups:
        response = _to_grouped_response(items, conversation)
        mastery_map[str(conversation.id)] = {
            "mastery_level": response.mastery_level,
            "practice_count": response.practice_count,
            "best_score": response.best_score,
            "streak_perfect": response.streak_perfect,
            "pronunciation_score": response.pronunciation_score or 0,
            "current_mode": response.current_mode,
            "avg_response_time": response.avg_response_time,
            "mode_scores": response.mode_scores,
        }
    return mastery_map


@router.get("/review")
async def get_review_list(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    due_rows = (
        await db.execute(
            select(UserProgress, Conversation)
            .join(Conversation, UserProgress.conversation_id == Conversation.id)
            .join(Topic, Topic.id == Conversation.topic_id)
            .where(
                UserProgress.user_id == user.id,
                UserProgress.practice_count > 0,
                UserProgress.next_review_at.isnot(None),
                UserProgress.next_review_at <= now,
                Conversation.is_published.is_(True),
                Topic.is_published.is_(True),
            )
            .order_by(UserProgress.next_review_at.asc())
        )
    ).all()
    due_ids: list[UUID] = []
    overdue_by_conversation: dict[UUID, float] = {}
    for progress, _ in due_rows:
        if progress.conversation_id not in due_ids:
            due_ids.append(progress.conversation_id)
        overdue = (now - _as_utc(progress.next_review_at)).total_seconds() / 86400
        overdue_by_conversation[progress.conversation_id] = max(
            overdue_by_conversation.get(progress.conversation_id, 0), overdue
        )
    due_ids = due_ids[:limit]
    if not due_ids:
        return []

    result = await db.execute(
        select(UserProgress, Conversation)
        .join(Conversation, UserProgress.conversation_id == Conversation.id)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.conversation_id.in_(due_ids),
        )
    )
    grouped: dict[UUID, tuple[Conversation, list[UserProgress]]] = {}
    for progress, conversation in result.all():
        if conversation.id not in grouped:
            grouped[conversation.id] = (conversation, [])
        grouped[conversation.id][1].append(progress)

    review_items = []
    for conversation_id in due_ids:
        group = grouped.get(conversation_id)
        if group is None:
            continue
        conversation, items = group
        response = _to_grouped_response(items, conversation)
        review_items.append(
            {
                "progress": response,
                "conversation_title": conversation.title,
                "conversation_situation": conversation.situation or "",
                "overdue_days": round(
                    overdue_by_conversation.get(conversation_id, 0), 1
                ),
            }
        )
    return review_items
