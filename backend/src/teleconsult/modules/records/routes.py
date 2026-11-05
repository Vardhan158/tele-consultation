from fastapi import APIRouter

router = APIRouter(prefix="/records", tags=["records"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
