from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class ConversationLineCreate(BaseModel):
    speaker: str
    line_order: int
    text_en: str
    pronunciation_hint: Optional[str] = None


class ConversationLineUpdate(BaseModel):
    speaker: Optional[str] = None
    line_order: Optional[int] = None
    text_en: Optional[str] = None
    pronunciation_hint: Optional[str] = None


class ConversationLineResponse(BaseModel):
    id: UUID
    speaker: str
    line_order: int
    text_en: str
    pronunciation_hint: Optional[str] = None
    audio_url: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    topic_id: UUID
    title: str
    description: Optional[str] = None
    situation: Optional[str] = None
    role_a_name: str = "Person A"
    role_b_name: str = "Person B"
    level: str = "beginner"
    sort_order: int = 0
    is_published: bool = False
    lines: list[ConversationLineCreate] = []


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    situation: Optional[str] = None
    role_a_name: Optional[str] = None
    role_b_name: Optional[str] = None
    level: Optional[str] = None
    sort_order: Optional[int] = None
    is_published: Optional[bool] = None


class ConversationResponse(BaseModel):
    id: UUID
    topic_id: UUID
    title: str
    description: Optional[str] = None
    situation: Optional[str] = None
    role_a_name: str
    role_b_name: str
    level: str
    sort_order: int
    is_published: bool
    created_at: datetime
    lines: list[ConversationLineResponse] = []
    line_count: int = 0

    class Config:
        from_attributes = True
