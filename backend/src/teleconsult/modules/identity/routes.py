from fastapi import APIRouter

router = APIRouter(prefix="/identity", tags=["identity"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
