from fastapi import APIRouter
from .slm_fields import router as fields_router
from .slm_train import router as train_router
from .slm_run_model import router as run_router
from .slm_downloads import router as download_router
from .slm_preview_geojson import router as preview_router

router = APIRouter(prefix="/spatial-lag", tags=["Spatial Lag Model"])

router.include_router(fields_router)
router.include_router(train_router)
router.include_router(run_router)
router.include_router(download_router)
router.include_router(preview_router)
