import asyncio
import secrets
import pytest
from httpx import AsyncClient, ASGITransport
from teleconsult.main import app
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.config.settings import get_settings


@pytest.mark.asyncio
async def test_duplicate_and_concurrent_block_date_requests() -> None:
    settings = get_settings()
    if settings.mongodb_enabled:
        await mongo_database.connect()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as clinic_admin
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "clinic-admin@teleconsult.local", "password": "AdminPassword123!"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"

        test_date = f"2029-12-{secrets.randbelow(20) + 10:02d}"

        # 2. First block submission -> 200 OK
        res1 = await client.post(
            "/admin/schedules/block-date",
            json={"date": test_date, "reason": "Test Clinic Holiday First Block"},
        )
        assert res1.status_code == 200, f"First block failed: {res1.text}"

        # 3. Sequential duplicate submission -> 409 Conflict
        res2 = await client.post(
            "/admin/schedules/block-date",
            json={"date": test_date, "reason": "Duplicate Attempt"},
        )
        assert res2.status_code == 409, f"Expected 409 for duplicate date, got {res2.status_code}: {res2.text}"
        assert res2.json()["detail"] == "This clinic date is already blocked."

        # 4. Concurrent duplicate submissions -> Only 1 succeeds, rest get 409
        concurrent_date = f"2030-01-{secrets.randbelow(20) + 10:02d}"

        async def send_block():
            return await client.post(
                "/admin/schedules/block-date",
                json={"date": concurrent_date, "reason": "Concurrent Test Block"},
            )

        results = await asyncio.gather(send_block(), send_block(), send_block(), return_exceptions=True)
        status_codes = [r.status_code for r in results if not isinstance(r, Exception)]

        assert 200 in status_codes, f"At least one concurrent request must succeed: {status_codes}"
        assert status_codes.count(200) == 1, f"Only 1 concurrent request can succeed: {status_codes}"
        assert all(sc == 409 for sc in status_codes if sc != 200), f"All secondary requests must be 409: {status_codes}"
