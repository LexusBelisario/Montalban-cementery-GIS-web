from fastapi import APIRouter, UploadFile, Form
from fastapi.responses import JSONResponse
import tempfile, os, joblib, json, zipfile
import numpy as np, geopandas as gpd, pandas as pd
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from matplotlib.backends.backend_pdf import PdfPages
import matplotlib.pyplot as plt, seaborn as sns
from datetime import datetime

router = APIRouter()
EXPORT_DIR = os.path.join(os.getcwd(), "exported_models")
os.makedirs(EXPORT_DIR, exist_ok=True)


# ==========================================================
# 🧠 Helper for cleaning & normalization
# ==========================================================
def safe_to_float(x):
    try:
        if pd.isna(x):
            return np.nan
        if isinstance(x, str):
            x = x.strip().replace(",", "")
            if x.lower() in ["", "none", "nan", "null"]:
                return np.nan
            return float(x)
        return float(x)
    except:
        return np.nan

@router.post("/train")
async def train_xgb(
    shapefiles: list[UploadFile] = None,
    independent_vars: str = Form(...),
    dependent_var: str = Form(...),
    scaler_choice: str = Form("None")
):
    try:
        print("🚀 Starting XGBoost training (Shapefile mode)...")
        with tempfile.TemporaryDirectory() as tmpdir:
            # === Save uploaded shapefile parts ===
            for f in shapefiles:
                with open(os.path.join(tmpdir, f.filename), "wb") as out:
                    out.write(await f.read())
            print(f"📁 Uploaded files: {[f.filename for f in shapefiles]}")

            shp = next((f.filename for f in shapefiles if f.filename.endswith(".shp")), None)
            if not shp:
                return JSONResponse(status_code=400, content={"error": "No shapefile found."})

            shp_path = os.path.join(tmpdir, shp)
            print(f"🗺️ Shapefile path: {shp_path}")

            gdf = gpd.read_file(shp_path)
            df_full = pd.DataFrame(gdf.drop(columns="geometry", errors="ignore"))
            df_full.columns = [c.lower().strip() for c in df_full.columns]
            print(f"📊 Columns found: {df_full.columns.tolist()}")

            indep = json.loads(independent_vars) if independent_vars.startswith("[") else independent_vars.split(",")
            indep = [v.lower().strip() for v in indep if v.strip()]
            dep = dependent_var.lower().strip()
            print(f"📌 Independent vars: {indep}")
            print(f"🎯 Dependent var: {dep}")

            # === Validate fields ===
            missing = [v for v in indep + [dep] if v not in df_full.columns]
            if missing:
                print(f"❌ Missing variables: {missing}")
                return JSONResponse(status_code=400, content={"error": f"Missing variables: {missing}"})

            # === Convert to numeric ===
            print("🔢 Cleaning numeric data...")
            for col in indep + [dep]:
                df_full[col] = df_full[col].map(safe_to_float)

            df = df_full.dropna(subset=indep + [dep])
            print(f"✅ Valid numeric rows: {len(df)} / {len(df_full)}")
            if df.empty:
                return JSONResponse(status_code=400, content={"error": "No valid numeric data."})

            X = df[indep]
            y = df[dep]

            # === Train/Test Split ===
            X_train_raw, X_test_raw, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
            print(f"🧪 Train size: {len(X_train_raw)}, Test size: {len(X_test_raw)}")

            # === Scaler ===
            scaler = None
            if scaler_choice == "Standard":
                scaler = StandardScaler().fit(X_train_raw)
                X_train, X_test = scaler.transform(X_train_raw), scaler.transform(X_test_raw)
                print("⚙️ Using StandardScaler")
            elif scaler_choice == "MinMax":
                scaler = MinMaxScaler().fit(X_train_raw)
                X_train, X_test = scaler.transform(X_train_raw), scaler.transform(X_test_raw)
                print("⚙️ Using MinMaxScaler")
            else:
                X_train, X_test = X_train_raw.values, X_test_raw.values
                print("⚙️ No scaler applied")

            # === Train Model ===
            print("🧠 Training XGBoost model...")
            model = XGBRegressor(
                objective="reg:squarederror", n_estimators=500, max_depth=6,
                learning_rate=0.1, subsample=0.8, colsample_bytree=0.8,
                random_state=42, n_jobs=-1
            )
            model.fit(X_train, y_train)
            preds = model.predict(X_test)

            # === Metrics ===
            y_test_array = np.array(y_test).flatten()
            preds_array = np.array(preds).flatten()
            residuals = y_test_array - preds_array

            mse = float(mean_squared_error(y_test_array, preds_array))
            mae = float(mean_absolute_error(y_test_array, preds_array))
            rmse = float(np.sqrt(mse))
            r2 = float(r2_score(y_test_array, preds_array))

            print(f"📈 Model metrics: R²={r2:.4f}, RMSE={rmse:.2f}, MAE={mae:.2f}, MSE={mse:.2f}")

            # === Save Model ===
            export_id = f"xgb_{np.random.randint(100000,999999)}"
            path = os.path.join(EXPORT_DIR, export_id)
            os.makedirs(path, exist_ok=True)
            model_path = os.path.join(path, "xgb_model.pkl")

            joblib.dump({
                "model": model,
                "features": indep,
                "dependent_var": dep,
                "scaler": scaler
            }, model_path)
            print(f"💾 Model saved to: {model_path}")

            # === Predicted Shapefile ===
            df_full["prediction"] = np.nan
            preds_full = model.predict(scaler.transform(df[indep]) if scaler else df[indep].values)
            df_full.loc[df.index, "prediction"] = preds_full
            gdf["prediction"] = df_full["prediction"]

            shp_dir = os.path.join(path, "predicted_shapefile")
            os.makedirs(shp_dir, exist_ok=True)
            shp_out = os.path.join(shp_dir, "predicted_output.shp")
            gdf.to_file(shp_out)
            print(f"🗺️ Shapefile with predictions saved: {shp_out}")

            zip_out = os.path.join(path, "predicted_output.zip")
            with zipfile.ZipFile(zip_out, "w") as z:
                for f in os.listdir(shp_dir):
                    z.write(os.path.join(shp_dir, f), f)
            print(f"📦 Zipped shapefile: {zip_out}")

            # === CSV Export ===
            base_name = os.path.splitext(shp)[0]
            clean_name = base_name.split("_", 1)[-1] if "_" in base_name else base_name
            timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
            csv_filename = f"{clean_name}_XGBoost_CAMA_{timestamp}.csv"
            csv_path = os.path.join(path, csv_filename)
            df_full[indep + [dep, "prediction"]].to_csv(csv_path, index=False)
            print(f"📊 CSV exported: {csv_path}")

            # === PDF REPORT (MULTI-PAGE) ===
            print("📄 Generating multi-page PDF report...")
            accent = "#1e88e5"
            pdf_path = os.path.join(path, "xgb_report.pdf")
            importance = model.feature_importances_

            with PdfPages(pdf_path) as pp:
                # --- PAGE 1: Metrics Table ---
                fig, ax = plt.subplots(figsize=(6, 1.5))
                ax.axis("off")
                table = ax.table(
                    cellText=[
                        ["Model", "MSE", "MAE", "RMSE", "R²"],
                        ["XGBoost", f"{mse:.2f}", f"{mae:.2f}", f"{rmse:.2f}", f"{r2:.2f}"],
                    ],
                    loc="center", cellLoc="center",
                )
                table.scale(1, 2)
                for (i, j), cell in table.get_celld().items():
                    if i == 0:
                        cell.set_facecolor(accent)
                        cell.set_text_props(weight='bold', color='white')
                    else:
                        cell.set_facecolor('#f0f0f0')
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 2: Feature Importance ---
                fig, ax = plt.subplots(figsize=(8, 4))
                ax.barh(indep, importance, color=accent)
                ax.set_xlabel("Importance (Gain)")
                ax.set_title("Feature Importance", color=accent, fontsize=13, weight='bold', pad=10)
                ax.spines['top'].set_visible(False)
                ax.spines['right'].set_visible(False)
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 3: Actual vs Predicted ---
                fig, ax = plt.subplots(figsize=(6, 6))
                ax.scatter(y_test_array, preds_array, alpha=0.6, color=accent, edgecolor="black", linewidth=0.5)
                ax.plot([min(y_test_array), max(y_test_array)],
                        [min(y_test_array), max(y_test_array)],
                        "k--", lw=1.5, label="Perfect Prediction")
                ax.set_xlabel("Actual Values")
                ax.set_ylabel("Predicted Values")
                ax.set_title("Actual vs Predicted Scatter Plot", color=accent, fontsize=13, weight='bold', pad=10)
                ax.legend()
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 4: Residuals vs Predicted ---
                fig, ax = plt.subplots(figsize=(6, 6))
                ax.scatter(preds_array, residuals, alpha=0.6, color="#e53935", edgecolor="black", linewidth=0.5)
                ax.axhline(y=0, color="black", linestyle="--", linewidth=1.5, label="Zero Line")
                ax.set_xlabel("Predicted Values")
                ax.set_ylabel("Residuals (Actual - Predicted)")
                ax.set_title("Residuals vs Predicted Values", color="#e53935", fontsize=13, weight='bold', pad=10)
                ax.legend()
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 5: Residual Distribution ---
                fig, ax = plt.subplots(figsize=(6, 4))
                sns.histplot(residuals, kde=True, ax=ax, color=accent, edgecolor="black")
                ax.set_title("Residual Distribution", color=accent, fontsize=13, weight='bold', pad=10)
                ax.set_xlabel("Residual")
                ax.set_ylabel("Frequency")
                ax.spines['top'].set_visible(False)
                ax.spines['right'].set_visible(False)
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

            print(f"📘 PDF report saved: {pdf_path}")

            # === Return ===
            print(f"✅ Training completed successfully for {len(df)} valid records.")
            base_url = "/api/xgb/download"
            counts, bins = np.histogram(residuals, bins=20)
            bin_centers = 0.5 * (bins[:-1] + bins[1:])
            return {
                "message": "✅ XGBoost trained successfully.",
                "dependent_var": dep,
                "metrics": {"R²": r2, "RMSE": rmse, "MAE": mae, "MSE": mse},
                "features": indep,
                "importance": importance.tolist(),
                "downloads": {
                    "model": f"{base_url}?file={model_path}",
                    "report": f"{base_url}?file={pdf_path}",
                    "shapefile": f"{base_url}?file={zip_out}",
                    "cama_csv": f"{base_url}?file={csv_path}",
                },
                "y_test": y_test_array.tolist(),
                "preds": preds_array.tolist(),
                "residual_bins": bin_centers.tolist(),
                "residual_counts": counts.tolist(),
                "isRunMode": False
            }

    except Exception as e:
        import traceback
        print(f"❌ TRAIN ERROR: {e}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.post("/train-zip")
async def train_xgb_zip(
    zip_file: UploadFile,
    independent_vars: str = Form(...),
    dependent_var: str = Form(...),
    scaler_choice: str = Form("None")
):
    import zipfile as zf
    try:
        print("🚀 Starting XGBoost training (ZIP mode)...")
        with tempfile.TemporaryDirectory() as tmpdir:
            # === Save ZIP ===
            zip_path = os.path.join(tmpdir, zip_file.filename)
            with open(zip_path, "wb") as out:
                out.write(await zip_file.read())
            print(f"📦 ZIP file received: {zip_path}")

            # === Extract contents ===
            extract_dir = os.path.join(tmpdir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            with zf.ZipFile(zip_path, "r") as archive:
                archive.extractall(extract_dir)
            print(f"📂 Extracted ZIP contents: {os.listdir(extract_dir)}")

            # === Find shapefile ===
            shp_path = next(
                (os.path.join(root, f)
                 for root, _, files in os.walk(extract_dir)
                 for f in files if f.endswith(".shp")),
                None
            )
            if not shp_path:
                print("❌ No .shp file found inside ZIP!")
                return JSONResponse(status_code=400, content={"error": "No .shp file found in ZIP."})

            print(f"🗺️ Using shapefile: {shp_path}")

            # === Read shapefile ===
            gdf = gpd.read_file(shp_path)
            df_full = pd.DataFrame(gdf.drop(columns="geometry", errors="ignore"))
            df_full.columns = [c.lower().strip() for c in df_full.columns]
            print(f"📊 Columns found: {df_full.columns.tolist()}")

            # === Parse variables ===
            indep = json.loads(independent_vars) if independent_vars.startswith("[") else independent_vars.split(",")
            indep = [v.lower().strip() for v in indep if v.strip()]
            dep = dependent_var.lower().strip()
            print(f"📌 Independent vars: {indep}")
            print(f"🎯 Dependent var: {dep}")

            # === Validate fields ===
            missing = [v for v in indep + [dep] if v not in df_full.columns]
            if missing:
                print(f"❌ Missing variables: {missing}")
                return JSONResponse(status_code=400, content={"error": f"Missing variables: {missing}"})

            # === Clean numeric data ===
            print("🔢 Cleaning numeric data...")
            for col in indep + [dep]:
                df_full[col] = df_full[col].map(safe_to_float)

            df = df_full.dropna(subset=indep + [dep])
            print(f"✅ Valid numeric rows: {len(df)} / {len(df_full)}")
            if df.empty:
                return JSONResponse(status_code=400, content={"error": "No valid numeric data."})

            # === Split dataset ===
            X = df[indep]
            y = df[dep]
            X_train_raw, X_test_raw, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
            print(f"🧪 Train size: {len(X_train_raw)}, Test size: {len(X_test_raw)}")

            # === Scaler ===
            scaler = None
            if scaler_choice == "Standard":
                scaler = StandardScaler().fit(X_train_raw)
                X_train, X_test = scaler.transform(X_train_raw), scaler.transform(X_test_raw)
                print("⚙️ Using StandardScaler")
            elif scaler_choice == "MinMax":
                scaler = MinMaxScaler().fit(X_train_raw)
                X_train, X_test = scaler.transform(X_train_raw), scaler.transform(X_test_raw)
                print("⚙️ Using MinMaxScaler")
            else:
                X_train, X_test = X_train_raw.values, X_test_raw.values
                print("⚙️ No scaler applied")

            # === Train Model ===
            print("🧠 Training XGBoost model...")
            model = XGBRegressor(
                objective="reg:squarederror", n_estimators=500, max_depth=6,
                learning_rate=0.1, subsample=0.8, colsample_bytree=0.8,
                random_state=42, n_jobs=-1
            )
            model.fit(X_train, y_train)
            preds = model.predict(X_test)

            # === Metrics ===
            y_test_array = np.array(y_test).flatten()
            preds_array = np.array(preds).flatten()
            residuals = y_test_array - preds_array

            mse = float(mean_squared_error(y_test_array, preds_array))
            mae = float(mean_absolute_error(y_test_array, preds_array))
            rmse = float(np.sqrt(mse))
            r2 = float(r2_score(y_test_array, preds_array))

            print(f"📈 Model metrics: R²={r2:.4f}, RMSE={rmse:.2f}, MAE={mae:.2f}, MSE={mse:.2f}")

            # === Save Model ===
            export_id = f"zip_xgb_{np.random.randint(100000,999999)}"
            path = os.path.join(EXPORT_DIR, export_id)
            os.makedirs(path, exist_ok=True)
            model_path = os.path.join(path, "xgb_model.pkl")

            joblib.dump({
                "model": model,
                "features": indep,
                "dependent_var": dep,
                "scaler": scaler
            }, model_path)
            print(f"💾 Model saved to: {model_path}")

            # === Predicted Shapefile ===
            df_full["prediction"] = np.nan
            preds_full = model.predict(scaler.transform(df[indep]) if scaler else df[indep].values)
            df_full.loc[df.index, "prediction"] = preds_full
            gdf["prediction"] = df_full["prediction"]

            shp_dir = os.path.join(path, "predicted_shapefile")
            os.makedirs(shp_dir, exist_ok=True)
            shp_out = os.path.join(shp_dir, "predicted_output.shp")
            gdf.to_file(shp_out)
            print(f"🗺️ Predicted shapefile saved: {shp_out}")

            # === ZIP predicted shapefile ===
            zip_out = os.path.join(path, "predicted_output.zip")
            with zf.ZipFile(zip_out, "w", zf.ZIP_DEFLATED) as z:
                for root, _, files in os.walk(shp_dir):
                    for f in files:
                        z.write(os.path.join(root, f), f)
            print(f"📦 Zipped shapefile: {zip_out}")

            # === CSV Export ===
            timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
            csv_path = os.path.join(path, f"xgb_results_{timestamp}.csv")
            df_full[indep + [dep, "prediction"]].to_csv(csv_path, index=False)
            print(f"📊 CSV exported: {csv_path}")

            # === PDF REPORT (MULTI-PAGE) ===
            print("📄 Generating multi-page PDF report...")
            accent = "#1e88e5"
            pdf_path = os.path.join(path, "xgb_report.pdf")
            importance = model.feature_importances_

            with PdfPages(pdf_path) as pp:
                # --- PAGE 1: Metrics Table ---
                fig, ax = plt.subplots(figsize=(6, 1.5))
                ax.axis("off")
                table = ax.table(
                    cellText=[
                        ["Model", "MSE", "MAE", "RMSE", "R²"],
                        ["XGBoost", f"{mse:.2f}", f"{mae:.2f}", f"{rmse:.2f}", f"{r2:.2f}"],
                    ],
                    loc="center", cellLoc="center",
                )
                table.scale(1, 2)
                for (i, j), cell in table.get_celld().items():
                    if i == 0:
                        cell.set_facecolor(accent)
                        cell.set_text_props(weight='bold', color='white')
                    else:
                        cell.set_facecolor('#f0f0f0')
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 2: Feature Importance ---
                fig, ax = plt.subplots(figsize=(8, 4))
                ax.barh(indep, importance, color=accent)
                ax.set_xlabel("Importance (Gain)")
                ax.set_title("Feature Importance", color=accent, fontsize=13, weight='bold', pad=10)
                ax.spines['top'].set_visible(False)
                ax.spines['right'].set_visible(False)
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 3: Actual vs Predicted ---
                fig, ax = plt.subplots(figsize=(6, 6))
                ax.scatter(y_test_array, preds_array, alpha=0.6, color=accent, edgecolor="black", linewidth=0.5)
                ax.plot([min(y_test_array), max(y_test_array)],
                        [min(y_test_array), max(y_test_array)],
                        "k--", lw=1.5, label="Perfect Prediction")
                ax.set_xlabel("Actual Values")
                ax.set_ylabel("Predicted Values")
                ax.set_title("Actual vs Predicted Scatter Plot", color=accent, fontsize=13, weight='bold', pad=10)
                ax.legend()
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 4: Residuals vs Predicted ---
                fig, ax = plt.subplots(figsize=(6, 6))
                ax.scatter(preds_array, residuals, alpha=0.6, color="#e53935", edgecolor="black", linewidth=0.5)
                ax.axhline(y=0, color="black", linestyle="--", linewidth=1.5, label="Zero Line")
                ax.set_xlabel("Predicted Values")
                ax.set_ylabel("Residuals (Actual - Predicted)")
                ax.set_title("Residuals vs Predicted Values", color="#e53935", fontsize=13, weight='bold', pad=10)
                ax.legend()
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

                # --- PAGE 5: Residual Distribution ---
                fig, ax = plt.subplots(figsize=(6, 4))
                sns.histplot(residuals, kde=True, ax=ax, color=accent, edgecolor="black")
                ax.set_title("Residual Distribution", color=accent, fontsize=13, weight='bold', pad=10)
                ax.set_xlabel("Residual")
                ax.set_ylabel("Frequency")
                ax.spines['top'].set_visible(False)
                ax.spines['right'].set_visible(False)
                plt.tight_layout()
                pp.savefig(fig, facecolor="white")
                plt.close(fig)

            print(f"📘 PDF report saved: {pdf_path}")

            # === Return ===
            print(f"✅ ZIP training completed successfully for {len(df)} valid records.")
            base_url = "/api/xgb/download"

            counts, bins = np.histogram(residuals, bins=20)
            bin_centers = 0.5 * (bins[:-1] + bins[1:])

            return {
                "message": "✅ XGBoost trained successfully from ZIP.",
                "dependent_var": dep,
                "metrics": {
                    "R²": r2,
                    "RMSE": rmse,
                    "MAE": mae,
                    "MSE": mse
                },
                "features": indep,
                "importance": importance.tolist(),
                "downloads": {
                    "model": f"{base_url}?file={model_path}",
                    "report": f"{base_url}?file={pdf_path}",
                    "shapefile": f"{base_url}?file={zip_out}",
                    "cama_csv": f"{base_url}?file={csv_path}",
                },
                "y_test": y_test_array.tolist(),
                "preds": preds_array.tolist(),
                "residual_bins": bin_centers.tolist(),
                "residual_counts": counts.tolist(),
                "isRunMode": False
            }

    except Exception as e:
        import traceback
        print(f"❌ TRAIN-ZIP ERROR: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )



# sdsdsdsd