from fastapi import APIRouter

router = APIRouter(prefix="/scheduling", tags=["scheduling"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
