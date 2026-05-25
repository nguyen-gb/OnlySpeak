import uuid
from datetime import datetime, timezone

from sqlalchemy import Integer, Boolean, Float, DateTime, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.mutable import MutableDict, MutableList

from app.database import Base
from app.models.conversation import Speaker


class UserProgress(Base):
    __tablename__ = "user_progress"

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
    practice_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
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

