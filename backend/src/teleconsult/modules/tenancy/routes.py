from fastapi import APIRouter

router = APIRouter(prefix="/tenancy", tags=["tenancy"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
