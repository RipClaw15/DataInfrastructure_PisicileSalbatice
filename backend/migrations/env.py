from alembic import context

from app.config import settings
from app.db import Base, get_engine
from app import models  # noqa: F401 — registers model tables in Base.metadata


if context.is_offline_mode():
    if not settings.database_url:
        raise RuntimeError("Set DATABASE_URL before generating migration SQL")
    context.configure(
        url=settings.database_url,
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    with get_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
