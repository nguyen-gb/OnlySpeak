from __future__ import annotations

import re
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SECRET_VALUES = {
    "your-secret-key-change-in-production",
    "dev-secret-key-change-in-production",
    "change-me",
}


def _env_alias(name: str) -> AliasChoices:
    """Accept both new prefixed variables and the existing deployment names."""

    return AliasChoices(f"ONLYSPEAK_{name}", name)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
        validate_default=True,
    )

    # App
    APP_NAME: str = Field("OnlySpeak API", validation_alias=_env_alias("APP_NAME"))
    ENVIRONMENT: Literal["development", "test", "production"] = Field(
        "development", validation_alias=_env_alias("ENVIRONMENT")
    )
    DEBUG: bool = Field(False, validation_alias=_env_alias("DEBUG"))
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        "INFO", validation_alias=_env_alias("LOG_LEVEL")
    )
    DOCS_ENABLED: bool | None = Field(
        None, validation_alias=_env_alias("DOCS_ENABLED")
    )
    MAX_REQUEST_BODY_BYTES: int = Field(
        1_048_576,
        ge=16_384,
        le=10_485_760,
        validation_alias=_env_alias("MAX_REQUEST_BODY_BYTES"),
    )

    # Database
    DATABASE_URL: str = Field(
        "postgresql+asyncpg://onlyspeak:onlyspeak@localhost:5432/onlyspeak",
        validation_alias=_env_alias("DATABASE_URL"),
    )
    DB_POOL_SIZE: int = Field(
        5, ge=1, le=50, validation_alias=_env_alias("DB_POOL_SIZE")
    )
    DB_MAX_OVERFLOW: int = Field(
        10, ge=0, le=100, validation_alias=_env_alias("DB_MAX_OVERFLOW")
    )
    DB_POOL_RECYCLE_SECONDS: int = Field(
        1800,
        ge=60,
        le=86400,
        validation_alias=_env_alias("DB_POOL_RECYCLE_SECONDS"),
    )
    DB_HEALTH_TIMEOUT_SECONDS: float = Field(
        3.0,
        ge=0.1,
        le=30.0,
        validation_alias=_env_alias("DB_HEALTH_TIMEOUT_SECONDS"),
    )

    # JWT and browser session cookies
    SECRET_KEY: SecretStr = Field(validation_alias=_env_alias("SECRET_KEY"))
    ALGORITHM: Literal["HS256"] = Field(
        "HS256", validation_alias=_env_alias("ALGORITHM")
    )
    JWT_ISSUER: str = Field(
        "onlyspeak-api", validation_alias=_env_alias("JWT_ISSUER"), min_length=1
    )
    JWT_AUDIENCE: str = Field(
        "onlyspeak-web", validation_alias=_env_alias("JWT_AUDIENCE"), min_length=1
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        30,
        ge=5,
        le=1440,
        validation_alias=_env_alias("ACCESS_TOKEN_EXPIRE_MINUTES"),
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        7,
        ge=1,
        le=90,
        validation_alias=_env_alias("REFRESH_TOKEN_EXPIRE_DAYS"),
    )
    REFRESH_REUSE_GRACE_SECONDS: int = Field(
        10,
        ge=0,
        le=60,
        validation_alias=_env_alias("REFRESH_REUSE_GRACE_SECONDS"),
    )
    ACCESS_COOKIE_NAME: str = Field(
        "onlyspeak_access_token",
        validation_alias=_env_alias("ACCESS_COOKIE_NAME"),
    )
    REFRESH_COOKIE_NAME: str = Field(
        "onlyspeak_refresh_token",
        validation_alias=_env_alias("REFRESH_COOKIE_NAME"),
    )
    COOKIE_SECURE: bool | None = Field(
        None, validation_alias=_env_alias("COOKIE_SECURE")
    )
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = Field(
        "lax", validation_alias=_env_alias("COOKIE_SAMESITE")
    )
    COOKIE_DOMAIN: str | None = Field(
        None, validation_alias=_env_alias("COOKIE_DOMAIN")
    )

    # Google OAuth
    GOOGLE_CLIENT_ID: str = Field("", validation_alias=_env_alias("GOOGLE_CLIENT_ID"))
    GOOGLE_IOS_CLIENT_ID: str = Field(
        "", validation_alias=_env_alias("GOOGLE_IOS_CLIENT_ID")
    )
    GOOGLE_ANDROID_CLIENT_ID: str = Field(
        "", validation_alias=_env_alias("GOOGLE_ANDROID_CLIENT_ID")
    )
    GOOGLE_CLIENT_SECRET: SecretStr = Field(
        SecretStr(""), validation_alias=_env_alias("GOOGLE_CLIENT_SECRET")
    )

    # TTS
    TTS_VOICE_A: str = Field(
        "en-US-GuyNeural", validation_alias=_env_alias("TTS_VOICE_A")
    )
    TTS_VOICE_B: str = Field(
        "en-US-AriaNeural", validation_alias=_env_alias("TTS_VOICE_B")
    )
    TTS_LINE_TIMEOUT_SECONDS: float = Field(
        30.0,
        ge=1.0,
        le=120.0,
        validation_alias=_env_alias("TTS_LINE_TIMEOUT_SECONDS"),
    )
    TTS_BATCH_TIMEOUT_SECONDS: float = Field(
        120.0,
        ge=5.0,
        le=900.0,
        validation_alias=_env_alias("TTS_BATCH_TIMEOUT_SECONDS"),
    )
    TTS_CONCURRENCY: int = Field(
        4,
        ge=1,
        le=10,
        validation_alias=_env_alias("TTS_CONCURRENCY"),
    )
    STATIC_DIR: Path = Field(
        BACKEND_DIR / "static", validation_alias=_env_alias("STATIC_DIR")
    )
    AUDIO_DIR: Path = Field(
        BACKEND_DIR / "static" / "audio", validation_alias=_env_alias("AUDIO_DIR")
    )

    # External providers
    GEMINI_API_KEY: SecretStr = Field(
        SecretStr(""), validation_alias=_env_alias("GEMINI_API_KEY")
    )
    GEMINI_MODEL: str = Field(
        "gemini-3.5-flash", validation_alias=_env_alias("GEMINI_MODEL")
    )
    PROVIDER_TIMEOUT_SECONDS: float = Field(
        20.0,
        ge=1.0,
        le=60.0,
        validation_alias=_env_alias("PROVIDER_TIMEOUT_SECONDS"),
    )

    # Abuse controls. These are per-process safeguards, not a distributed quota.
    CHAT_RATE_LIMIT_PER_MINUTE: int = Field(
        20,
        ge=1,
        le=1000,
        validation_alias=_env_alias("CHAT_RATE_LIMIT_PER_MINUTE"),
    )
    AUTH_RATE_LIMIT_PER_MINUTE: int = Field(
        30,
        ge=1,
        le=1000,
        validation_alias=_env_alias("AUTH_RATE_LIMIT_PER_MINUTE"),
    )

    # CORS
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        validation_alias=_env_alias("CORS_ORIGINS"),
    )

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, value: object) -> object:
        return value.lower() if isinstance(value, str) else value

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug(cls, value: object) -> object:
        # Some hosting platforms export DEBUG=release. Treat their release marker
        # as disabled while retaining compatibility with the existing DEBUG name.
        if isinstance(value, str) and value.lower() in {"release", "production"}:
            return False
        return value

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def normalize_log_level(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    @field_validator("COOKIE_SAMESITE", mode="before")
    @classmethod
    def normalize_same_site(cls, value: object) -> object:
        return value.lower() if isinstance(value, str) else value

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        normalized = secret.lower()
        unsafe_marker = any(marker in normalized for marker in DEFAULT_SECRET_VALUES)
        if len(secret) < 32 or unsafe_marker or len(set(secret)) < 8:
            raise ValueError("SECRET_KEY must be a unique random value of at least 32 characters")
        return value

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith(("postgresql+asyncpg://", "sqlite+aiosqlite://")):
            raise ValueError("DATABASE_URL must use an async SQLAlchemy driver")
        return value

    @field_validator("ACCESS_COOKIE_NAME", "REFRESH_COOKIE_NAME")
    @classmethod
    def validate_cookie_name(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value):
            raise ValueError("Cookie names may contain only letters, numbers, underscores, and hyphens")
        return value

    @field_validator("COOKIE_DOMAIN", mode="before")
    @classmethod
    def normalize_cookie_domain(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            if (
                len(value) > 253
                or not re.fullmatch(r"\.?[A-Za-z0-9.-]+", value)
                or ".." in value
            ):
                raise ValueError("Invalid cookie domain")
            return value
        return value

    @field_validator("GEMINI_MODEL")
    @classmethod
    def validate_gemini_model(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", value):
            raise ValueError("GEMINI_MODEL contains unsupported characters")
        return value

    @field_validator("STATIC_DIR", "AUDIO_DIR")
    @classmethod
    def resolve_backend_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else (BACKEND_DIR / value).resolve()

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for raw_origin in values:
            origin = raw_origin.strip().rstrip("/")
            if origin == "*":
                raise ValueError("Wildcard CORS origins cannot be used with credentials")
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError(f"Invalid CORS origin: {raw_origin!r}")
            if parsed.username or parsed.password or not parsed.hostname:
                raise ValueError(f"Invalid CORS origin: {raw_origin!r}")
            try:
                parsed.port
            except ValueError as exc:
                raise ValueError(f"Invalid CORS origin: {raw_origin!r}") from exc
            if parsed.path or parsed.query or parsed.fragment:
                raise ValueError(f"CORS origins must not contain a path: {raw_origin!r}")
            if origin not in normalized:
                normalized.append(origin)
        if not normalized:
            raise ValueError("At least one CORS origin is required")
        return normalized

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.ENVIRONMENT == "production" and self.DEBUG:
            raise ValueError("DEBUG must be disabled in production")
        if self.ENVIRONMENT == "production" and not self.cookie_secure:
            raise ValueError("Secure cookies are required in production")
        if self.COOKIE_SAMESITE == "none" and not self.cookie_secure:
            raise ValueError("SameSite=None cookies must also be Secure")
        if self.ENVIRONMENT == "production":
            if not self.DATABASE_URL.startswith("postgresql+asyncpg://"):
                raise ValueError("Production must use PostgreSQL with asyncpg")
            if self.DOCS_ENABLED is True:
                raise ValueError("API documentation must be disabled in production")
            if "onlyspeak:onlyspeak@" in self.DATABASE_URL:
                raise ValueError("Default database credentials cannot be used in production")
            if not self.GOOGLE_CLIENT_ID:
                raise ValueError("GOOGLE_CLIENT_ID is required in production")
            insecure_origins = [
                origin for origin in self.CORS_ORIGINS if not origin.startswith("https://")
            ]
            if insecure_origins:
                raise ValueError("Production CORS origins must use HTTPS")
        return self

    @property
    def cookie_secure(self) -> bool:
        if self.COOKIE_SECURE is not None:
            return self.COOKIE_SECURE
        return self.ENVIRONMENT == "production"

    @property
    def docs_enabled(self) -> bool:
        if self.DOCS_ENABLED is not None:
            return self.DOCS_ENABLED
        return self.ENVIRONMENT != "production"


settings = Settings()
