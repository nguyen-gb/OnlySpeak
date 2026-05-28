from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.progress import UserProgress
from app.models.conversation import Conversation
from app.schemas.progress import ProgressCreate, ProgressResponse, ProgressStatsResponse

router = APIRouter(prefix="/api/progress", tags=["progress"])

# ── Mastery & Mode Constants ──
MASTERY_THRESHOLD = 90
MASTERY_STREAK_REQUIRED = 5
MAX_HISTORY = 20

# A mode unlocks the next mode only after enough completed sessions pass its
# own rule. Best score alone is display progress, not unlock state.
MODE_UNLOCK_RULES = {
    1: {"score": 90, "successes": 3},  # Shadow Master
    2: {"score": 90, "successes": 3},  # Reader
    3: {"score": 90, "successes": 3},  # Listener
    4: {"score": 90, "successes": 5, "response_time": 3.0},  # Speed Talker
}
FLUENT_REVIEW_WINDOW_DAYS = 30
ROLE_SUCCESS_CAP_FOR_THREE_SUCCESS_MODES = 2


def _role_key(role: str | None) -> str | None:
    if not role:
        return None
    value = getattr(role, "value", role)
    value = str(value).upper()
    return value if value in {"A", "B"} else None


def _calculate_srs(score: float, interval: float, ease_factor: float) -> tuple[float, float]:
    if score >= 95: q = 5
    elif score >= 85: q = 4
    elif score >= 70: q = 3
    elif score >= 50: q = 2
    elif score >= 30: q = 1
    else: q = 0

    if q >= 3:
        if interval <= 0:
            new_interval = 1
        elif interval == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        
        new_ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    else:
        new_interval = 1
        new_ease_factor = ease_factor

    if new_ease_factor < 1.3:
        new_ease_factor = 1.3
        
    return float(new_interval), float(new_ease_factor)


def _calculate_mastery(
    practice_count: int,
    best_score: float,
    streak_perfect: int,
    scores_history: list[float],
) -> float:
    if not scores_history or practice_count == 0:
        return 0.0

    streak_factor = min(streak_perfect / MASTERY_STREAK_REQUIRED, 1.0) * 40
    recent = scores_history[-5:] if len(scores_history) >= 5 else scores_history
    recent_avg = sum(recent) / len(recent)
    recent_factor = (recent_avg / 100) * 30
    best_factor = (best_score / 100) * 15
    
    import math
    volume_factor = min(math.log2(practice_count + 1) / math.log2(11), 1.0) * 15

    mastery = streak_factor + recent_factor + best_factor + volume_factor
    return round(min(mastery, 100.0), 1)


def _empty_mode_data() -> dict:
    return {
        "best": 0,
        "streak": 0,
        "success_count": 0,
        "total_success_count": 0,
        "role_success_counts": {"A": 0, "B": 0},
        "passed": False,
        "passed_at": None,
        "last_success_at": None,
    }


def _effective_success_count(data: dict, mode: int) -> int:
    required = MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)
    role_counts = data.get("role_success_counts") or {}
    if required == 3 and role_counts:
        return sum(
            min(int(role_counts.get(role) or 0), ROLE_SUCCESS_CAP_FOR_THREE_SUCCESS_MODES)
            for role in ("A", "B")
        )
    return int(data.get("total_success_count") or data.get("success_count") or 0)


def _normalize_mode_data(raw: dict | None, mode: int, role_played: str | None = None) -> dict:
    data = _empty_mode_data()
    if raw:
        data.update(raw)

    data["best"] = float(data.get("best") or 0)
    data["streak"] = int(data.get("streak") or 0)
    legacy_success_count = int(data.get("success_count") or 0)

    raw_role_counts = data.get("role_success_counts") or {}
    role_counts = {
        "A": int(raw_role_counts.get("A") or 0),
        "B": int(raw_role_counts.get("B") or 0),
    }

    # Older records only stored one aggregate success_count on each role-specific
    # progress row. Attribute that legacy count to the row's role so the new
    # cross-role unlock rule can still evaluate historical progress.
    role_key = _role_key(role_played)
    if role_key and not any(role_counts.values()) and legacy_success_count:
        role_counts[role_key] = legacy_success_count

    data["role_success_counts"] = role_counts
    data["total_success_count"] = max(
        int(data.get("total_success_count") or 0),
        legacy_success_count,
        sum(role_counts.values()),
    )
    data["success_count"] = _effective_success_count(data, mode)

    required = MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)
    data["passed"] = data["success_count"] >= required
    return data


def _session_passed_mode(mode: int, score: float, session_avg_rt: float) -> bool:
    rule = MODE_UNLOCK_RULES.get(mode)
    if not rule:
        return False

    if score < rule["score"]:
        return False

    response_time = rule.get("response_time")
    if response_time is not None:
        return session_avg_rt > 0 and session_avg_rt < response_time

    return True


