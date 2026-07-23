import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Boolean,
    Integer,
    DateTime,
    Text,
    ForeignKey,
    Enum as SAEnum,
    CheckConstraint,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.topic import Level


class Speaker(str, enum.Enum):
    A = "A"
    B = "B"


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="ck_conversation_sort_order_nonnegative"),
        Index(
            "ix_conversation_topic_published_sort",
            "topic_id",
            "is_published",
            "sort_order",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("topics.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    situation: Mapped[str | None] = mapped_column(Text, nullable=True)
    role_a_name: Mapped[str] = mapped_column(
        String(100), default="Person A", nullable=False
    )
    role_b_name: Mapped[str] = mapped_column(
        String(100), default="Person B", nullable=False
    )
    level: Mapped[Level] = mapped_column(
        SAEnum(Level), default=Level.BEGINNER, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    topic = relationship("Topic", back_populates="conversations")
    lines = relationship(
        "ConversationLine",
        back_populates="conversation",
        lazy="raise",
        order_by="ConversationLine.line_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    progress = relationship(
        "UserProgress",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    practice_attempts = relationship(
        "PracticeAttempt",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ConversationLine(Base):
    __tablename__ = "conversation_lines"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "line_order",
            name="uq_conversation_line_order",
        ),
        CheckConstraint("line_order >= 1", name="ck_conversation_line_order_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    speaker: Mapped[Speaker] = mapped_column(SAEnum(Speaker), nullable=False)
    line_order: Mapped[int] = mapped_column(Integer, nullable=False)
    text_en: Mapped[str] = mapped_column(Text, nullable=False)
    pronunciation_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    conversation = relationship("Conversation", back_populates="lines")
