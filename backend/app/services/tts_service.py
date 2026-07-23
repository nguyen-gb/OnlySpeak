from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any

import edge_tts

from app.config import settings


logger = logging.getLogger(__name__)
SAFE_FILENAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.mp3")


class TTSServiceError(RuntimeError):
    pass


def remove_generated_audio(audio_url: str | None) -> bool:
    """Delete one server-generated audio file without accepting arbitrary paths."""

    prefix = "/static/audio/"
    if not audio_url or not audio_url.startswith(prefix):
        return False
    filename = audio_url.removeprefix(prefix)
    if Path(filename).name != filename or not SAFE_FILENAME.fullmatch(filename):
        return False
    try:
        (settings.AUDIO_DIR / filename).unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Could not remove stale audio %s: %s", filename, type(exc).__name__)
        return False
    return True


async def generate_audio(
    text: str,
    voice: str,
    filename: str | None = None,
) -> str:
    """Generate an MP3 atomically and return its public static URL."""

    text = text.strip()
    if not text or len(text) > 5_000:
        raise ValueError("TTS text must contain between 1 and 5000 characters")

    filename = filename or f"{uuid.uuid4()}.mp3"
    if Path(filename).name != filename or not SAFE_FILENAME.fullmatch(filename):
        raise ValueError("Invalid audio filename")

    settings.AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    filepath = settings.AUDIO_DIR / filename
    temporary_path = settings.AUDIO_DIR / f".{filename}.{uuid.uuid4().hex}.tmp"

    try:
        communicate = edge_tts.Communicate(text, voice)
        await asyncio.wait_for(
            communicate.save(str(temporary_path)),
            timeout=settings.TTS_LINE_TIMEOUT_SECONDS,
        )
        os.replace(temporary_path, filepath)
    except asyncio.CancelledError:
        logger.info("TTS generation cancelled (text_length=%s)", len(text))
        raise
    except Exception as exc:
        logger.warning(
            "TTS generation failed (voice=%s, text_length=%s): %s",
            voice,
            len(text),
            type(exc).__name__,
        )
        raise TTSServiceError("Text-to-speech provider is unavailable") from exc
    finally:
        temporary_path.unlink(missing_ok=True)

    return f"/static/audio/{filename}"


async def generate_conversation_audio(
    lines: list[Any],
    voice_a: str | None = None,
    voice_b: str | None = None,
) -> list[dict[str, object]]:
    """Generate audio for all lines using different voices for roles A and B."""

    voice_a = voice_a or settings.TTS_VOICE_A
    voice_b = voice_b or settings.TTS_VOICE_B
    batch_version = uuid.uuid4().hex[:12]

    prepared: list[tuple[int, Any, str, str]] = []
    for index, line in enumerate(lines):
        speaker = line.speaker.value if hasattr(line.speaker, "value") else line.speaker
        if speaker not in {"A", "B"}:
            raise ValueError("TTS line speaker must be A or B")
        voice = voice_a if speaker == "A" else voice_b
        content_version = hashlib.sha256(
            f"{speaker}\0{voice}\0{line.text_en}".encode("utf-8")
        ).hexdigest()[:16]
        # Versioned filenames keep concurrent/stale generation from replacing
        # audio that belongs to a newer line revision.
        filename = (
            f"{line.conversation_id}_{line.id}_{content_version}_{batch_version}.mp3"
        )
        prepared.append((index, line, voice, filename))

    if not prepared:
        return []

    semaphore = asyncio.Semaphore(settings.TTS_CONCURRENCY)

    async def generate_one(
        index: int,
        line: Any,
        voice: str,
        filename: str,
    ) -> tuple[int, dict[str, object]]:
        async with semaphore:
            try:
                audio_url = await generate_audio(line.text_en, voice, filename)
                return index, {"line_id": line.id, "audio_url": audio_url}
            except TTSServiceError:
                return index, {"line_id": line.id, "audio_url": None}

    tasks = [
        asyncio.create_task(generate_one(index, line, voice, filename))
        for index, line, voice, filename in prepared
    ]
    try:
        done, pending = await asyncio.wait(
            tasks,
            timeout=settings.TTS_BATCH_TIMEOUT_SECONDS,
        )
    except asyncio.CancelledError:
        # create_task children are not cancelled automatically with their
        # parent. Stop provider work promptly when the request/batch is gone.
        for task in tasks:
            if not task.done():
                task.cancel()
        outcomes = await asyncio.gather(*tasks, return_exceptions=True)
        # Each batch owns unique filenames, so completed children can be
        # cleaned safely instead of becoming unreferenced final files.
        for outcome in outcomes:
            if not isinstance(outcome, tuple) or len(outcome) != 2:
                continue
            result = outcome[1]
            if not isinstance(result, dict):
                continue
            audio_url = result.get("audio_url")
            if isinstance(audio_url, str):
                remove_generated_audio(audio_url)
        raise
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)

    results_by_index: dict[int, dict[str, object]] = {}
    for task in done:
        try:
            index, result = task.result()
        except Exception as exc:
            logger.warning("Unexpected TTS line failure: %s", type(exc).__name__)
            continue
        results_by_index[index] = result

    results: list[dict[str, object]] = []
    for index, line, _, _ in prepared:
        results.append(
            results_by_index.get(
                index,
                {"line_id": line.id, "audio_url": None},
            )
        )

    return results
