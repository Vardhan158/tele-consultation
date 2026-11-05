import asyncio
import asyncpg
from teleconsult.config.settings import get_settings

async def main():
    settings = get_settings()
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    schemas = await conn.fetch("SELECT schema_name FROM information_schema.schemata")
    print("SCHEMAS:", [s["schema_name"] for s in schemas])
    tables = await conn.fetch(
        "SELECT table_schema, table_name FROM information_schema.tables "
        "WHERE table_schema NOT IN ('pg_catalog', 'information_schema') "
        "ORDER BY table_schema, table_name"
    )
    print("\nTABLES:")
    for t in tables:
        print(f"  {t['table_schema']}.{t['table_name']}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
