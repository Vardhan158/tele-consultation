from fastapi import APIRouter

from teleconsult.kernel.mongodb.client import mongo_database

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/mongodb")
async def mongodb_health() -> dict:
    return await mongo_database.ping()


@router.get("/mongodb/transactions")
async def mongodb_transactions() -> dict:
    return await mongo_database.transaction_probe()
