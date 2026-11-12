from collections.abc import AsyncIterator
from pathlib import Path
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
MAX_BYTES = 25_000_000
PRIVATE_ROOT = Path(__file__).resolve().parents[4] / "private_storage" / "records"


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
) -> list[PatientDocument]:
    if get_settings().mongodb_enabled:
        query = {"tenant_id": principal.tenant_id, "patient_id": principal.user_id, "released_to_patient": True, "status": "available"}
        if search:
            query["file_name"] = {"$regex": search[:80], "$options": "i"}
        if category:
            query["category"] = category
        documents = mongo_database.database()["medical_records"].find(query).sort("created_at", -1)
        return [DocumentResponse(
            id=UUID(document["id"]), category=document["category"], file_name=document["file_name"],
            content_type=document["content_type"], size_bytes=int(document["size_bytes"]),
            status=document["status"], created_at=document["created_at"], released_at=document.get("released_at"),
        ) async for document in documents]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    filters = [
        PatientDocument.tenant_id == UUID(principal.tenant_id), PatientDocument.patient_id == UUID(principal.user_id),
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
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("records:upload")),
) -> PatientDocument:
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type is not supported")
    await require_active_consent(session, UUID(principal.tenant_id), UUID(principal.user_id), {"medical_record_sharing", "share_records", "treatment"})
    safe_name = Path(file.filename or "record").name
    if Path(safe_name).suffix.lower() not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=415, detail="File extension is not supported")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB limit")
    document_id = uuid4()
    storage_key = f"{UUID(principal.tenant_id)}/{document_id}{Path(safe_name).suffix.lower()}"
    storage_path = PRIVATE_ROOT / storage_key
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    storage_path.write_bytes(data)
    document = PatientDocument(
        id=document_id,
        tenant_id=UUID(principal.tenant_id),
        patient_id=UUID(principal.user_id),
        private_storage_key=storage_key,
        status="scanning",
        released_to_patient=True,
        category=category,
        file_name=safe_name,
        content_type=content_type,
        size_bytes=len(data),
    )
    session.add(document)
    await session.flush()
    # Scanner/storage workers update this state asynchronously in production.
    document.status = "available"
    return document


@router.get("/{document_id}/download")
async def download_document(document_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("records:read"))):
    document = await session.scalar(select(PatientDocument).where(
        PatientDocument.id == document_id, PatientDocument.tenant_id == UUID(principal.tenant_id),
        PatientDocument.patient_id == UUID(principal.user_id), PatientDocument.released_to_patient.is_(True),
        PatientDocument.status == "available"))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    path = (PRIVATE_ROOT / document.private_storage_key).resolve()
    if PRIVATE_ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Document content is unavailable")
    return FileResponse(path, media_type=document.content_type, filename=document.file_name, content_disposition_type="inline")


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("records:upload"))):
    document = await session.scalar(select(PatientDocument).where(
        PatientDocument.id == document_id, PatientDocument.tenant_id == UUID(principal.tenant_id),
        PatientDocument.patient_id == UUID(principal.user_id)))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    path = PRIVATE_ROOT / document.private_storage_key
    if path.is_file():
        path.unlink()
    await session.delete(document)


@router.get("/{document_id}/access")
async def access_document(
    document_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("records:read")),
) -> dict[str, str]:
    document = await session.scalar(select(PatientDocument).where(
        PatientDocument.id == document_id, PatientDocument.tenant_id == UUID(principal.tenant_id),
        PatientDocument.patient_id == UUID(principal.user_id), PatientDocument.released_to_patient.is_(True),
        PatientDocument.status == "available"
    ))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "authorized", "document_id": str(document.id), "access": "private-storage-adapter"}
