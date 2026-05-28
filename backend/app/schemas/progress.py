from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class ProgressCreate(BaseModel):
    conversation_id: UUID
    role_played: str
    completed_lines: int
    total_lines: int
    is_completed: bool = False
    pronunciation_score: Optional[float] = None
    practice_mode: int = 1  # 1-5
    response_times: Optional[list[float]] = None  # per-line response times in seconds


class ProgressResponse(BaseModel):
    id: UUID
    user_id: UUID
    conversation_id: UUID
    conversation_title: str = ""
    conversation_situation: str = ""
    role_played: str
    completed_lines: int
    total_lines: int
    is_completed: bool
    pronunciation_score: Optional[float] = None
    practice_count: int
    best_score: float = 0.0
    streak_perfect: int = 0
    mastery_level: float = 0.0
    scores_history: Optional[list] = []
    current_mode: int = 1
    mode_scores: Optional[dict] = {}
    avg_response_time: float = 0.0
    next_review_at: Optional[datetime] = None
    review_interval: float = 1.0
    last_practiced_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class ProgressStatsResponse(BaseModel):
    total_practiced: int
    total_completed: int
    average_score: Optional[float] = None
    streak_days: int = 0
    total_mastered: int = 0
    overall_mastery: float = 0.0
    due_for_review: int = 0
    recent_progress: list[ProgressResponse] = []


class ReviewItem(BaseModel):
    """A conversation due for review today."""
    progress: ProgressResponse
    conversation_title: str = ""
    conversation_situation: str = ""
    overdue_days: float = 0.0
