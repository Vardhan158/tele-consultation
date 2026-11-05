from alembic import context
from sqlalchemy import create_engine

from teleconsult import models_registry  # noqa: F401  (registers all models)
from teleconsult.config.settings import get_settings
from teleconsult.kernel.db.base import Base

target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = create_engine(get_settings().migration_database_url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            version_table="teleconsult_alembic_version",
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
