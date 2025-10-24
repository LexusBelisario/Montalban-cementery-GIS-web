from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, FileResponse
import os

router = APIRouter()

@router.get("/download")
async def download_file(file: str = Query(...)):
    if not os.path.exists(file):
        return JSONResponse(status_code=404, content={"error": "File not found"})
    return FileResponse(path=file, filename=os.path.basename(file))
