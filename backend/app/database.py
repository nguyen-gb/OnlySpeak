from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.engine.interfaces import DBAPIConnection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import ConnectionPoolEntry

from app.config import settings


engine_options: dict[str, object] = {
    "pool_pre_ping": True,
    "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
    "hide_parameters": True,
}
if not settings.DATABASE_URL.startswith("sqlite"):
    engine_options.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
    )

engine = create_async_engine(settings.DATABASE_URL, **engine_options)


def _enable_sqlite_foreign_keys(
    dbapi_connection: DBAPIConnection,
    _: ConnectionPoolEntry,
) -> None:
    """Make SQLite enforce the same ON DELETE rules used by PostgreSQL."""

    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def configure_sqlite_engine(async_engine) -> None:
    """Attach SQLite integrity settings to an async SQLAlchemy engine."""

    if async_engine.url.get_backend_name() == "sqlite":
        event.listen(
            async_engine.sync_engine,
            "connect",
            _enable_sqlite_foreign_keys,
        )


configure_sqlite_engine(engine)
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    await engine.dispose()
