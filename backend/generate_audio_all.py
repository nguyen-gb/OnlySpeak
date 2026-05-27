import asyncio
from sqlalchemy import select
from app.database import async_session_maker
from app.models import Conversation, ConversationLine
from app.services.tts_service import generate_conversation_audio

async def generate_all():
    async with async_session_maker() as session:
        # Get all conversations
        result = await session.execute(select(Conversation))
        conversations = result.scalars().all()
        
        print(f"Generating TTS audio for {len(conversations)} conversations...")
        for conversation in conversations:
            print(f"Processing conversation: {conversation.title}...")
            lines_result = await session.execute(
                select(ConversationLine)
                .where(ConversationLine.conversation_id == conversation.id)
                .order_by(ConversationLine.line_order)
            )
            lines = lines_result.scalars().all()
            if not lines:
                continue
                
            # Filter lines that do not have audio_url yet
            lines_to_generate = [l for l in lines if not l.audio_url]
            if not lines_to_generate:
                print(f"Conversation '{conversation.title}' already has all audio generated.")
                continue
                
            print(f"Generating audio for {len(lines_to_generate)} lines in '{conversation.title}'...")
            audio_results = await generate_conversation_audio(lines_to_generate)
            
            for audio in audio_results:
                line_result = await session.execute(
                    select(ConversationLine).where(
                        ConversationLine.id == audio["line_id"]
                    )
                )
                line = line_result.scalar_one()
                line.audio_url = audio["audio_url"]
            
            await session.commit()
            print(f"Successfully generated and saved audio for '{conversation.title}'!")

if __name__ == "__main__":
    asyncio.run(generate_all())
