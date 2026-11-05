"""Database-independent async repository primitives for the MongoDB migration."""
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Generic, TypeVar
from uuid import UUID

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.collection import AsyncCollection

Document = dict[str, Any]
T = TypeVar("T", bound=Mapping[str, Any])


def serialize_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): serialize_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [serialize_value(item) for item in value]
    return value


def serialize_document(document: Mapping[str, Any]) -> Document:
    return {str(key): serialize_value(value) for key, value in document.items()}


class MongoRepository(Generic[T]):
    def __init__(self, collection: AsyncCollection[Document]) -> None:
        self.collection = collection

    async def get(self, *, tenant_id: str, document_id: str) -> Document | None:
        return await self.collection.find_one({"tenant_id": tenant_id, "id": document_id})

    async def insert(self, document: Mapping[str, Any]) -> Document:
        value = serialize_document(document)
        await self.collection.insert_one(value)
        return value

    async def update(self, *, tenant_id: str, document_id: str, changes: Mapping[str, Any]) -> bool:
        result = await self.collection.update_one(
            {"tenant_id": tenant_id, "id": document_id},
            {"$set": serialize_document(changes)},
        )
        return result.modified_count == 1

    async def list(
        self,
        *,
        tenant_id: str,
        filters: Mapping[str, Any] | None = None,
        sort_field: str = "created_at",
        descending: bool = True,
        offset: int = 0,
        limit: int = 20,
    ) -> list[Document]:
        query = {"tenant_id": tenant_id, **serialize_document(filters or {})}
        direction = DESCENDING if descending else ASCENDING
        cursor = self.collection.find(query).sort(sort_field, direction).skip(offset).limit(limit)
        return [document async for document in cursor]
