from fastapi import APIRouter

router = APIRouter(prefix="/support-access", tags=["support_access"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
