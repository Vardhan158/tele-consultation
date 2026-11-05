"""Prepare a repeatable, non-destructive PostgreSQL-to-MongoDB import."""
import argparse
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from pymongo import UpdateOne
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from teleconsult import models_registry  # noqa: F401
from teleconsult.config.settings import get_settings
from teleconsult.kernel.db.base import Base
from teleconsult.kernel.db.session import get_engine
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.kernel.mongodb.schema import ensure_schema


def encode(value):
    if isinstance(value, (UUID, datetime, date, Decimal)):
        return str(value)
    if isinstance(value, dict):
        return {str(key): encode(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode(item) for item in value]
    return value


async def run(apply: bool, limit: int | None, report_path: Path) -> None:
    settings = get_settings()
    if not settings.mongodb_enabled or not settings.mongodb_uri:
        raise RuntimeError("Set MONGODB_ENABLED=true and MONGODB_URI for migration preparation.")
    await mongo_database.connect()
    await ensure_schema()
    db = mongo_database.database()
    report = {"dry_run": not apply, "tables": {}, "errors": []}
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session:
        for table in Base.metadata.sorted_tables:
            try:
                rows = list((await session.execute(select(table).limit(limit))).mappings())
                operations = []
                for row in rows:
                    document = {key: encode(value) for key, value in row.items()}
                    source_key = f"{table.name}:{document.get('id', document)}"
                    document["_migration_source"] = "postgresql"
                    document["_migration_key"] = source_key
                    operations.append(UpdateOne({"_migration_key": source_key}, {"$setOnInsert": document}, upsert=True))
                if apply and operations:
                    result = await db[table.name].bulk_write(operations, ordered=False)
                    inserted = result.upserted_count
                else:
                    inserted = 0
                report["tables"][table.name] = {"source_count": len(rows), "inserted": inserted}
            except Exception as exc:
                report["errors"].append({"table": table.name, "error": type(exc).__name__})
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    await mongo_database.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write to MongoDB; default is dry-run")
    parser.add_argument("--limit", type=int, default=None, help="limit rows per table for a development rehearsal")
    parser.add_argument("--report", type=Path, default=Path("mongodb-migration-report.json"))
    args = parser.parse_args()
    import asyncio
    asyncio.run(run(args.apply, args.limit, args.report))


if __name__ == "__main__":
    main()
