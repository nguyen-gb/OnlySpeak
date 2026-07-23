from __future__ import annotations

import logging

import httpx
from pydantic import ValidationError

from app.config import settings
from app.schemas.chat import FreeTalkResponse


logger = logging.getLogger(__name__)
GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

FREE_TALK_RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "reply": {
            "type": "string",
            "description": "A short natural response spoken by the conversation partner.",
        },
        "evaluation": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "score": {"type": "integer", "minimum": 0, "maximum": 100},
                "grammar_feedback": {"type": "string"},
                "vocabulary_tip": {"type": "string"},
                "overall_feedback": {"type": "string"},
            },
            "required": [
                "score",
                "grammar_feedback",
                "vocabulary_tip",
                "overall_feedback",
            ],
        },
    },
    "required": ["reply", "evaluation"],
}


class AIServiceError(RuntimeError):
    pass


class AIConfigurationError(AIServiceError):
    pass


class AIProviderError(AIServiceError):
    pass


class AIProviderTimeoutError(AIProviderError):
    pass


class AIResponseError(AIProviderError):
    pass


class AIContentBlockedError(AIServiceError):
    pass


class AIService:
    async def get_free_talk_response(
        self,
        user_input: str,
        history: list[dict[str, str]],
        situation: str,
        partner_role: str,
    ) -> FreeTalkResponse:
        api_key = settings.GEMINI_API_KEY.get_secret_value()
        if not api_key:
            raise AIConfigurationError("Gemini API key is not configured")

        system_prompt = (
            "You are an English conversation partner and language coach. "
            f"The situation is: {situation[:2000]}. "
            f"You are playing the role of: {partner_role[:200]}. "
            "Stay in that role, respond in simple natural English, and keep the reply concise. "
            "Evaluate only the user's latest message for grammar, vocabulary, and naturalness. "
            "Give constructive, encouraging, specific feedback. The score must be an integer from 0 to 100."
        )

        contents = [
            {
                "role": message["role"],
                "parts": [{"text": message["content"]}],
            }
            for message in history
        ]
        contents.append({"role": "user", "parts": [{"text": user_input}]})

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 800,
                "responseFormat": {
                    "text": {
                        "mimeType": "application/json",
                        "schema": FREE_TALK_RESPONSE_SCHEMA,
                    }
                },
            },
        }
        url = f"{GEMINI_API_ROOT}/{settings.GEMINI_MODEL}:generateContent"

        try:
            async with httpx.AsyncClient(
                timeout=settings.PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                )
        except httpx.TimeoutException as exc:
            logger.warning("Gemini request timed out")
            raise AIProviderTimeoutError("Gemini request timed out") from exc
        except httpx.RequestError as exc:
            logger.warning("Gemini request failed: %s", type(exc).__name__)
            raise AIProviderError("Gemini is unavailable") from exc

        if response.status_code in {401, 403}:
            logger.error("Gemini rejected server credentials with status %s", response.status_code)
            raise AIConfigurationError("Gemini credentials were rejected")
        if response.status_code in {408, 504}:
            raise AIProviderTimeoutError("Gemini request timed out")
        if response.status_code == 429 or response.status_code >= 500:
            logger.warning("Gemini unavailable with status %s", response.status_code)
            raise AIProviderError("Gemini is temporarily unavailable")
        if response.status_code >= 400:
            logger.warning("Gemini rejected request with status %s", response.status_code)
            raise AIProviderError("Gemini rejected the request")

        try:
            data = response.json()
        except ValueError as exc:
            raise AIResponseError("Gemini returned malformed JSON") from exc
        if not isinstance(data, dict):
            raise AIResponseError("Gemini returned an invalid response shape")

        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            prompt_feedback = data.get("promptFeedback")
            block_reason = (
                prompt_feedback.get("blockReason")
                if isinstance(prompt_feedback, dict)
                else None
            )
            if block_reason:
                raise AIContentBlockedError("Message was blocked by safety filters")
            raise AIResponseError("Gemini returned no response candidate")

        candidate = candidates[0]
        if not isinstance(candidate, dict):
            raise AIResponseError("Gemini returned an invalid response candidate")
        finish_reason = candidate.get("finishReason")
        if finish_reason in {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
            raise AIContentBlockedError("Message was blocked by safety filters")

        content = candidate.get("content")
        if not isinstance(content, dict):
            raise AIResponseError("Gemini returned an invalid response shape")
        parts = content.get("parts")
        if not isinstance(parts, list):
            raise AIResponseError("Gemini returned an invalid response shape")
        text_response = "".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and not part.get("thought", False)
        ).strip()
        if not text_response:
            raise AIResponseError("Gemini returned an empty response")

        try:
            return FreeTalkResponse.model_validate_json(text_response)
        except (ValidationError, ValueError) as exc:
            logger.warning("Gemini response failed schema validation")
            raise AIResponseError("Gemini returned an invalid structured response") from exc


ai_service = AIService()
