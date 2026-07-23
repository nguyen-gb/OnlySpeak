import asyncio

from sqlalchemy import select

from app.database import async_session_maker
from app.models import Conversation, ConversationLine, Level, Speaker, Topic


SAMPLE_LINES = [
    ("A", "Hi! Welcome to Daily Brew. What can I get for you today?", "Be welcoming and cheerful."),
    ("B", "I'd like a medium latte with oat milk, please.", "Focus on 'medium' and 'oat milk'."),
    ("A", "Great choice! Would you like that hot or iced?", "Slightly raise pitch at the end."),
    ("B", "Iced, please.", "Clear 's' sound in 'Iced'."),
    ("A", "That will be $4.50. You can pay at the next window.", ""),
]


async def seed():
    """Idempotently create or refresh the small sample curriculum."""

    async with async_session_maker() as session:
        topic = (
            await session.execute(
                select(Topic)
                .where(Topic.title == "Daily Conversations")
                .order_by(Topic.created_at)
            )
        ).scalars().first()
        if topic is None:
            topic = Topic(title="Daily Conversations")
            session.add(topic)
        topic.description = "Common everyday situations to get you started."
        topic.icon = "☕"
        topic.level = Level.BEGINNER
        topic.sort_order = 1
        topic.is_published = True
        await session.flush()

        conversation = (
            await session.execute(
                select(Conversation)
                .where(
                    Conversation.topic_id == topic.id,
                    Conversation.title == "Ordering Coffee",
                )
                .order_by(Conversation.created_at)
            )
        ).scalars().first()
        if conversation is None:
            conversation = Conversation(
                topic_id=topic.id,
                title="Ordering Coffee",
            )
            session.add(conversation)
        conversation.description = "Practice ordering your favorite coffee drink."
        conversation.situation = "At a busy local coffee shop."
        conversation.role_a_name = "Barista"
        conversation.role_b_name = "Customer"
        conversation.level = Level.BEGINNER
        conversation.sort_order = 1
        conversation.is_published = True
        await session.flush()

        existing_lines = {
            line.line_order: line
            for line in (
                await session.execute(
                    select(ConversationLine).where(
                        ConversationLine.conversation_id == conversation.id
                    )
                )
            ).scalars()
        }
        for line_order, (speaker, text, hint) in enumerate(SAMPLE_LINES, start=1):
            line = existing_lines.get(line_order)
            if line is None:
                line = ConversationLine(
                    conversation_id=conversation.id,
                    line_order=line_order,
                )
                session.add(line)
            line.speaker = Speaker(speaker)
            line.text_en = text
            line.pronunciation_hint = hint

        await session.commit()
        print("Sample curriculum upserted successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