def _calculate_current_mode(mode_scores: dict, *, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    unlocked = 1

    for mode in (1, 2, 3):
        mode_data = _normalize_mode_data(mode_scores.get(str(mode)), mode)
        if not mode_data["passed"]:
            return unlocked
        unlocked = mode + 1

    mode4 = _normalize_mode_data(mode_scores.get("4"), 4)
    if not mode4["passed"]:
        return unlocked

    passed_at = mode4.get("passed_at")
    last_success_at = mode4.get("last_success_at")
    if passed_at and last_success_at:
        try:
            passed = datetime.fromisoformat(passed_at)
            last_success = datetime.fromisoformat(last_success_at)
            if passed.tzinfo is None:
                passed = passed.replace(tzinfo=timezone.utc)
            if last_success.tzinfo is None:
                last_success = last_success.replace(tzinfo=timezone.utc)
            if last_success - passed >= timedelta(days=FLUENT_REVIEW_WINDOW_DAYS):
                return 5
        except (TypeError, ValueError):
            pass

    return 4


def _merge_mode_scores(base: dict, incoming: dict, role_played: str | None = None) -> dict:
    merged = dict(base)
    for mode_key, raw_data in (incoming or {}).items():
        try:
            mode = int(mode_key)
        except (TypeError, ValueError):
            continue

        current = _normalize_mode_data(merged.get(mode_key), mode)
        new = _normalize_mode_data(raw_data, mode, role_played)
        current["best"] = max(current["best"], new["best"])
        current["streak"] = max(current["streak"], new["streak"])
        current["total_success_count"] = int(current.get("total_success_count") or 0) + int(new.get("total_success_count") or 0)
        current_role_counts = current.get("role_success_counts") or {}
        new_role_counts = new.get("role_success_counts") or {}
        current["role_success_counts"] = {
            role: int(current_role_counts.get(role) or 0) + int(new_role_counts.get(role) or 0)
            for role in ("A", "B")
        }
        current["success_count"] = _effective_success_count(current, mode)
        current["passed"] = current["success_count"] >= MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)

        current_last = current.get("last_success_at")
        new_last = new.get("last_success_at")
        if new_last and (not current_last or new_last > current_last):
            current["last_success_at"] = new_last

        current_passed_at = current.get("passed_at")
        new_passed_at = new.get("passed_at")
        if new_passed_at and (not current_passed_at or new_passed_at < current_passed_at):
            current["passed_at"] = new_passed_at

        merged[mode_key] = current
    return merged


def _to_response(p: UserProgress, conversation: Conversation | None = None) -> ProgressResponse:
    mode_scores = {}
    for mode_key, mode_data in (p.mode_scores or {}).items():
        try:
            mode_scores[mode_key] = _normalize_mode_data(mode_data, int(mode_key), p.role_played.value)
        except (TypeError, ValueError):
            continue

    return ProgressResponse(
        id=p.id,
        user_id=p.user_id,
        conversation_id=p.conversation_id,
        conversation_title=conversation.title if conversation else "",
        conversation_situation=conversation.situation if conversation else "",
        role_played=p.role_played.value,
        completed_lines=p.completed_lines,
        total_lines=p.total_lines,
        is_completed=p.is_completed,
        pronunciation_score=p.pronunciation_score,
        practice_count=p.practice_count,
        best_score=p.best_score,
        streak_perfect=p.streak_perfect,
        mastery_level=p.mastery_level,
        scores_history=p.scores_history or [],
        current_mode=_calculate_current_mode(mode_scores),
        mode_scores=mode_scores,
        avg_response_time=p.avg_response_time,
        next_review_at=p.next_review_at,
        review_interval=p.review_interval,
        last_practiced_at=p.last_practiced_at,
        created_at=p.created_at,
    )


