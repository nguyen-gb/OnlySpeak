"""Add immutable practice attempts and domain constraints.

Revision ID: c91d8b7e4a21
Revises: 667e67610e1c
Create Date: 2026-07-19
"""

from __future__ import annotations

import math
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c91d8b7e4a21"
down_revision: Union[str, None] = "667e67610e1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODE_SUCCESS_REQUIREMENTS = {1: 3, 2: 3, 3: 3, 4: 5, 5: 2}
MODE_ROLE_CAPS = {1: 2, 2: 2, 3: 2, 4: 3, 5: 1}


def _clamp(value, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return minimum
    if not math.isfinite(number):
        return minimum
    return min(max(number, minimum), maximum)


def _integer(value, minimum: int = 0) -> int:
    try:
        return max(int(value), minimum)
    except (TypeError, ValueError, OverflowError):
        return minimum


def _uuid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _datetime(value) -> datetime:
    if isinstance(value, datetime):
        result = value
    elif value is None:
        result = datetime.now(timezone.utc)
    else:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if result.tzinfo is None:
        return result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def _timestamp(value) -> datetime | None:
    if value is None:
        return None
    try:
        return _datetime(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _number_list(value, minimum: float, maximum: float, limit: int) -> list[float]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return []
    if not isinstance(value, list):
        return []
    return [_clamp(item, minimum, maximum) for item in value][-limit:]


def _role(value) -> str | None:
    value = getattr(value, "value", value)
    normalized = str(value).rsplit(".", 1)[-1].upper()
    return normalized if normalized in {"A", "B"} else None


def _infer_srs_repetitions(
    practice_count: int,
    next_review_at,
    review_interval: float,
) -> int:
    if practice_count <= 0 or next_review_at is None:
        return 0
    return 1 if review_interval <= 1 else 2


def _merge_mode_scores(rows: list[sa.RowMapping]) -> dict[str, dict]:
    """Merge legacy duplicate aggregates without discarding unlock evidence."""

    merged: dict[str, dict] = {}
    for row in reversed(rows):
        raw_modes = row.get("mode_scores")
        if isinstance(raw_modes, str):
            try:
                raw_modes = json.loads(raw_modes)
            except (TypeError, ValueError):
                raw_modes = None
        if not isinstance(raw_modes, dict):
            continue
        row_role = _role(row.get("role_played"))
        for raw_key, raw_value in raw_modes.items():
            try:
                mode = int(raw_key)
            except (TypeError, ValueError):
                continue
            if mode not in MODE_SUCCESS_REQUIREMENTS or not isinstance(raw_value, dict):
                continue

            key = str(mode)
            target = merged.setdefault(
                key,
                {
                    "best": 0.0,
                    "streak": 0,
                    "success_count": 0,
                    "total_success_count": 0,
                    "role_success_counts": {"A": 0, "B": 0},
                    "passed": False,
                    "passed_at": None,
                    "last_success_at": None,
                },
            )
            target["best"] = max(target["best"], _clamp(raw_value.get("best"), 0, 100))
            target["streak"] = max(
                target["streak"], _integer(raw_value.get("streak"))
            )

            legacy_count = _integer(raw_value.get("success_count"))
            raw_counts = raw_value.get("role_success_counts")
            raw_counts = raw_counts if isinstance(raw_counts, dict) else {}
            counts = {
                role: _integer(raw_counts.get(role)) for role in ("A", "B")
            }
            if row_role and not any(counts.values()) and legacy_count:
                counts[row_role] = legacy_count
            for role in ("A", "B"):
                target["role_success_counts"][role] += counts[role]
            target["total_success_count"] += max(
                _integer(raw_value.get("total_success_count")),
                legacy_count,
                sum(counts.values()),
            )

            passed_at = _timestamp(raw_value.get("passed_at"))
            current_passed_at = _timestamp(target.get("passed_at"))
            if passed_at is not None and (
                current_passed_at is None or passed_at < current_passed_at
            ):
                target["passed_at"] = passed_at.isoformat()
            last_success = _timestamp(raw_value.get("last_success_at"))
            current_last_success = _timestamp(target.get("last_success_at"))
            if last_success is not None and (
                current_last_success is None or last_success > current_last_success
            ):
                target["last_success_at"] = last_success.isoformat()

    for key, data in merged.items():
        mode = int(key)
        role_cap = MODE_ROLE_CAPS[mode]
        effective_count = sum(
            min(_integer(data["role_success_counts"].get(role)), role_cap)
            for role in ("A", "B")
        )
        required = MODE_SUCCESS_REQUIREMENTS[mode]
        data["success_count"] = min(effective_count, required)
        data["passed"] = data["success_count"] >= required
        if not data["passed"]:
            data["passed_at"] = None
    return merged


def _deduplicate_and_sanitize_progress(bind) -> None:
    rows = list(
        bind.execute(
            sa.text(
                """
                SELECT id, user_id, conversation_id, role_played,
                       completed_lines, total_lines, is_completed,
                       pronunciation_score, practice_count, best_score,
                       streak_perfect, mastery_level, current_mode,
                       scores_history, mode_scores, response_times,
                       avg_response_time, review_interval, ease_factor,
                       next_review_at, last_practiced_at, created_at
                FROM user_progress
                ORDER BY last_practiced_at DESC, created_at DESC
                """
            )
        ).mappings()
    )
    grouped = defaultdict(list)
    for row in rows:
        grouped[
            (str(row["user_id"]), str(row["conversation_id"]), str(row["role_played"]))
        ].append(row)

    for duplicate_rows in grouped.values():
        keeper = duplicate_rows[0]
        completed_lines = max(
            _integer(row["completed_lines"]) for row in duplicate_rows
        )
        total_lines = max(
            [completed_lines]
            + [_integer(row["total_lines"]) for row in duplicate_rows]
        )
        practice_count = sum(
            _integer(row["practice_count"]) for row in duplicate_rows
        )
        is_completed = any(bool(row["is_completed"]) for row in duplicate_rows)
        score = next(
            (
                row["pronunciation_score"]
                for row in duplicate_rows
                if row["pronunciation_score"] is not None
            ),
            None,
        )
        score = None if score is None else _clamp(score, 0, 100)
        if is_completed and score is None:
            score = 0.0

        scores_history: list[float] = []
        response_times: list[float] = []
        for row in reversed(duplicate_rows):
            scores_history.extend(
                _number_list(row["scores_history"], 0, 100, 20)
            )
            response_times.extend(
                _number_list(row["response_times"], 0, 300, 50)
            )
        scores_history = scores_history[-20:]
        response_times = response_times[-50:]
        next_review_at = next(
            (
                _timestamp(row["next_review_at"])
                for row in duplicate_rows
                if _timestamp(row["next_review_at"]) is not None
            ),
            None,
        )
        review_interval = max(
            _clamp(row["review_interval"], 0, 3650) for row in duplicate_rows
        )
        srs_repetitions = _infer_srs_repetitions(
            practice_count,
            next_review_at,
            review_interval,
        )
        average_response_time = (
            sum(response_times) / len(response_times)
            if response_times
            else _clamp(keeper["avg_response_time"], 0, 300)
        )

        update_statement = sa.text(
            """
            UPDATE user_progress
            SET completed_lines = :completed_lines,
                total_lines = :total_lines,
                is_completed = :is_completed,
                pronunciation_score = :score,
                practice_count = :practice_count,
                best_score = :best_score,
                streak_perfect = :streak_perfect,
                mastery_level = :mastery_level,
                current_mode = :current_mode,
                scores_history = :scores_history,
                mode_scores = :mode_scores,
                response_times = :response_times,
                avg_response_time = :avg_response_time,
                review_interval = :review_interval,
                ease_factor = :ease_factor,
                srs_repetitions = :srs_repetitions,
                next_review_at = :next_review_at,
                created_at = :created_at
            WHERE id = :id
            """
        ).bindparams(
            sa.bindparam("scores_history", type_=sa.JSON()),
            sa.bindparam("mode_scores", type_=sa.JSON()),
            sa.bindparam("response_times", type_=sa.JSON()),
        )

        bind.execute(
            update_statement,
            {
                "id": keeper["id"],
                "completed_lines": completed_lines,
                "total_lines": total_lines,
                "is_completed": is_completed,
                "score": score,
                "practice_count": practice_count,
                "best_score": max(
                    _clamp(row["best_score"], 0, 100) for row in duplicate_rows
                ),
                "streak_perfect": max(
                    _integer(row["streak_perfect"]) for row in duplicate_rows
                ),
                "mastery_level": max(
                    _clamp(row["mastery_level"], 0, 100)
                    for row in duplicate_rows
                ),
                "current_mode": int(
                    max(
                        _clamp(row["current_mode"], 1, 5)
                        for row in duplicate_rows
                    )
                ),
                "scores_history": scores_history,
                "mode_scores": _merge_mode_scores(duplicate_rows),
                "response_times": response_times,
                "avg_response_time": round(average_response_time, 2),
                "review_interval": review_interval,
                "ease_factor": max(
                    _clamp(row["ease_factor"], 1.3, 5.0)
                    for row in duplicate_rows
                ),
                "srs_repetitions": srs_repetitions,
                "next_review_at": next_review_at,
                "created_at": min(
                    _datetime(row["created_at"]) for row in duplicate_rows
                ),
            },
        )
        for duplicate in duplicate_rows[1:]:
            bind.execute(
                sa.text("DELETE FROM user_progress WHERE id = :id"),
                {"id": duplicate["id"]},
            )


def _normalize_line_orders(bind) -> None:
    rows = list(
        bind.execute(
            sa.text(
                """
                SELECT id, conversation_id, line_order, created_at
                FROM conversation_lines
                ORDER BY conversation_id, line_order, created_at, id
                """
            )
        ).mappings()
    )
    grouped = defaultdict(list)
    for row in rows:
        grouped[str(row["conversation_id"])].append(row)
    for lines in grouped.values():
        # Use temporary negative values so this remains safe if a deployment
        # partially added a uniqueness rule manually before this migration.
        for index, line in enumerate(lines, start=1):
            bind.execute(
                sa.text(
                    "UPDATE conversation_lines SET line_order = :value WHERE id = :id"
                ),
                {"id": line["id"], "value": -index},
            )
        for index, line in enumerate(lines, start=1):
            bind.execute(
                sa.text(
                    "UPDATE conversation_lines SET line_order = :value WHERE id = :id"
                ),
                {"id": line["id"], "value": index},
            )


def _speaker_type(bind):
    if bind.dialect.name == "postgresql":
        return postgresql.ENUM("A", "B", name="speaker", create_type=False)
    return sa.Enum("A", "B", name="speaker")


def _backfill_legacy_attempts(bind, speaker_type) -> None:
    rows = list(
        bind.execute(
            sa.text(
                """
                SELECT user_id, conversation_id, role_played,
                       completed_lines, total_lines, is_completed,
                       pronunciation_score, practice_count,
                       avg_response_time, last_practiced_at
                FROM user_progress
                """
            )
        ).mappings()
    )
    if not rows:
        return
    attempts = sa.table(
        "practice_attempts",
        sa.column("id", sa.Uuid()),
        sa.column("client_attempt_id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("conversation_id", sa.Uuid()),
        sa.column("role_played", speaker_type),
        sa.column("completed_lines", sa.Integer()),
        sa.column("total_lines", sa.Integer()),
        sa.column("is_completed", sa.Boolean()),
        sa.column("pronunciation_score", sa.Float()),
        sa.column("practice_mode", sa.Integer()),
        sa.column("response_times", sa.JSON()),
        sa.column("avg_response_time", sa.Float()),
        sa.column("xp_awarded", sa.Integer()),
        sa.column("session_count", sa.Integer()),
        sa.column("is_legacy", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    values = []
    for row in rows:
        completed = bool(row["is_completed"])
        score = row["pronunciation_score"]
        if completed and score is None:
            score = 0.0
        values.append(
            {
                "id": uuid.uuid4(),
                "client_attempt_id": uuid.uuid4(),
                "user_id": _uuid(row["user_id"]),
                "conversation_id": _uuid(row["conversation_id"]),
                "role_played": getattr(row["role_played"], "value", row["role_played"]),
                "completed_lines": _integer(row["completed_lines"]),
                "total_lines": max(
                    _integer(row["total_lines"]),
                    _integer(row["completed_lines"]),
                ),
                "is_completed": completed,
                "pronunciation_score": score,
                "practice_mode": 1,
                "response_times": [],
                "avg_response_time": max(float(row["avg_response_time"] or 0), 0),
                "xp_awarded": 0,
                "session_count": max(_integer(row["practice_count"]), 1),
                "is_legacy": True,
                "created_at": _datetime(row["last_practiced_at"]),
            }
        )
    bind.execute(attempts.insert(), values)


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column(
        "user_progress",
        sa.Column(
            "srs_repetitions",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    _deduplicate_and_sanitize_progress(bind)
    _normalize_line_orders(bind)

    bind.execute(sa.text("UPDATE topics SET sort_order = 0 WHERE sort_order < 0"))
    bind.execute(
        sa.text("UPDATE conversations SET sort_order = 0 WHERE sort_order < 0")
    )
    # A public conversation must support either role. Existing invalid content
    # is retained for admins to repair, but removed from the public curriculum.
    bind.execute(
        sa.text(
            """
            UPDATE conversations
            SET is_published = false
            WHERE is_published = true
              AND (
                NOT EXISTS (
                    SELECT 1 FROM conversation_lines AS line_a
                    WHERE line_a.conversation_id = conversations.id
                      AND line_a.speaker = 'A'
                )
                OR NOT EXISTS (
                    SELECT 1 FROM conversation_lines AS line_b
                    WHERE line_b.conversation_id = conversations.id
                      AND line_b.speaker = 'B'
                )
              )
            """
        )
    )

    speaker_type = _speaker_type(bind)
    op.create_table(
        "practice_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_attempt_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("role_played", speaker_type, nullable=False),
        sa.Column("completed_lines", sa.Integer(), nullable=False),
        sa.Column("total_lines", sa.Integer(), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False),
        sa.Column("pronunciation_score", sa.Float(), nullable=True),
        sa.Column("practice_mode", sa.Integer(), nullable=False),
        sa.Column("response_times", sa.JSON(), nullable=False),
        sa.Column("avg_response_time", sa.Float(), nullable=False),
        sa.Column("xp_awarded", sa.Integer(), nullable=False),
        sa.Column("session_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "completed_lines >= 0",
            name="ck_practice_attempt_completed_lines_nonnegative",
        ),
        sa.CheckConstraint(
            "total_lines >= 0",
            name="ck_practice_attempt_total_lines_nonnegative",
        ),
        sa.CheckConstraint(
            "completed_lines <= total_lines",
            name="ck_practice_attempt_lines_in_range",
        ),
        sa.CheckConstraint(
            "pronunciation_score IS NULL OR (pronunciation_score >= 0 AND pronunciation_score <= 100)",
            name="ck_practice_attempt_pronunciation_score_range",
        ),
        sa.CheckConstraint(
            "practice_mode >= 1 AND practice_mode <= 5",
            name="ck_practice_attempt_mode_range",
        ),
        sa.CheckConstraint(
            "avg_response_time >= 0",
            name="ck_practice_attempt_avg_response_time_nonnegative",
        ),
        sa.CheckConstraint(
            "xp_awarded >= 0", name="ck_practice_attempt_xp_nonnegative"
        ),
        sa.CheckConstraint(
            "session_count >= 1",
            name="ck_practice_attempt_session_count_positive",
        ),
        sa.CheckConstraint(
            "NOT is_completed OR pronunciation_score IS NOT NULL",
            name="ck_practice_attempt_completed_has_score",
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "client_attempt_id",
            name="uq_practice_attempt_user_client_id",
        ),
    )
    op.create_index(
        "ix_practice_attempt_user_created",
        "practice_attempts",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_practice_attempt_conversation_id",
        "practice_attempts",
        ["conversation_id"],
    )
    _backfill_legacy_attempts(bind, speaker_type)

    with op.batch_alter_table("topics") as batch_op:
        batch_op.create_check_constraint(
            "ck_topic_sort_order_nonnegative", "sort_order >= 0"
        )
    op.create_index(
        "ix_topic_published_sort",
        "topics",
        ["is_published", "sort_order"],
    )
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.create_check_constraint(
            "ck_conversation_sort_order_nonnegative", "sort_order >= 0"
        )
    op.create_index(
        "ix_conversation_topic_published_sort",
        "conversations",
        ["topic_id", "is_published", "sort_order"],
    )
    with op.batch_alter_table("conversation_lines") as batch_op:
        batch_op.create_unique_constraint(
            "uq_conversation_line_order", ["conversation_id", "line_order"]
        )
        batch_op.create_check_constraint(
            "ck_conversation_line_order_positive", "line_order >= 1"
        )
    with op.batch_alter_table("user_progress") as batch_op:
        batch_op.create_unique_constraint(
            "uq_user_progress_user_conversation_role",
            ["user_id", "conversation_id", "role_played"],
        )
        batch_op.create_check_constraint(
            "ck_user_progress_completed_lines_nonnegative", "completed_lines >= 0"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_total_lines_nonnegative", "total_lines >= 0"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_lines_in_range", "completed_lines <= total_lines"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_pronunciation_score_range",
            "pronunciation_score IS NULL OR (pronunciation_score >= 0 AND pronunciation_score <= 100)",
        )
        batch_op.create_check_constraint(
            "ck_user_progress_practice_count_nonnegative", "practice_count >= 0"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_best_score_range", "best_score >= 0 AND best_score <= 100"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_mastery_range", "mastery_level >= 0 AND mastery_level <= 100"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_current_mode_range", "current_mode >= 1 AND current_mode <= 5"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_review_interval_nonnegative", "review_interval >= 0"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_ease_factor_minimum", "ease_factor >= 1.3"
        )
        batch_op.create_check_constraint(
            "ck_user_progress_srs_repetitions_nonnegative", "srs_repetitions >= 0"
        )
    op.create_index(
        "ix_user_progress_user_last_practiced",
        "user_progress",
        ["user_id", "last_practiced_at"],
    )
    op.create_index(
        "ix_user_progress_user_next_review",
        "user_progress",
        ["user_id", "next_review_at"],
    )
    op.create_index(
        "ix_user_progress_conversation_id",
        "user_progress",
        ["conversation_id"],
    )
    with op.batch_alter_table("user_progress") as batch_op:
        batch_op.alter_column("srs_repetitions", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_user_progress_conversation_id", table_name="user_progress")
    op.drop_index("ix_user_progress_user_next_review", table_name="user_progress")
    op.drop_index("ix_user_progress_user_last_practiced", table_name="user_progress")
    with op.batch_alter_table("user_progress") as batch_op:
        batch_op.drop_constraint(
            "ck_user_progress_srs_repetitions_nonnegative", type_="check"
        )
        batch_op.drop_constraint("ck_user_progress_ease_factor_minimum", type_="check")
        batch_op.drop_constraint(
            "ck_user_progress_review_interval_nonnegative", type_="check"
        )
        batch_op.drop_constraint("ck_user_progress_current_mode_range", type_="check")
        batch_op.drop_constraint("ck_user_progress_mastery_range", type_="check")
        batch_op.drop_constraint("ck_user_progress_best_score_range", type_="check")
        batch_op.drop_constraint(
            "ck_user_progress_practice_count_nonnegative", type_="check"
        )
        batch_op.drop_constraint(
            "ck_user_progress_pronunciation_score_range", type_="check"
        )
        batch_op.drop_constraint("ck_user_progress_lines_in_range", type_="check")
        batch_op.drop_constraint(
            "ck_user_progress_total_lines_nonnegative", type_="check"
        )
        batch_op.drop_constraint(
            "ck_user_progress_completed_lines_nonnegative", type_="check"
        )
        batch_op.drop_constraint(
            "uq_user_progress_user_conversation_role", type_="unique"
        )
        batch_op.drop_column("srs_repetitions")
    with op.batch_alter_table("conversation_lines") as batch_op:
        batch_op.drop_constraint("ck_conversation_line_order_positive", type_="check")
        batch_op.drop_constraint("uq_conversation_line_order", type_="unique")
    op.drop_index(
        "ix_conversation_topic_published_sort", table_name="conversations"
    )
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.drop_constraint(
            "ck_conversation_sort_order_nonnegative", type_="check"
        )
    with op.batch_alter_table("topics") as batch_op:
        batch_op.drop_constraint("ck_topic_sort_order_nonnegative", type_="check")
    op.drop_index("ix_topic_published_sort", table_name="topics")
    op.drop_index(
        "ix_practice_attempt_conversation_id", table_name="practice_attempts"
    )
    op.drop_index("ix_practice_attempt_user_created", table_name="practice_attempts")
    op.drop_table("practice_attempts")
