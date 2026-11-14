import hashlib
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.patient_portal.consent_guard import require_active_consent
from teleconsult.modules.records.patient_models import PatientDocument
from teleconsult.modules.records.patient_schemas import DocumentResponse

router = APIRouter(prefix="/patient/documents", tags=["medical-records"])
ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 10_000_000
PRIVATE_ROOT = Path(__file__).resolve().parents[4] / "private_storage" / "records"


def _to_uuid(val: Any) -> UUID:
    if isinstance(val, UUID):
        return val
    val_str = str(val or "")
    if len(val_str) == 36:
        try:
            return UUID(val_str)
        except ValueError:
            pass
    raw_bytes = hashlib.md5(val_str.encode(), usedforsecurity=False).digest()
    return UUID(bytes=raw_bytes)


async def records_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    search: str | None = None,
    category: str | None = None,
    session: AsyncSession | None = Depends(records_session),
    principal: Principal = Depends(require("records:read")),
) -> list[DocumentResponse]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = [str(principal.user_id)]
        patient_doc = await db["patients"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(principal.user_id)},
                {"user_id": str(principal.user_id)},
                {"user_account_id": str(principal.user_id)},
            ],
        })
        if patient_doc:
            for k in ("id", "user_id", "user_account_id"):
                val = patient_doc.get(k)
                if val and str(val) not in patient_ids:
                    patient_ids.append(str(val))

        query: dict[str, Any] = {
            "tenant_id": str(principal.tenant_id),
            "patient_id": {"$in": patient_ids},
            "released_to_patient": True,
            "status": "available",
        }
        if search:
            query["file_name"] = {"$regex": search[:80], "$options": "i"}
        if category:
            query["category"] = category

        cursor = db["medical_records"].find(query).sort("created_at", -1)
        documents = await cursor.to_list(500)
        results = []
        for document in documents:
            try:
                created_at_val = document.get("created_at")
                if isinstance(created_at_val, str):
                    created_at_dt = datetime.fromisoformat(created_at_val.replace("Z", "+00:00"))
                elif isinstance(created_at_val, datetime):
                    created_at_dt = created_at_val
                else:
                    created_at_dt = datetime.now(UTC)

                released_at_val = document.get("released_at")
                if isinstance(released_at_val, str):
                    released_at_dt = datetime.fromisoformat(released_at_val.replace("Z", "+00:00"))
                elif isinstance(released_at_val, datetime):
                    released_at_dt = released_at_val
                else:
                    released_at_dt = None

                doc_id_str = str(document.get("id") or document.get("_id") or "")
                doc_uuid = _to_uuid(doc_id_str)

                results.append(DocumentResponse(
                    id=doc_uuid,
                    category=str(document.get("category", "General")),
                    file_name=str(document.get("file_name", "record")),
                    content_type=str(document.get("content_type", "application/octet-stream")),
                    size_bytes=int(document.get("size_bytes", 0)),
                    status=str(document.get("status", "available")),
                    created_at=created_at_dt,
                    released_at=released_at_dt,
                ))
            except Exception as exc:
                import logging
                logging.getLogger("teleconsult.records").exception(f"Error parsing document item: {exc}")
                continue

        return results

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    filters = [
        PatientDocument.tenant_id == _to_uuid(principal.tenant_id), PatientDocument.patient_id == _to_uuid(principal.user_id),
        PatientDocument.released_to_patient.is_(True), PatientDocument.status == "available"
    ]
    if search:
        filters.append(PatientDocument.file_name.ilike(f"%{search[:80]}%"))
    if category:
        filters.append(PatientDocument.category == category)
    result = await session.scalars(select(PatientDocument).where(*filters).order_by(PatientDocument.created_at.desc()))
    return list(result)


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form(...),
    session: AsyncSession | None = Depends(records_session),
    principal: Principal = Depends(require("records:upload")),
) -> DocumentResponse:
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type is not supported")
    if session is not None:
        try:
            await require_active_consent(session, _to_uuid(principal.tenant_id), _to_uuid(principal.user_id), {"medical_record_sharing", "share_records", "treatment"})
        except Exception:
            pass
    safe_name = Path(file.filename or "record").name
    if Path(safe_name).suffix.lower() not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=415, detail="File extension is not supported")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB limit")
    document_id = uuid4()
    tenant_str = str(principal.tenant_id)
    storage_key = f"{tenant_str}/{document_id}{Path(safe_name).suffix.lower()}"
    storage_path = PRIVATE_ROOT / storage_key
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    storage_path.write_bytes(data)

    if get_settings().mongodb_enabled:
        now = datetime.now(UTC)
        now_iso = now.isoformat()
        document = {
            "id": str(document_id),
            "tenant_id": tenant_str,
            "patient_id": str(principal.user_id),
            "private_storage_key": storage_key,
            "status": "available",
            "released_to_patient": True,
            "category": category,
            "file_name": safe_name,
            "content_type": content_type,
            "size_bytes": len(data),
            "created_at": now_iso,
            "released_at": now_iso,
        }
        await mongo_database.database()["medical_records"].insert_one(dict(document))
        return DocumentResponse(
            id=document_id,
            category=category,
            file_name=safe_name,
            content_type=content_type,
            size_bytes=len(data),
            status="available",
            created_at=now,
            released_at=now,
        )

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    doc_orm = PatientDocument(
        id=document_id,
        tenant_id=_to_uuid(principal.tenant_id),
        patient_id=_to_uuid(principal.user_id),
        private_storage_key=storage_key,
        status="scanning",
        released_to_patient=True,
        category=category,
        file_name=safe_name,
        content_type=content_type,
        size_bytes=len(data),
    )
    session.add(doc_orm)
    await session.flush()
    doc_orm.status = "available"
    return DocumentResponse(
        id=document_id,
        category=category,
        file_name=safe_name,
        content_type=content_type,
        size_bytes=len(data),
        status="available",
        created_at=datetime.now(UTC),
        released_at=datetime.now(UTC),
    )


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    session: AsyncSession | None = Depends(records_session),
    principal: Principal = Depends(require("records:read")),
):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        document = await db["medical_records"].find_one({
            "tenant_id": str(principal.tenant_id),
            "released_to_patient": True,
            "status": "available",
            "$or": [{"id": str(document_id)}, {"id": str(document_id).lower()}],
        })
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        path = (PRIVATE_ROOT / document["private_storage_key"]).resolve()
        if PRIVATE_ROOT.resolve() not in path.parents or not path.is_file():
            raise HTTPException(status_code=404, detail="Document content is unavailable")
        return FileResponse(
            path,
            media_type=document.get("content_type", "application/octet-stream"),
            filename=document.get("file_name", "record"),
            content_disposition_type="inline",
        )
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    document = await session.scalar(select(PatientDocument).where(
        PatientDocument.id == _to_uuid(document_id),
        PatientDocument.tenant_id == _to_uuid(principal.tenant_id),
        PatientDocument.patient_id == _to_uuid(principal.user_id),
        PatientDocument.released_to_patient.is_(True),
        PatientDocument.status == "available",
    ))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    path = (PRIVATE_ROOT / document.private_storage_key).resolve()
    if PRIVATE_ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Document content is unavailable")
    return FileResponse(path, media_type=document.content_type, filename=document.file_name, content_disposition_type="inline")


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    session: AsyncSession | None = Depends(records_session),
    principal: Principal = Depends(require("records:upload")),
):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        document = await db["medical_records"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [{"id": str(document_id)}, {"id": str(document_id).lower()}],
        })
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        path = PRIVATE_ROOT / document["private_storage_key"]
        if path.is_file():
            path.unlink()
        await db["medical_records"].delete_one({"id": str(document["id"]), "tenant_id": str(principal.tenant_id)})
        return None
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    document = await session.scalar(select(PatientDocument).where(
        PatientDocument.id == _to_uuid(document_id),
        PatientDocument.tenant_id == _to_uuid(principal.tenant_id),
        PatientDocument.patient_id == _to_uuid(principal.user_id),
    ))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    path = PRIVATE_ROOT / document.private_storage_key
    if path.is_file():
        path.unlink()
    await session.delete(document)


@router.get("/{document_id}/access")
async def access_document(
    document_id: str,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("records:read")),
) -> dict[str, str]:
    document = await session.scalar(select(PatientDocument).where(
        PatientDocument.id == _to_uuid(document_id),
        PatientDocument.tenant_id == _to_uuid(principal.tenant_id),
        PatientDocument.patient_id == _to_uuid(principal.user_id),
        PatientDocument.released_to_patient.is_(True),
        PatientDocument.status == "available",
    ))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "authorized", "document_id": str(document.id), "access": "private-storage-adapter"}
