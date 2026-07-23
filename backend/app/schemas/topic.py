from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


LevelValue = Literal["beginner", "intermediate", "advanced"]


class TopicCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5_000)
    icon: str = Field(default="💬", min_length=1, max_length=50)
    level: LevelValue = "beginner"
    sort_order: int = Field(default=0, ge=0, le=100_000)
    is_published: bool = False


class TopicUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5_000)
    icon: str | None = Field(default=None, min_length=1, max_length=50)
    level: LevelValue | None = None
    sort_order: int | None = Field(default=None, ge=0, le=100_000)
    is_published: bool | None = None

    @field_validator("title", "icon", "level", "sort_order", "is_published")
    @classmethod
    def required_fields_cannot_be_null(cls, value):
        if value is None:
            raise ValueError("field cannot be null")
        return value


class TopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None = None
    icon: str
    level: str
    sort_order: int
    is_published: bool
    created_at: datetime
    conversation_count: int = 0
