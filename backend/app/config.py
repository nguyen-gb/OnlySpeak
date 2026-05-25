from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "OnlySpeak API"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://onlyspeak:onlyspeak@localhost:5432/onlyspeak"

    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # TTS Voices
    TTS_VOICE_A: str = "en-US-GuyNeural"
    TTS_VOICE_B: str = "en-US-AriaNeural"
    AUDIO_DIR: str = "static/audio"
    
    # AI Keys
    GEMINI_API_KEY: str = ""

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
