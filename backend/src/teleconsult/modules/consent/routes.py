from fastapi import APIRouter

router = APIRouter(prefix="/consent", tags=["consent"])

# Every route MUST use: Depends(require("<permission>")) from teleconsult.kernel.authz
