from fastapi import APIRouter

router = APIRouter(prefix="/payments", tags=["payments"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
