from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("/free-talk")
async def free_talk(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Handles dynamic AI chat for Free Talk mode.
    Expects: conversation_id, user_input, history (list), role_played
    """
    conv_id = data.get("conversation_id")
    user_input = data.get("user_input")
    history = data.get("history", [])
    role_played = data.get("role_played", "B")
    
    if not conv_id or not user_input:
        raise HTTPException(status_code=400, detail="Missing required fields")

    # Get conversation context
    result = await db.execute(select(Conversation).where(Conversation.id == conv_id))
    conv = result.scalar_one_or_none()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    partner_role = conv.role_a_name if role_played == "B" else conv.role_b_name
    
    # Call AI Service
    response = await ai_service.get_free_talk_response(
        user_input, 
        history, 
        conv.situation or conv.title, 
        partner_role
    )
    
    return response
