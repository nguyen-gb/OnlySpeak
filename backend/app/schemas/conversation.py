from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


LevelValue = Literal["beginner", "intermediate", "advanced"]
SpeakerValue = Literal["A", "B"]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ConversationLineCreate(StrictSchema):
    speaker: SpeakerValue
    line_order: int = Field(ge=1, le=10_000)
    text_en: str = Field(min_length=1, max_length=2_000)
    pronunciation_hint: str | None = Field(default=None, max_length=2_000)


class ConversationLineUpdate(StrictSchema):
    speaker: SpeakerValue | None = None
    line_order: int | None = Field(default=None, ge=1, le=10_000)
    text_en: str | None = Field(default=None, min_length=1, max_length=2_000)
    pronunciation_hint: str | None = Field(default=None, max_length=2_000)

    @field_validator("speaker", "line_order", "text_en")
    @classmethod
    def required_fields_cannot_be_null(cls, value):
        if value is None:
            raise ValueError("field cannot be null")
        return value


class ConversationLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    speaker: str
    line_order: int
    text_en: str
    pronunciation_hint: str | None = None
    audio_url: str | None = None


class ConversationCreate(StrictSchema):
    topic_id: UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5_000)
    situation: str | None = Field(default=None, max_length=5_000)
    role_a_name: str = Field(default="Person A", min_length=1, max_length=100)
    role_b_name: str = Field(default="Person B", min_length=1, max_length=100)
    level: LevelValue = "beginner"
    sort_order: int = Field(default=0, ge=0, le=100_000)
    is_published: bool = False
    lines: list[ConversationLineCreate] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_lines(self):
        orders = [line.line_order for line in self.lines]
        if len(orders) != len(set(orders)):
            raise ValueError("line_order must be unique within a conversation")
        if self.is_published:
            speakers = {line.speaker for line in self.lines}
            if speakers != {"A", "B"}:
                raise ValueError(
                    "a published conversation must contain at least one line for each role"
                )
        return self


class ConversationUpdate(StrictSchema):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5_000)
    situation: str | None = Field(default=None, max_length=5_000)
    role_a_name: str | None = Field(default=None, min_length=1, max_length=100)
    role_b_name: str | None = Field(default=None, min_length=1, max_length=100)
    level: LevelValue | None = None
    sort_order: int | None = Field(default=None, ge=0, le=100_000)
    is_published: bool | None = None

    @field_validator(
        "title",
        "role_a_name",
        "role_b_name",
        "level",
        "sort_order",
        "is_published",
    )
    @classmethod
    def required_fields_cannot_be_null(cls, value):
        if value is None:
            raise ValueError("field cannot be null")
        return value


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    topic_id: UUID
    title: str
    description: str | None = None
    situation: str | None = None
    role_a_name: str
    role_b_name: str
    level: str
    sort_order: int
    is_published: bool
    created_at: datetime
    lines: list[ConversationLineResponse] = Field(default_factory=list)
    line_count: int = 0
