from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse
import geopandas as gpd
import tempfile, os, zipfile

router = APIRouter()


# ============================================================
# 🔹 Extract fields from shapefile
# ============================================================
@router.post("/fields")
async def extract_fields(shapefiles: list[UploadFile]):
    """Extract field names from uploaded shapefile components (.shp, .dbf, etc.)."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            for f in shapefiles:
                with open(os.path.join(tmpdir, f.filename), "wb") as out:
                    out.write(await f.read())

            shp_file = next(
                (f.filename for f in shapefiles if f.filename.endswith(".shp")), None
            )
            if not shp_file:
                return JSONResponse(
                    status_code=400, content={"error": "No .shp file uploaded."}
                )

            gdf = gpd.read_file(os.path.join(tmpdir, shp_file))
            fields = [c for c in gdf.columns if c.lower() != "geometry"]
            return {"fields": fields}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


# ============================================================
# 🔹 Extract fields from ZIP shapefile
# ============================================================
@router.post("/fields-zip")
async def extract_fields_zip(zip_file: UploadFile):
    """Extract available fields from uploaded shapefile ZIP."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, zip_file.filename)
            with open(zip_path, "wb") as f:
                f.write(await zip_file.read())

            with zipfile.ZipFile(zip_path, "r") as archive:
                archive.extractall(tmpdir)

            shp_files = [
                os.path.join(root, f)
                for root, _, files in os.walk(tmpdir)
                for f in files
                if f.endswith(".shp")
            ]

            if len(shp_files) == 0:
                return JSONResponse(
                    status_code=400, content={"error": "No shapefile found in ZIP."}
                )
            if len(shp_files) > 1:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Multiple shapefiles found. Upload only one ZIP."},
                )

            gdf = gpd.read_file(shp_files[0])
            fields = [c for c in gdf.columns if c.lower() != "geometry"]
            return {"fields": fields}

    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
