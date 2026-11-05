from fastapi import APIRouter

router = APIRouter(prefix="/audit", tags=["audit"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
