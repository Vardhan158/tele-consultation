from fastapi import APIRouter

router = APIRouter(prefix="/reporting", tags=["reporting"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
