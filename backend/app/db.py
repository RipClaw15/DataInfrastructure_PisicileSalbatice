from functools import lru_cache
from collections.abc import Iterator

from fastapi import HTTPException
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session

from .config import settings
from .observability import TimedQueuePool, instrument_queries


class Base(DeclarativeBase):
    """Shared metadata for database models and future Alembic migrations."""


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create a reusable connection pool; opening a connection happens on demand."""
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    engine = create_engine(
        settings.database_url,
        poolclass=TimedQueuePool,
        pool_pre_ping=True,
        pool_timeout=settings.db_pool_timeout_seconds,
        connect_args={
            "connect_timeout": 3,
            
            
            "tcp_user_timeout": settings.db_tcp_user_timeout_ms,
            "keepalives_idle": 5,
            "keepalives_interval": 2,
            "keepalives_count": 2,
            "options": (
                f"-c statement_timeout={settings.db_statement_timeout_ms} "
                f"-c lock_timeout={settings.db_lock_timeout_ms} "
                "-c idle_in_transaction_session_timeout=10000"
            ),
        },
    )
    instrument_queries(engine)
    return engine


def get_db() -> Iterator[Session]:
    if not settings.database_url:
        raise HTTPException(status_code=503, detail="Database is not configured")

    with Session(get_engine()) as session:
        try:
            yield session
        except SQLAlchemyError:
            session.rollback()
            raise HTTPException(status_code=503, detail="Database unavailable") from None
