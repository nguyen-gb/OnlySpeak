import asyncio
from sqlalchemy import select
from app.database import async_session_maker
from app.models import Topic, Level, Conversation, ConversationLine, Speaker

async def seed():
    async with async_session_maker() as session:
        # Check if topic exists
        result = await session.execute(select(Topic).filter_by(title="Daily Conversations"))
        topic = result.scalar_one_or_none()
        
        if not topic:
            topic = Topic(
                title="Daily Conversations",
                description="Common everyday situations to get you started.",
                icon="☕",
                level="beginner",
                sort_order=1,
                is_published=True
            )
            session.add(topic)
            await session.flush()
        
            # Create conversation
            conversation = Conversation(
                topic_id=topic.id,
                title="Ordering Coffee",
                description="Practice ordering your favorite coffee drink.",
                situation="At a busy local coffee shop.",
                role_a_name="Barista",
                role_b_name="Customer",
                level="beginner",
                sort_order=1,
                is_published=True
            )
            session.add(conversation)
            await session.flush()

            # Create lines
            lines = [
                ConversationLine(
                    conversation_id=conversation.id,
                    speaker="A",
                    line_order=1,
                    text_en="Hi! Welcome to Daily Brew. What can I get for you today?",
                    pronunciation_hint="Be welcoming and cheerful.",
                ),
                ConversationLine(
                    conversation_id=conversation.id,
                    speaker="B",
                    line_order=2,
                    text_en="I'd like a medium latte with oat milk, please.",
                    pronunciation_hint="Focus on 'medium' and 'oat milk'.",
                ),
                ConversationLine(
                    conversation_id=conversation.id,
                    speaker="A",
                    line_order=3,
                    text_en="Great choice! Would you like that hot or iced?",
                    pronunciation_hint="Slightly raise pitch at the end.",
                ),
                ConversationLine(
                    conversation_id=conversation.id,
                    speaker="B",
                    line_order=4,
                    text_en="Iced, please.",
                    pronunciation_hint="Clear 's' sound in 'Iced'.",
                ),
                ConversationLine(
                    conversation_id=conversation.id,
                    speaker="A",
                    line_order=5,
                    text_en="That will be $4.50. You can pay at the next window.",
                    pronunciation_hint="",
                )
            ]
            session.add_all(lines)
            
            await session.commit()
            print("Database seeded with sample Topic and Conversation.")
        else:
            print("Database appears to be seeded already.")

if __name__ == "__main__":
    asyncio.run(seed())
