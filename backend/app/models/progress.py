import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.mutable import MutableDict, MutableList

from app.database import Base
from app.models.conversation import Speaker


class UserProgress(Base):
    __tablename__ = "user_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "conversation_id",
            "role_played",
            name="uq_user_progress_user_conversation_role",
        ),
        CheckConstraint("completed_lines >= 0", name="ck_user_progress_completed_lines_nonnegative"),
        CheckConstraint("total_lines >= 0", name="ck_user_progress_total_lines_nonnegative"),
        CheckConstraint("completed_lines <= total_lines", name="ck_user_progress_lines_in_range"),
        CheckConstraint(
            "pronunciation_score IS NULL OR (pronunciation_score >= 0 AND pronunciation_score <= 100)",
            name="ck_user_progress_pronunciation_score_range",
        ),
        CheckConstraint("practice_count >= 0", name="ck_user_progress_practice_count_nonnegative"),
        CheckConstraint("best_score >= 0 AND best_score <= 100", name="ck_user_progress_best_score_range"),
        CheckConstraint("mastery_level >= 0 AND mastery_level <= 100", name="ck_user_progress_mastery_range"),
        CheckConstraint("current_mode >= 1 AND current_mode <= 5", name="ck_user_progress_current_mode_range"),
        CheckConstraint("review_interval >= 0", name="ck_user_progress_review_interval_nonnegative"),
        CheckConstraint("ease_factor >= 1.3", name="ck_user_progress_ease_factor_minimum"),
        CheckConstraint("srs_repetitions >= 0", name="ck_user_progress_srs_repetitions_nonnegative"),
        Index("ix_user_progress_user_last_practiced", "user_id", "last_practiced_at"),
        Index("ix_user_progress_user_next_review", "user_id", "next_review_at"),
        Index("ix_user_progress_conversation_id", "conversation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_played: Mapped[Speaker] = mapped_column(SAEnum(Speaker), nullable=False)
    completed_lines: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_lines: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pronunciation_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Number of completed sessions represented by this aggregate. Incomplete
    # attempts are kept in practice_attempts but do not advance learning state.
    practice_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    streak_perfect: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mastery_level: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    scores_history: Mapped[list | None] = mapped_column(MutableList.as_mutable(JSON), default=list, nullable=True)

    # ── Practice Mode System ──
    # 1=Shadow, 2=Read&Speak, 3=Listen&Respond, 4=SpeedDrill, 5=FreeTalk
    current_mode: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Per-mode tracking: { "1": {"best": 85, "streak": 2, "passed": false}, ... }
    mode_scores: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(JSON), default=dict, nullable=True)

    # ── Response Time Tracking ──
    # List of response times in seconds for last 20 lines
    response_times: Mapped[list | None] = mapped_column(MutableList.as_mutable(JSON), default=list, nullable=True)
    avg_response_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # ── Spaced Repetition (SM-2) ──
    next_review_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_interval: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    srs_repetitions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_practiced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", back_populates="progress")
    conversation = relationship("Conversation", back_populates="progress")


class PracticeAttempt(Base):
    """Immutable record of one client submission.

    ``client_attempt_id`` is generated once by the client and reused for a
    retry. The user-scoped unique constraint makes awarding XP idempotent.
    """

    __tablename__ = "practice_attempts"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_attempt_id",
            name="uq_practice_attempt_user_client_id",
        ),
        CheckConstraint("completed_lines >= 0", name="ck_practice_attempt_completed_lines_nonnegative"),
        CheckConstraint("total_lines >= 0", name="ck_practice_attempt_total_lines_nonnegative"),
        CheckConstraint("completed_lines <= total_lines", name="ck_practice_attempt_lines_in_range"),
        CheckConstraint(
            "pronunciation_score IS NULL OR (pronunciation_score >= 0 AND pronunciation_score <= 100)",
            name="ck_practice_attempt_pronunciation_score_range",
        ),
        CheckConstraint("practice_mode >= 1 AND practice_mode <= 5", name="ck_practice_attempt_mode_range"),
        CheckConstraint("avg_response_time >= 0", name="ck_practice_attempt_avg_response_time_nonnegative"),
        CheckConstraint("xp_awarded >= 0", name="ck_practice_attempt_xp_nonnegative"),
        CheckConstraint("session_count >= 1", name="ck_practice_attempt_session_count_positive"),
        CheckConstraint(
            "NOT is_completed OR pronunciation_score IS NOT NULL",
            name="ck_practice_attempt_completed_has_score",
        ),
        Index("ix_practice_attempt_user_created", "user_id", "created_at"),
        Index("ix_practice_attempt_conversation_id", "conversation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_played: Mapped[Speaker] = mapped_column(SAEnum(Speaker), nullable=False)
    completed_lines: Mapped[int] = mapped_column(Integer, nullable=False)
    total_lines: Mapped[int] = mapped_column(Integer, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pronunciation_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    practice_mode: Mapped[int] = mapped_column(Integer, nullable=False)
    response_times: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    avg_response_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Legacy migrations can summarize several historical sessions in one row.
    session_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_legacy: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", back_populates="practice_attempts")
    conversation = relationship("Conversation", back_populates="practice_attempts")
