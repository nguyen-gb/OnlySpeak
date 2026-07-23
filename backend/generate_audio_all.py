import asyncio
from types import SimpleNamespace

from sqlalchemy import select

from app.database import async_session_maker
from app.models import Conversation, ConversationLine
from app.services.tts_service import (
    TTSServiceError,
    generate_conversation_audio,
    remove_generated_audio,
)


async def generate_all():
    generated_total = 0
    failed_conversations = 0
    async with async_session_maker() as session:
        rows = (
            await session.execute(
                select(Conversation.id, Conversation.title).order_by(
                    Conversation.created_at
                )
            )
        ).all()
        await session.rollback()
        print(f"Generating TTS audio for {len(rows)} conversations...")

        for conversation_id, title in rows:
            lines = list(
                (
                    await session.execute(
                        select(ConversationLine)
                        .where(
                            ConversationLine.conversation_id == conversation_id,
                            ConversationLine.audio_url.is_(None),
                        )
                        .order_by(ConversationLine.line_order)
                    )
                ).scalars()
            )
            snapshots = [
                SimpleNamespace(
                    id=line.id,
                    conversation_id=line.conversation_id,
                    speaker=line.speaker,
                    line_order=line.line_order,
                    text_en=line.text_en,
                    audio_url=line.audio_url,
                )
                for line in lines
            ]
            snapshots_by_id = {snapshot.id: snapshot for snapshot in snapshots}
            await session.rollback()
            if not snapshots:
                print(f"Conversation '{title}' already has all audio generated.")
                continue

            print(f"Generating {len(snapshots)} lines for '{title}'...")
            try:
                audio_results = await generate_conversation_audio(snapshots)
            except TTSServiceError as exc:
                failed_conversations += 1
                print(f"Failed '{title}': {exc}")
                continue

            successful = {
                result["line_id"]: result["audio_url"]
                for result in audio_results
                if result.get("audio_url")
            }
            saved_lines = list(
                (
                    await session.execute(
                        select(ConversationLine).where(
                            ConversationLine.conversation_id == conversation_id,
                            ConversationLine.id.in_(successful),
                        )
                    )
                ).scalars()
            )
            applied_ids = set()
            for line in saved_lines:
                snapshot = snapshots_by_id[line.id]
                if line.text_en == snapshot.text_en and line.speaker == snapshot.speaker:
                    line.audio_url = successful[line.id]
                    applied_ids.add(line.id)
            await session.commit()
            for line_id, audio_url in successful.items():
                if line_id not in applied_ids:
                    remove_generated_audio(str(audio_url))
            applied_count = len(applied_ids)
            generated_total += applied_count
            print(f"Saved {applied_count} audio URLs for '{title}'.")

    print(
        f"Done: {generated_total} lines generated; "
        f"{failed_conversations} conversations failed."
    )


if __name__ == "__main__":
    asyncio.run(generate_all())
