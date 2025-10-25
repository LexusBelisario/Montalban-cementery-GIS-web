from fastapi import APIRouter, UploadFile, Form
from fastapi.responses import JSONResponse
import tempfile, os, json, joblib, zipfile, numpy as np, geopandas as gpd, pandas as pd
from libpysal.weights import Queen, KNN
from spreg import ML_Lag
from sklearn.preprocessing import StandardScaler
from .slm_pdf import generate_slm_report
import warnings

router = APIRouter()
EXPORT_DIR = os.path.join(os.getcwd(), "exported_models")
os.makedirs(EXPORT_DIR, exist_ok=True)


# ============================================================
# 🔧 Helper: Build spatial weights (handles disconnected polygons)
# ============================================================
def build_spatial_weights(df_clean):
    """
    Build a robust spatial weights matrix that works even for disconnected polygons.
    Automatically connects islands to their nearest neighbors using KNN (k=1).
    """
    warnings.filterwarnings("ignore", category=UserWarning)
    w = Queen.from_dataframe(df_clean)

    if len(w.islands) > 0:
        print(f"⚠️ Found {len(w.islands)} disconnected polygons — connecting via nearest neighbor (KNN=1).")
        w_knn = KNN.from_dataframe(df_clean, k=1)
        for island in w.islands:
            w.neighbors[island] = w_knn.neighbors[island]
        print("✅ All islands connected successfully.")
    else:
        print("✅ No disconnected polygons detected.")

    w.transform = "r"
    return w


