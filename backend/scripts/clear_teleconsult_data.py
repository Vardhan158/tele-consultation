import asyncio

import asyncpg

from teleconsult.config.settings import get_settings


APP_SCHEMAS = (
    "patient_portal",
    "identity",
    "payments",
    "records",
    "notifications",
    "consultation",
    "support_access",
    "audit",
    "directory",
    "tenancy",
)


async def main() -> None:
    settings = get_settings()
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    connection = await asyncpg.connect(url)
    try:
        tables = await connection.fetch(
            "SELECT table_schema, table_name FROM information_schema.tables "
            "WHERE table_schema = ANY($1::text[]) AND table_type = 'BASE TABLE'",
            list(APP_SCHEMAS),
        )
        qualified = ", ".join(
            f'"{row["table_schema"]}"."{row["table_name"]}"' for row in tables
        )
        if qualified:
            await connection.execute(f"TRUNCATE TABLE {qualified} RESTART IDENTITY CASCADE")
        print(f"Cleared {len(tables)} Teleconsult tables.")
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