@router.post("", response_model=ProgressResponse)
async def save_progress(
    data: ProgressCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.conversation_id == data.conversation_id,
            UserProgress.role_played == data.role_played,
        )
    )
    existing = result.scalar_one_or_none()
    score = data.pronunciation_score or 0.0
    mode = data.practice_mode or 1
    new_response_times = data.response_times or []
    
    # Calculate average response time for this session
    session_avg_rt = round(sum(new_response_times) / len(new_response_times), 2) if new_response_times else 0.0

    # XP Calculation (only for completed sessions to prevent farming)
    xp_gained = 0
    if data.is_completed:
        xp_gained = 10 # Base
        xp_gained += len(new_response_times) * 2
        if score >= 90: xp_gained += 20
        if mode == 3: xp_gained += 10
        if mode == 4: xp_gained += 20
    
    # Update User XP and Streak
    now = datetime.now(timezone.utc)
    user.total_xp += xp_gained
    
    if user.last_streak_date:
        last_date = user.last_streak_date.date()
        today_date = now.date()
        if today_date > last_date:
            if (today_date - last_date).days == 1:
                user.streak_count += 1
            else:
                user.streak_count = 1
            user.last_streak_date = now
    else:
        user.streak_count = 1
        user.last_streak_date = now

    if existing:
        existing.completed_lines = data.completed_lines
        existing.total_lines = data.total_lines
        existing.is_completed = data.is_completed
        existing.pronunciation_score = score
        existing.practice_count += 1
        existing.last_practiced_at = now

        existing.best_score = max(existing.best_score, score)
        if score >= MASTERY_THRESHOLD:
            existing.streak_perfect += 1
        else:
            existing.streak_perfect = 0

        history = list(existing.scores_history or [])
        history.append(score)
        existing.scores_history = history[-MAX_HISTORY:]

        rt_history = list(existing.response_times or [])
        rt_history.extend(new_response_times)
        existing.response_times = rt_history[-50:]
        if existing.response_times:
            existing.avg_response_time = round(sum(existing.response_times) / len(existing.response_times), 2)

        mode_scores = dict(existing.mode_scores or {})
        mode_key = str(mode)
        current_m_data = _normalize_mode_data(mode_scores.get(mode_key), mode, data.role_played)
        was_passed = current_m_data["passed"]
        role_key = _role_key(data.role_played)

        current_m_data["best"] = max(current_m_data["best"], score)
        if data.is_completed:
            if _session_passed_mode(mode, score, session_avg_rt):
                current_m_data["streak"] += 1
                current_m_data["total_success_count"] += 1
                if role_key:
                    current_m_data["role_success_counts"][role_key] += 1
                current_m_data["success_count"] = _effective_success_count(current_m_data, mode)
                current_m_data["last_success_at"] = now.isoformat()
            else:
                # Only reset streak on completed-but-failed, not on incomplete
                current_m_data["streak"] = 0
        # If not completed, don't touch streak at all (preserve progress)

        # Recalculate pass status from effective cross-role successes.
        current_m_data["passed"] = (
            current_m_data["success_count"]
            >= MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)
        )
        if current_m_data["passed"] and not was_passed:
            current_m_data["passed_at"] = now.isoformat()
        mode_scores[mode_key] = current_m_data
        existing.mode_scores = mode_scores
        existing.current_mode = _calculate_current_mode(mode_scores, now=now)

        new_interval, new_ef = _calculate_srs(score, existing.review_interval, existing.ease_factor)
        existing.review_interval = new_interval
        existing.ease_factor = new_ef
        existing.next_review_at = now + timedelta(days=new_interval)

        existing.mastery_level = _calculate_mastery(
            existing.practice_count, existing.best_score, existing.streak_perfect, history
        )

        # Explicitly flag JSON columns as modified for SQLite
        flag_modified(existing, "mode_scores")
        flag_modified(existing, "scores_history")
        flag_modified(existing, "response_times")

        await db.commit()
        await db.refresh(existing)
        progress = existing
    else:
        # First attempt
        streak = 1 if score >= MASTERY_THRESHOLD else 0
        history = [score] if score > 0 else []
        new_interval, new_ef = _calculate_srs(score, 0, 2.5)
        mode_data = _normalize_mode_data(None, mode, data.role_played)
        role_key = _role_key(data.role_played)
        mode_data["best"] = score
        if data.is_completed and _session_passed_mode(mode, score, session_avg_rt):
            mode_data["streak"] = 1
            mode_data["total_success_count"] = 1
            if role_key:
                mode_data["role_success_counts"][role_key] = 1
            mode_data["success_count"] = _effective_success_count(mode_data, mode)
            mode_data["last_success_at"] = now.isoformat()
        mode_data["passed"] = (
            mode_data["success_count"]
            >= MODE_UNLOCK_RULES.get(mode, {}).get("successes", 1)
        )
        if mode_data["passed"]:
            mode_data["passed_at"] = now.isoformat()
        mode_scores = {str(mode): mode_data}
        
        progress = UserProgress(
            user_id=user.id,
            conversation_id=data.conversation_id,
            role_played=data.role_played,
            completed_lines=data.completed_lines,
            total_lines=data.total_lines,
            is_completed=data.is_completed,
            pronunciation_score=score,
            best_score=score,
            streak_perfect=streak,
            mastery_level=_calculate_mastery(1, score, streak, history),
            scores_history=history,
            current_mode=_calculate_current_mode(mode_scores, now=now),
            mode_scores=mode_scores,
            response_times=new_response_times,
            avg_response_time=session_avg_rt,
            review_interval=new_interval,
            ease_factor=new_ef,
            next_review_at=now + timedelta(days=new_interval),
            last_practiced_at=now
        )
        db.add(progress)
        await db.commit()
        await db.refresh(progress)

    return _to_response(progress)


