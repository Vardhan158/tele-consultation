from fastapi import APIRouter

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
