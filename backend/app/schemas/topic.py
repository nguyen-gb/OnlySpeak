from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class TopicCreate(BaseModel):
    title: str
    description: Optional[str] = None
    icon: str = "💬"
    level: str = "beginner"
    sort_order: int = 0
    is_published: bool = False


class TopicUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    level: Optional[str] = None
    sort_order: Optional[int] = None
    is_published: Optional[bool] = None


class TopicResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    icon: str
    level: str
    sort_order: int
    is_published: bool
    created_at: datetime
    conversation_count: int = 0

    class Config:
        from_attributes = True
