from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse
import geopandas as gpd, tempfile, os, joblib, zipfile, numpy as np
from libpysal.weights import Queen
from spreg import ML_Lag

router = APIRouter()
EXPORT_DIR = os.path.join(os.getcwd(), "exported_models")

@router.post("/run-saved-model")
async def run_saved_model(model_file: UploadFile, zip_file: UploadFile = None, shapefiles: list[UploadFile] = None):
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = os.path.join(tmpdir, model_file.filename)
            with open(model_path, "wb") as f: f.write(await model_file.read())
            bundle = joblib.load(model_path)
            indep_vars, scaler = bundle["independent_vars"], bundle["scaler"]

            # Load shapefile
            if zip_file:
                zip_path = os.path.join(tmpdir, zip_file.filename)
                with open(zip_path, "wb") as f: f.write(await zip_file.read())
                with zipfile.ZipFile(zip_path, "r") as z: z.extractall(tmpdir)
                shp_files = [os.path.join(r, f) for r, _, fs in os.walk(tmpdir) for f in fs if f.endswith(".shp")]
                shp_path = shp_files[0]
            else:
                for f in shapefiles:
                    with open(os.path.join(tmpdir, f.filename), "wb") as out: out.write(await f.read())
                shp_path = next((os.path.join(tmpdir, f.filename) for f in shapefiles if f.filename.endswith(".shp")), None)

            gdf = gpd.read_file(shp_path)
            if not gdf.crs or not gdf.crs.is_projected: gdf = gdf.to_crs(epsg=3857)

            X = gdf[indep_vars].apply(pd.to_numeric, errors="coerce").dropna()
            X_scaled = scaler.transform(X.values)

            w = Queen.from_dataframe(gdf); w.transform = "r"
            preds = ML_Lag(np.zeros((len(X_scaled), 1)), X_scaled, w=w, name_y="prediction", name_x=indep_vars).predy.flatten()
            gdf["prediction"] = preds

            # Export
            export_id = f"run_slm_{np.random.randint(100000,999999)}"
            export_path = os.path.join(EXPORT_DIR, export_id)
            os.makedirs(export_path, exist_ok=True)
            shp_dir = os.path.join(export_path, "predicted_shapefile")
            os.makedirs(shp_dir, exist_ok=True)
            gdf.to_file(os.path.join(shp_dir, "predicted_output.shp"))

            zip_out = os.path.join(export_path, "predicted_output.zip")
            with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED) as z:
                for r, _, fs in os.walk(shp_dir):
                    for f in fs: z.write(os.path.join(r, f), f)

            return {
                "message": "Predictions completed successfully.",
                "downloads": { "shapefile": f"/api/spatial-lag/download?file={zip_out}" },
                "record_count": len(gdf)
            }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