@router.get("", response_model=list[ProgressResponse])
async def get_progress(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserProgress, Conversation)
        .join(Conversation, UserProgress.conversation_id == Conversation.id)
        .where(UserProgress.user_id == user.id)
        .order_by(UserProgress.last_practiced_at.desc())
        .limit(50)
    )
    items = result.all()
    return [_to_response(p, c) for p, c in items]


@router.get("/stats", response_model=ProgressStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = await db.execute(
        select(func.count(UserProgress.id)).where(UserProgress.user_id == user.id)
    )
    total_practiced = total.scalar()

    completed = await db.execute(
        select(func.count(UserProgress.id)).where(
            UserProgress.user_id == user.id,
            UserProgress.is_completed == True,
        )
    )
    total_completed = completed.scalar()

    avg = await db.execute(
        select(func.avg(UserProgress.pronunciation_score)).where(
            UserProgress.user_id == user.id,
            UserProgress.pronunciation_score.isnot(None),
        )
    )
    avg_score = avg.scalar()

    mastered = await db.execute(
        select(func.count(UserProgress.id)).where(
            UserProgress.user_id == user.id,
            UserProgress.mastery_level >= 95.0,
        )
    )
    total_mastered = mastered.scalar()

    overall = await db.execute(
        select(func.avg(UserProgress.mastery_level)).where(
            UserProgress.user_id == user.id,
            UserProgress.mastery_level > 0,
        )
    )
    overall_mastery = overall.scalar()

    due = await db.execute(
        select(func.count(UserProgress.id)).where(
            UserProgress.user_id == user.id,
            UserProgress.next_review_at <= datetime.now(timezone.utc)
        )
    )
    due_count = due.scalar()

    recent = await db.execute(
        select(UserProgress, Conversation)
        .join(Conversation, UserProgress.conversation_id == Conversation.id)
        .where(UserProgress.user_id == user.id)
        .order_by(UserProgress.last_practiced_at.desc())
        .limit(10)
    )
    recent_items = recent.all()

    return ProgressStatsResponse(
        total_practiced=total_practiced,
        total_completed=total_completed,
        average_score=round(avg_score, 1) if avg_score else None,
        streak_days=user.streak_count,
        total_mastered=total_mastered or 0,
        overall_mastery=round(overall_mastery, 1) if overall_mastery else 0.0,
        due_for_review=due_count or 0,
        recent_progress=[_to_response(p, c) for p, c in recent_items],
    )


@router.get("/mastery")
async def get_mastery_map(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserProgress).where(UserProgress.user_id == user.id)
    )
    items = result.scalars().all()

    mastery_map = {}
    for p in items:
        conv_id = str(p.conversation_id)
        if conv_id not in mastery_map:
            mastery_map[conv_id] = {
                "mastery_level": 0,
                "practice_count": 0,
                "best_score": 0,
                "streak_perfect": 0,
                "pronunciation_score": 0,
                "current_mode": 1,
                "avg_response_time": 0,
                "mode_scores": {},
            }

        item = mastery_map[conv_id]
        item["mastery_level"] = max(item["mastery_level"], p.mastery_level)
        item["practice_count"] += p.practice_count
        item["best_score"] = max(item["best_score"], p.best_score)
        item["streak_perfect"] = max(item["streak_perfect"], p.streak_perfect)
        item["pronunciation_score"] = max(item["pronunciation_score"], p.pronunciation_score or 0)
        item["avg_response_time"] = (
            min(item["avg_response_time"], p.avg_response_time)
            if item["avg_response_time"] and p.avg_response_time
            else item["avg_response_time"] or p.avg_response_time
        )
        item["mode_scores"] = _merge_mode_scores(item["mode_scores"], p.mode_scores or {}, p.role_played.value)
        item["current_mode"] = _calculate_current_mode(item["mode_scores"])

    return mastery_map


@router.get("/review")
async def get_review_list(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.conversation import Conversation
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserProgress, Conversation)
        .join(Conversation, UserProgress.conversation_id == Conversation.id)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.next_review_at <= now
        )
        .order_by(UserProgress.next_review_at.asc())
    )
    items = result.all()
    review_items = []
    for p, c in items:
        overdue = (now - p.next_review_at).total_seconds() / 86400
        review_items.append({
            "progress": _to_response(p),
            "conversation_title": c.title,
            "conversation_situation": c.situation,
            "overdue_days": round(overdue, 1)
        })
    return review_items
