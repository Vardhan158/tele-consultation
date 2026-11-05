import asyncio
import asyncpg
from teleconsult.config.settings import get_settings

async def main():
    settings = get_settings()
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    tables = [
        ("patient_portal", "patients"),
        ("patient_portal", "doctors"),
        ("patient_portal", "appointments"),
        ("identity", "user_accounts"),
        ("identity", "auth_sessions"),
        ("payments", "payment_transactions"),
        ("records", "prescriptions"),
        ("records", "consultation_summaries"),
        ("records", "patient_documents"),
        ("notifications", "notifications"),
        ("consultation", "video_sessions"),
        ("support_access", "support_tickets"),
    ]
    for schema, table in tables:
        count = await conn.fetchval(f"SELECT COUNT(*) FROM {schema}.{table}")
        print(f"{schema}.{table}: {count} rows")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