# ============================================================
# 🧩 Train from ZIP shapefile
# ============================================================
@router.post("/train-zip")
async def train_spatial_lag_model(
    zip_file: UploadFile,
    independent_vars: str = Form(...),
    dependent_var: str = Form(...),
):
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # === Extract shapefile
            zip_path = os.path.join(tmpdir, zip_file.filename)
            with open(zip_path, "wb") as f:
                f.write(await zip_file.read())

            with zipfile.ZipFile(zip_path, "r") as z:
                z.extractall(tmpdir)

            shp_files = [
                os.path.join(r, f)
                for r, _, files in os.walk(tmpdir)
                for f in files
                if f.endswith(".shp")
            ]
            if not shp_files:
                return JSONResponse(status_code=400, content={"error": "No shapefile found."})

            shp_path = shp_files[0]
            gdf = gpd.read_file(shp_path)
            if not gdf.crs or not gdf.crs.is_projected:
                gdf = gdf.to_crs(epsg=3857)

            # === Clean + prep
            independent_vars = (
                json.loads(independent_vars)
                if independent_vars.startswith("[")
                else independent_vars.split(",")
            )
            independent_vars = [v.strip() for v in independent_vars if v.strip()]
            target = dependent_var.strip()

            missing = [v for v in independent_vars + [target] if v not in gdf.columns]
            if missing:
                return JSONResponse(status_code=400, content={"error": f"Missing columns: {missing}"})

            df_clean = gdf.dropna(subset=independent_vars + [target]).copy()
            X = df_clean[independent_vars].apply(pd.to_numeric, errors="coerce").dropna()
            y = df_clean[target].values.reshape(-1, 1)
            df_clean = df_clean.loc[X.index]

            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X.values)

            # === Build robust weights (auto-connect islands)
            w = build_spatial_weights(df_clean)

            # === Train SLM
            slm = ML_Lag(y, X_scaled, w=w, name_y=target, name_x=independent_vars)
            df_clean["predicted"] = slm.predy.flatten()
            df_clean["residual"] = slm.u.flatten()

            # === Export outputs
            export_id = f"slm_{np.random.randint(100000,999999)}"
            export_path = os.path.join(EXPORT_DIR, export_id)
            os.makedirs(export_path, exist_ok=True)

            model_path = os.path.join(export_path, "trained_slm.pkl")
            pdf_path = os.path.join(export_path, "slm_report.pdf")
            shp_dir = os.path.join(export_path, "predicted_shapefile")
            os.makedirs(shp_dir, exist_ok=True)

            df_clean.to_file(os.path.join(shp_dir, "predicted_output.shp"))

            with zipfile.ZipFile(
                os.path.join(export_path, "predicted_output.zip"), "w", zipfile.ZIP_DEFLATED
            ) as z:
                for r, _, fs in os.walk(shp_dir):
                    for f in fs:
                        z.write(os.path.join(r, f), f)

            joblib.dump(
                {
                    "model": slm,
                    "scaler": scaler,
                    "independent_vars": independent_vars,
                    "dependent_var": target,
                    "weights": w,
                },
                model_path,
            )

            # === Generate PDF report
            generate_slm_report(pdf_path, slm, df_clean, target, independent_vars)

            base_url = "/api/spatial-lag/download"
            print(f"✅ Model trained successfully on {len(df_clean)} records | AIC={slm.aic:.3f} | PseudoR2={slm.pr2:.4f}")
            return {
                "dependent_var": target,
                "metrics": {"AIC": slm.aic, "PseudoR2": slm.pr2},
                "coefficients": {
                    v: float(b) for v, b in zip(independent_vars, slm.betas.flatten()[1:])
                },
                "downloads": {
                    "model": f"{base_url}?file={model_path}",
                    "report": f"{base_url}?file={pdf_path}",
                    "shapefile": f"{base_url}?file={os.path.join(export_path, 'predicted_output.zip')}",
                },
                "message": "Spatial Lag Model trained successfully (ZIP upload).",
            }

    except Exception as e:
        print(f"❌ TRAIN-SLM ERROR: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ============================================================
# 🧩 Train from shapefile components (.shp, .dbf, etc.)
# ============================================================
@router.post("/train")
async def train_spatial_lag_from_shp(
    shapefiles: list[UploadFile],
    independent_vars: str = Form(...),
    dependent_var: str = Form(...),
):
    """Train SLM model from direct shapefile upload (non-zip)."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            for f in shapefiles:
                with open(os.path.join(tmpdir, f.filename), "wb") as out:
                    out.write(await f.read())

            shp_path = next(
                (
                    os.path.join(root, f)
                    for root, _, files in os.walk(tmpdir)
                    for f in files
                    if f.endswith(".shp")
                ),
                None,
            )
            if not shp_path:
                return JSONResponse(status_code=400, content={"error": "No .shp file found."})

            gdf = gpd.read_file(shp_path)
            if not gdf.crs or not gdf.crs.is_projected:
                gdf = gdf.to_crs(epsg=3857)

            independent_vars = (
                json.loads(independent_vars)
                if independent_vars.startswith("[")
                else independent_vars.split(",")
            )
            independent_vars = [v.strip() for v in independent_vars if v.strip()]
            target = dependent_var.strip()

            missing = [v for v in independent_vars + [target] if v not in gdf.columns]
            if missing:
                return JSONResponse(status_code=400, content={"error": f"Missing columns: {missing}"})

            df_clean = gdf.dropna(subset=independent_vars + [target]).copy()
            X = df_clean[independent_vars].apply(pd.to_numeric, errors="coerce").dropna()
            y = df_clean[target].values.reshape(-1, 1)
            df_clean = df_clean.loc[X.index]

            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X.values)

            # === Build robust weights (auto-connect islands)
            w = build_spatial_weights(df_clean)

            # === Train SLM
            slm = ML_Lag(y, X_scaled, w=w, name_y=target, name_x=independent_vars)
            df_clean["predicted"] = slm.predy.flatten()
            df_clean["residual"] = slm.u.flatten()

            # === Export
            export_id = f"slm_{np.random.randint(100000,999999)}"
            export_path = os.path.join(EXPORT_DIR, export_id)
            os.makedirs(export_path, exist_ok=True)

            model_path = os.path.join(export_path, "trained_slm.pkl")
            pdf_path = os.path.join(export_path, "slm_report.pdf")
            shp_dir = os.path.join(export_path, "predicted_shapefile")
            os.makedirs(shp_dir, exist_ok=True)

            df_clean.to_file(os.path.join(shp_dir, "predicted_output.shp"))
            with zipfile.ZipFile(
                os.path.join(export_path, "predicted_output.zip"), "w", zipfile.ZIP_DEFLATED
            ) as z:
                for r, _, fs in os.walk(shp_dir):
                    for f in fs:
                        z.write(os.path.join(r, f), f)

            joblib.dump(
                {
                    "model": slm,
                    "scaler": scaler,
                    "independent_vars": independent_vars,
                    "dependent_var": target,
                    "weights": w,
                },
                model_path,
            )

            generate_slm_report(pdf_path, slm, df_clean, target, independent_vars)

            base_url = "/api/spatial-lag/download"
            print(f"✅ Model trained successfully on {len(df_clean)} records | AIC={slm.aic:.3f} | PseudoR2={slm.pr2:.4f}")
            return {
                "dependent_var": target,
                "metrics": {"AIC": slm.aic, "PseudoR2": slm.pr2},
                "coefficients": {
                    v: float(b) for v, b in zip(independent_vars, slm.betas.flatten()[1:])
                },
                "downloads": {
                    "model": f"{base_url}?file={model_path}",
                    "report": f"{base_url}?file={pdf_path}",
                    "shapefile": f"{base_url}?file={os.path.join(export_path, 'predicted_output.zip')}",
                },
                "message": "Spatial Lag Model trained successfully (from shapefile).",
            }

    except Exception as e:
        print(f"❌ TRAIN-SLM (shapefile) ERROR: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
