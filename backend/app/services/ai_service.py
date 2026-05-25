import json
import httpx
from app.config import settings

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

class AIService:
    @staticmethod
    async def get_free_talk_response(
        user_input: str, 
        history: list[dict], 
        situation: str, 
        partner_role: str
    ):
        if not settings.GEMINI_API_KEY:
            return {
                "reply": "I'm sorry, AI Free Talk is not configured yet. Please add a Gemini API Key.",
                "evaluation": {"score": 0, "feedback": "API Key missing"}
            }

        # Prepare system prompt
        system_prompt = f"""
        You are an English conversation partner. 
        Current Situation: {situation}
        Your Role: {partner_role}
        
        Rules:
        1. Keep the conversation natural and engaging.
        2. Respond in simple, clear English suitable for the context.
        3. AFTER your response, evaluate the user's last message on Grammar, Vocabulary, and Naturalness.
        
        Return your response ONLY in the following JSON format:
        {{
            "reply": "Your spoken response here",
            "evaluation": {{
                "score": 0-100,
                "grammar_feedback": "Short grammar tip",
                "vocabulary_tip": "Better word choices if any",
                "overall_feedback": "General encouragement"
            }}
        }}
        """

        # Format history for Gemini
        contents = []
        # Add system instructions (Gemini 1.5 style uses system_instruction but we'll prepend to first message for simplicity or use v1beta)
        contents.append({"role": "user", "parts": [{"text": system_prompt}]})
        contents.append({"role": "model", "parts": [{"text": "Understood. I'm ready to start the conversation."}]})
        
        for msg in history:
            contents.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [{"text": msg["content"]}]
            })
            
        # Add current user input
        contents.append({"role": "user", "parts": [{"text": user_input}]})

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                    json={"contents": contents},
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return {"reply": "Connection error with AI.", "evaluation": {"score": 0}}

                data = response.json()
                text_response = data['candidates'][0]['content']['parts'][0]['text']
                
                # Clean JSON string (Gemini sometimes adds ```json ... ```)
                cleaned_text = text_response.strip()
                if "```json" in cleaned_text:
                    cleaned_text = cleaned_text.split("```json")[1].split("```")[0].strip()
                elif "```" in cleaned_text:
                    cleaned_text = cleaned_text.split("```")[1].split("```")[0].strip()

                return json.loads(cleaned_text)
            except Exception as e:
                print(f"AI Service Error: {e}")
                return {
                    "reply": "I'm having trouble thinking right now. Can we try again?",
                    "evaluation": {"score": 0, "feedback": str(e)}
                }

ai_service = AIService()
