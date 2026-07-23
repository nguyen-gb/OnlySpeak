from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatHistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "model"]
    content: str = Field(min_length=1, max_length=2_000)

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class FreeTalkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: UUID
    user_input: str = Field(min_length=1, max_length=1_000)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=20)
    role_played: Literal["A", "B"] = "B"

    @field_validator("user_input", mode="before")
    @classmethod
    def strip_user_input(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ChatEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(ge=0, le=100)
    grammar_feedback: str = Field(min_length=1, max_length=500)
    vocabulary_tip: str = Field(min_length=1, max_length=500)
    overall_feedback: str = Field(min_length=1, max_length=500)


class FreeTalkResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply: str = Field(min_length=1, max_length=2_000)
    evaluation: ChatEvaluation
