from fastapi import APIRouter

router = APIRouter(prefix="/consultation", tags=["consultation"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
