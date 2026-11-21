from functools import lru_cache
from collections.abc import Iterator

from fastapi import HTTPException
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session

from .config import settings


class Base(DeclarativeBase):
    """Shared metadata for database models and future Alembic migrations."""


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create a reusable connection pool; opening a connection happens on demand."""
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 3},
    )


def get_db() -> Iterator[Session]:
    if not settings.database_url:
        raise HTTPException(status_code=503, detail="Database is not configured")

    with Session(get_engine()) as session:
        try:
            yield session
        except SQLAlchemyError:
            session.rollback()
            raise HTTPException(status_code=503, detail="Database unavailable") from None
