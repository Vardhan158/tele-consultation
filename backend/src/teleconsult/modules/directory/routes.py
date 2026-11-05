from fastapi import APIRouter

router = APIRouter(prefix="/directory", tags=["directory"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
