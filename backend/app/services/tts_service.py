import os
import uuid

import edge_tts

from app.config import settings


async def generate_audio(text: str, voice: str, filename: str = None) -> str:
    """Generate an audio MP3 file using edge-tts (100% free, unlimited)."""
    os.makedirs(settings.AUDIO_DIR, exist_ok=True)

    if not filename:
        filename = f"{uuid.uuid4()}.mp3"

    filepath = os.path.join(settings.AUDIO_DIR, filename)

    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(filepath)
        return f"/static/audio/{filename}"
    except Exception as e:
        print(f"Warning: Failed to generate TTS audio using edge-tts for '{text[:20]}...': {e}")
        return None


async def generate_conversation_audio(
    lines: list, voice_a: str = None, voice_b: str = None
) -> list:
    """Generate audio for all lines in a conversation using different voices for A/B."""
    voice_a = voice_a or settings.TTS_VOICE_A
    voice_b = voice_b or settings.TTS_VOICE_B

    results = []
    for line in lines:
        voice = voice_a if line.speaker.value == "A" else voice_b
        filename = f"{line.conversation_id}_{line.line_order}.mp3"
        audio_url = await generate_audio(line.text_en, voice, filename)
        results.append({"line_id": line.id, "audio_url": audio_url})

    return results
