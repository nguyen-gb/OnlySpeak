from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


ResponseTime = Annotated[float, Field(ge=0, le=300, allow_inf_nan=False)]


class ProgressCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt_id: UUID
    conversation_id: UUID
    role_played: Literal["A", "B"]
    completed_lines: int = Field(ge=0, le=200)
    total_lines: int = Field(ge=0, le=200)
    is_completed: bool = False
    pronunciation_score: float | None = Field(
        default=None,
        ge=0,
        le=100,
        allow_inf_nan=False,
    )
    practice_mode: int = Field(default=1, ge=1, le=5)
    response_times: list[ResponseTime] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_session_shape(self):
        if self.completed_lines > self.total_lines:
            raise ValueError("completed_lines cannot exceed total_lines")
        if self.is_completed and self.pronunciation_score is None:
            raise ValueError("pronunciation_score is required for a completed attempt")
        return self


class ProgressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    conversation_id: UUID
    conversation_title: str = ""
    conversation_situation: str = ""
    role_played: str
    completed_lines: int
    total_lines: int
    is_completed: bool
    pronunciation_score: float | None = None
    practice_count: int
    best_score: float = 0.0
    streak_perfect: int = 0
    mastery_level: float = 0.0
    scores_history: list[float] = Field(default_factory=list)
    current_mode: int = 1
    mode_scores: dict = Field(default_factory=dict)
    avg_response_time: float = 0.0
    next_review_at: datetime | None = None
    review_interval: float = 1.0
    last_practiced_at: datetime
    created_at: datetime


class ProgressSaveResponse(ProgressResponse):
    attempt_id: UUID
    xp_gained: int = 0
    was_duplicate: bool = False


class PracticeAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    attempt_id: UUID
    user_id: UUID
    conversation_id: UUID
    conversation_title: str = ""
    conversation_situation: str = ""
    role_played: str
    completed_lines: int
    total_lines: int
    is_completed: bool
    pronunciation_score: float | None = None
    practice_mode: int
    response_times: list[float] = Field(default_factory=list)
    avg_response_time: float = 0.0
    xp_gained: int = 0
    practice_count: int = 1
    is_legacy: bool = False
    last_practiced_at: datetime
    created_at: datetime


class ProgressStatsResponse(BaseModel):
    total_practiced: int
    total_completed: int
    average_score: float | None = None
    streak_days: int = 0
    total_mastered: int = 0
    overall_mastery: float = 0.0
    due_for_review: int = 0
    recent_progress: list[ProgressResponse] = Field(default_factory=list)


class ReviewItem(BaseModel):
    """A conversation due for review today."""

    progress: ProgressResponse
    conversation_title: str = ""
    conversation_situation: str = ""
    overdue_days: float = 0.0
