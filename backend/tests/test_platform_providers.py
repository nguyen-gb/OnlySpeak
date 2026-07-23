import asyncio
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

os.environ.setdefault(
    "ONLYSPEAK_SECRET_KEY",
    "platform-tests-only-secret-value-12345678901234567890",
)
os.environ.setdefault("ONLYSPEAK_ENVIRONMENT", "test")

import httpx
from pydantic import SecretStr

from app.config import settings
from app.services.ai_service import AIResponseError, AIService
from app.services.auth_service import GoogleProviderError, verify_google_token
from app.services.tts_service import (
    TTSServiceError,
    generate_audio,
    generate_conversation_audio,
)


class FakeAsyncClient:
    response: httpx.Response
    last_post: dict | None = None
    last_get: dict | None = None

    def __init__(self, **_: object) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, url: str, **kwargs: object) -> httpx.Response:
        type(self).last_post = {"url": url, **kwargs}
        return type(self).response

    async def get(self, url: str, **kwargs: object) -> httpx.Response:
        type(self).last_get = {"url": url, **kwargs}
        return type(self).response


class AIProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_gemini_uses_header_key_and_validates_structured_output(self) -> None:
        body = {
            "reply": "That sounds great!",
            "evaluation": {
                "score": 0,
                "grammar_feedback": "Review the verb tense.",
                "vocabulary_tip": "Try the word enjoyable.",
                "overall_feedback": "Keep practicing.",
            },
        }
        FakeAsyncClient.response = httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": json.dumps(body)}]}}
                ]
            },
        )

        with (
            patch("app.services.ai_service.httpx.AsyncClient", FakeAsyncClient),
            patch.object(settings, "GEMINI_API_KEY", SecretStr("provider-secret")),
        ):
            result = await AIService().get_free_talk_response(
                "I enjoyed it.", [], "At a cafe", "Barista"
            )

        self.assertEqual(result.evaluation.score, 0)
        request = FakeAsyncClient.last_post
        self.assertIsNotNone(request)
        self.assertNotIn("provider-secret", request["url"])
        self.assertEqual(request["headers"]["x-goog-api-key"], "provider-secret")
        response_format = request["json"]["generationConfig"]["responseFormat"]
        self.assertEqual(response_format["text"]["mimeType"], "application/json")

    async def test_invalid_gemini_shape_is_not_returned_to_client(self) -> None:
        FakeAsyncClient.response = httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]},
        )
        with (
            patch("app.services.ai_service.httpx.AsyncClient", FakeAsyncClient),
            patch.object(settings, "GEMINI_API_KEY", SecretStr("provider-secret")),
        ):
            with self.assertRaises(AIResponseError):
                await AIService().get_free_talk_response(
                    "Hello", [], "At a cafe", "Barista"
                )

    async def test_non_object_gemini_payload_is_a_typed_provider_error(self) -> None:
        FakeAsyncClient.response = httpx.Response(200, json=[])
        with (
            patch("app.services.ai_service.httpx.AsyncClient", FakeAsyncClient),
            patch.object(settings, "GEMINI_API_KEY", SecretStr("provider-secret")),
        ):
            with self.assertRaises(AIResponseError):
                await AIService().get_free_talk_response(
                    "Hello", [], "At a cafe", "Barista"
                )


class GoogleProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_google_identity_checks_audience_issuer_expiry_and_email(self) -> None:
        FakeAsyncClient.response = httpx.Response(
            200,
            json={
                "aud": "web-client",
                "iss": "https://accounts.google.com",
                "email_verified": "true",
                "exp": str(int(time.time()) + 300),
                "email": "learner@example.com",
                "name": "Learner",
                "picture": "https://example.com/avatar.png",
                "sub": "google-subject",
            },
        )
        with (
            patch("app.services.auth_service.httpx.AsyncClient", FakeAsyncClient),
            patch.object(settings, "GOOGLE_CLIENT_ID", "web-client"),
        ):
            identity = await verify_google_token("an-id-token-that-is-long-enough")

        self.assertEqual(identity["sub"], "google-subject")
        self.assertEqual(
            FakeAsyncClient.last_get["params"],
            {"id_token": "an-id-token-that-is-long-enough"},
        )

    async def test_google_network_failure_is_distinct_from_invalid_token(self) -> None:
        class FailingClient(FakeAsyncClient):
            async def get(self, url: str, **kwargs: object) -> httpx.Response:
                request = httpx.Request("GET", url)
                raise httpx.ConnectError("offline", request=request)

        with (
            patch("app.services.auth_service.httpx.AsyncClient", FailingClient),
            patch.object(settings, "GOOGLE_CLIENT_ID", "web-client"),
        ):
            with self.assertRaises(GoogleProviderError):
                await verify_google_token("an-id-token-that-is-long-enough")

    async def test_non_object_google_payload_is_a_typed_provider_error(self) -> None:
        FakeAsyncClient.response = httpx.Response(200, json=[])
        with (
            patch("app.services.auth_service.httpx.AsyncClient", FakeAsyncClient),
            patch.object(settings, "GOOGLE_CLIENT_ID", "web-client"),
        ):
            with self.assertRaises(GoogleProviderError):
                await verify_google_token("an-id-token-that-is-long-enough")


class TTSProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_tts_rejects_path_traversal_filename(self) -> None:
        with self.assertRaises(ValueError):
            await generate_audio("Hello", "en-US-GuyNeural", "../outside.mp3")

    async def test_tts_failure_is_typed_and_cleans_temporary_file(self) -> None:
        class FailingCommunicate:
            def __init__(self, *_: object) -> None:
                pass

            async def save(self, _: str) -> None:
                raise ConnectionError("offline")

        with tempfile.TemporaryDirectory() as temporary_directory:
            audio_directory = Path(temporary_directory)
            with (
                patch("app.services.tts_service.edge_tts.Communicate", FailingCommunicate),
                patch.object(settings, "AUDIO_DIR", audio_directory),
            ):
                with self.assertRaises(TTSServiceError):
                    await generate_audio(
                        "Hello", "en-US-GuyNeural", "conversation_1.mp3"
                    )
            self.assertEqual(list(audio_directory.iterdir()), [])

    async def test_batch_is_partial_and_filenames_are_content_versioned(self) -> None:
        filenames: list[str] = []

        async def fake_generate_audio(
            text: str,
            _: str,
            filename: str,
        ) -> str:
            filenames.append(filename)
            if text == "provider fails":
                raise TTSServiceError("offline")
            return f"/static/audio/{filename}"

        conversation_id = uuid4()
        line_id = uuid4()
        first = SimpleNamespace(
            id=line_id,
            conversation_id=conversation_id,
            speaker="A",
            text_en="Hello",
        )
        failed = SimpleNamespace(
            id=uuid4(),
            conversation_id=conversation_id,
            speaker="B",
            text_en="provider fails",
        )
        changed = SimpleNamespace(
            id=line_id,
            conversation_id=conversation_id,
            speaker="A",
            text_en="Hello again",
        )

        with patch(
            "app.services.tts_service.generate_audio",
            side_effect=fake_generate_audio,
        ):
            results = await generate_conversation_audio([first, failed])
            changed_result = await generate_conversation_audio([changed])

        self.assertIsNotNone(results[0]["audio_url"])
        self.assertIsNone(results[1]["audio_url"])
        self.assertIsNotNone(changed_result[0]["audio_url"])
        self.assertNotEqual(filenames[0], filenames[-1])

    async def test_cancelling_batch_cancels_provider_children(self) -> None:
        both_started = asyncio.Event()
        never_finishes = asyncio.Event()
        started = 0
        cancelled = 0

        async def slow_generate_audio(
            _: str,
            __: str,
            filename: str,
        ) -> str:
            nonlocal started, cancelled
            started += 1
            if started == 2:
                both_started.set()
            try:
                await never_finishes.wait()
            except asyncio.CancelledError:
                cancelled += 1
                raise
            return f"/static/audio/{filename}"

        conversation_id = uuid4()
        lines = [
            SimpleNamespace(
                id=uuid4(),
                conversation_id=conversation_id,
                speaker=speaker,
                text_en=text,
            )
            for speaker, text in (("A", "Hello"), ("B", "Hi"))
        ]

        with patch(
            "app.services.tts_service.generate_audio",
            side_effect=slow_generate_audio,
        ):
            batch = asyncio.create_task(generate_conversation_audio(lines))
            await asyncio.wait_for(both_started.wait(), timeout=1)
            batch.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await batch

        self.assertEqual(cancelled, 2)

    async def test_cancelling_batch_cleans_completed_child_output(self) -> None:
        first_completed = asyncio.Event()
        never_finishes = asyncio.Event()
        removed_urls: list[str] = []

        async def partly_slow_generate_audio(
            text: str,
            _: str,
            filename: str,
        ) -> str:
            if text == "fast":
                first_completed.set()
                return f"/static/audio/{filename}"
            await never_finishes.wait()
            return f"/static/audio/{filename}"

        conversation_id = uuid4()
        lines = [
            SimpleNamespace(
                id=uuid4(),
                conversation_id=conversation_id,
                speaker="A",
                text_en="fast",
            ),
            SimpleNamespace(
                id=uuid4(),
                conversation_id=conversation_id,
                speaker="B",
                text_en="slow",
            ),
        ]

        with (
            patch(
                "app.services.tts_service.generate_audio",
                side_effect=partly_slow_generate_audio,
            ),
            patch(
                "app.services.tts_service.remove_generated_audio",
                side_effect=lambda url: removed_urls.append(url),
            ),
        ):
            batch = asyncio.create_task(generate_conversation_audio(lines))
            await asyncio.wait_for(first_completed.wait(), timeout=1)
            await asyncio.sleep(0)
            batch.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await batch

        self.assertEqual(len(removed_urls), 1)
        self.assertTrue(removed_urls[0].startswith("/static/audio/"))


if __name__ == "__main__":
    unittest.main()
