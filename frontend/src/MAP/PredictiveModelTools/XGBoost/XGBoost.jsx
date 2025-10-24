import React, { useState } from "react";
import Plot from "react-plotly.js";
import API from "../../../api.js";
import PredictedMapModal from "../PredictedMapModal.jsx";

const XGBoost = ({ onClose }) => {
  // BLGF 3-color palette
  const C = {
    gold: "#F7C800", // gold yellow
    purple: "#4B1F78", // deep purple
    offwhite: "#F5F6FA", // near-white (not pure white)
  };

  // helper classes (consistent look)
  const ring = "focus:outline-none focus:ring-2 focus:ring-[#4B1F78]/40";
  const trans = "transition-colors duration-150";
  const btnBase = `rounded-lg border px-4 py-2 font-medium ${ring} ${trans} hover:brightness-105 active:brightness-95`;
  const btnAccent = `${btnBase}`; // gold background, purple text
  const btnPrimary = `${btnBase}`; // purple background, offwhite text
  const btnGhost = `${btnBase}`; // offwhite background, purple text

  const [files, setFiles] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [uploadMode, setUploadMode] = useState("shapefile");
  const [fields, setFields] = useState([]);
  const [independentVars, setIndependentVars] = useState([]);
  const [dependentVar, setDependentVar] = useState("");
  const [scaler, setScaler] = useState("None");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Run saved model state
  const [showRunModal, setShowRunModal] = useState(false);
  const [modelFile, setModelFile] = useState(null);
  const [runFiles, setRunFiles] = useState([]);
  const [runZipFile, setRunZipFile] = useState(null);
  const [runUploadMode, setRunUploadMode] = useState("shapefile");

  const [showPredictedMap, setShowPredictedMap] = useState(false);
  const [previewPath, setPreviewPath] = useState(null);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [fullscreenGraph, setFullscreenGraph] = useState(null);

  // ---------- file loaders ----------
  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;
    setFiles(selectedFiles);
    setZipFile(null);
    setFields([]);
    setIndependentVars([]);
    setDependentVar("");
    setResult(null);

    try {
      const fd = new FormData();
      selectedFiles.forEach((f) => fd.append("shapefiles", f));
      const res = await fetch(`${API}/xgb/fields`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.fields) setFields(data.fields);
      else alert(data.error || "Unable to extract fields.");
    } catch (err) {
      console.error(err);
      alert("Error reading shapefile fields.");
    }
  };

  const handleZipChange = async (e) => {
    const z = e.target.files?.[0];
    if (!z) return;
    setZipFile(z);
    setFiles([]);
    setFields([]);
    setIndependentVars([]);
    setDependentVar("");
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("zip_file", z);
      const res = await fetch(`${API}/xgb/fields`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.fields) setFields(data.fields);
      else alert(data.error || "Unable to extract fields from ZIP.");
    } catch (err) {
      console.error(err);
      alert("Error reading ZIP fields.");
    }
  };

  // ---------- train ----------
  const handleTrainModel = async () => {
    if (files.length === 0 && !zipFile)
      return alert("Please upload a shapefile or ZIP.");
    if (independentVars.length === 0)
      return alert("Select independent variables.");
    if (!dependentVar) return alert("Select dependent variable.");

    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      let endpoint = `${API}/xgb/train`;
      if (zipFile) {
        endpoint = `${API}/xgb/train-zip`;
        fd.append("zip_file", zipFile);
      } else {
        files.forEach((f) => fd.append("shapefiles", f));
      }
      fd.append("independent_vars", JSON.stringify(independentVars));
      fd.append("dependent_var", dependentVar);
      fd.append("scaler_choice", scaler);

      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        console.error(data);
        alert(`Error: ${data.error || res.statusText}`);
      } else {
        setResult(data);
        alert("✅ XGBoost model training completed!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- run saved ----------
  const handleRunModel = async () => {
    if (!modelFile) return alert("Please select a saved model (.pkl)");
    if (runFiles.length === 0 && !runZipFile)
      return alert("Please upload a shapefile or ZIP to predict.");

    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("model_file", modelFile);
      if (runZipFile) fd.append("zip_file", runZipFile);
      else runFiles.forEach((f) => fd.append("shapefiles", f));

      const res = await fetch(`${API}/xgb/run-saved-model`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!res.ok) {
        console.error(data);
        alert(`Error: ${data.error || res.statusText}`);
      } else {
        setResult(data);
        alert("✅ Prediction completed!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend.");
    } finally {
      setLoading(false);
      setShowRunModal(false);
      setModelFile(null);
      setRunFiles([]);
      setRunZipFile(null);
    }
  };

  const toggleIndependentVar = (f) =>
    setIndependentVars((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );

  // ---------- plots ----------
  const plotLayoutBase = {
    paper_bgcolor: C.offwhite,
    plot_bgcolor: C.offwhite,
    font: { color: C.purple },
    hoverlabel: {
      bgcolor: C.offwhite,
      bordercolor: C.gold,
      font: { color: C.purple },
    },
    margin: { l: 60, r: 30, t: 60, b: 60 },
  };
  const plotConfig = (fn) => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    scrollZoom: true,
    toImageButtonOptions: { format: "png", filename: fn },
    modeBarButtonsToRemove: ["select2d", "lasso2d"],
  });

  return (
    // simple dark overlay + subtle blur
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      {/* modal */}
      <div
        className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden border"
        style={{ background: C.offwhite, borderColor: "rgba(75,31,120,0.2)" }}
      >
        {/* header */}
        <div
          className="px-6 py-4 flex justify-between items-center"
          style={{ background: C.purple, color: C.offwhite }}
        >
          <h3 className="text-lg font-semibold">⚙️ XGBoost Regression</h3>
          <button
            onClick={onClose}
            className={`${ring} ${trans} hover:brightness-110 text-xl rounded-md px-2`}
            aria-label="Close"
            style={{ color: C.offwhite }}
          >
            ✕
          </button>
        </div>

        {/* content */}
        <div
          className="p-6 space-y-4 max-h-[75vh] overflow-y-auto"
          style={{ color: C.purple }}
        >
          {/* upload method */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Upload Method
            </label>
            <div className="flex gap-2">
              {["shapefile", "zip"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setUploadMode(mode);
                    if (mode === "zip") setFiles([]);
                    else setZipFile(null);
                    setFields([]);
                    setIndependentVars([]);
                    setDependentVar("");
                  }}
                  className={`${btnGhost}`}
                  style={{
                    background: uploadMode === mode ? C.purple : C.offwhite,
                    color: uploadMode === mode ? C.offwhite : C.purple,
                    borderColor: "rgba(75,31,120,0.25)",
                  }}
                >
                  {mode === "shapefile" ? "📄 Shapefile" : "📦 ZIP File"}
                </button>
              ))}
            </div>
          </div>

          {/* file upload */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {uploadMode === "shapefile"
                ? "Upload Shapefile (.shp, .dbf, .shx, .prj)"
                : "Upload ZIP File"}
            </label>
            <div className="flex items-center gap-3">
              {uploadMode === "shapefile" ? (
                <>
                  <input
                    id="xgbShpInput"
                    type="file"
                    multiple
                    accept=".shp,.dbf,.shx,.prj"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    onClick={() =>
                      document.getElementById("xgbShpInput").click()
                    }
                    className={`${btnAccent}`}
                    style={{
                      background: C.gold,
                      color: C.purple,
                      borderColor: "rgba(75,31,120,0.25)",
                    }}
                  >
                    📂 Select Files
                  </button>
                  <span className="text-xs truncate flex-1 opacity-80">
                    {files.length
                      ? files.map((f) => f.name).join(", ")
                      : "No files selected"}
                  </span>
                </>
              ) : (
                <>
                  <input
                    id="xgbZipInput"
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={handleZipChange}
                  />
                  <button
                    onClick={() =>
                      document.getElementById("xgbZipInput").click()
                    }
                    className={`${btnAccent}`}
                    style={{
                      background: C.gold,
                      color: C.purple,
                      borderColor: "rgba(75,31,120,0.25)",
                    }}
                  >
                    📦 Select ZIP
                  </button>
                  <span className="text-xs truncate flex-1 opacity-80">
                    {zipFile ? zipFile.name : "No ZIP selected"}
                  </span>
                </>
              )}
            </div>
          </div>

          <hr
            className="border-0 h-px"
            style={{ background: "rgba(75,31,120,0.15)" }}
          />

          {/* variable selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Independent Variables
            </label>
            <div
              className="rounded-lg p-3 max-h-40 overflow-y-auto border"
              style={{
                borderColor: "rgba(75,31,120,0.25)",
                background: "#fff",
              }}
            >
              {fields.length ? (
                fields.map((f) => (
                  <label
                    key={f}
                    className="flex items-center gap-2 p-2 rounded cursor-pointer hover:brightness-105"
                  >
                    <input
                      type="checkbox"
                      checked={independentVars.includes(f)}
                      onChange={() => toggleIndependentVar(f)}
                      className="w-4 h-4"
                      style={{ accentColor: C.gold }}
                    />
                    <span className="text-sm">{f}</span>
                  </label>
                ))
              ) : (
                <p className="text-xs italic text-center py-2 opacity-70">
                  No fields loaded yet.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Dependent Variable
            </label>
            <select
              value={dependentVar}
              onChange={(e) => setDependentVar(e.target.value)}
              className={`w-full rounded-lg px-3 py-2 border ${ring} ${trans} hover:brightness-105`}
              style={{
                borderColor: "rgba(75,31,120,0.25)",
                color: C.purple,
                background: C.offwhite,
              }}
            >
              <option value="">-- Select --</option>
              {fields.map((f) => (
                <option key={f} value={f} className="bg-[#F5F6FA]">
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Scaler</label>
            <select
              value={scaler}
              onChange={(e) => setScaler(e.target.value)}
              className={`w-full rounded-lg px-3 py-2 border ${ring} ${trans} hover:brightness-105`}
              style={{
                borderColor: "rgba(75,31,120,0.25)",
                color: C.purple,
                background: C.offwhite,
              }}
            >
              <option className="bg-[#F5F6FA]">None</option>
              <option className="bg-[#F5F6FA]">Standard</option>
              <option className="bg-[#F5F6FA]">MinMax</option>
            </select>
          </div>

          {/* actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTrainModel}
              disabled={loading}
              className={`${btnAccent} flex-1 disabled:opacity-50`}
              style={{
                background: C.gold,
                color: C.purple,
                borderColor: "rgba(75,31,120,0.25)",
              }}
            >
              {loading ? "Training..." : "Train Model"}
            </button>
            <button
              onClick={() => setShowRunModal(true)}
              disabled={loading}
              className={`${btnPrimary} flex-1 disabled:opacity-50`}
              style={{
                background: C.purple,
                color: C.offwhite,
                borderColor: "rgba(75,31,120,0.25)",
              }}
            >
              Run Saved Model
            </button>
          </div>

          {/* results */}
          {result && (
            <div
              className="mt-6 rounded-xl p-4 space-y-4 border"
              style={{
                borderColor: "rgba(75,31,120,0.2)",
                color: C.purple,
                background: C.offwhite,
              }}
            >
              {result.metrics ? (
                <>
                  <h3 className="text-base font-semibold">
                    🧠 XGBoost Model Summary
                  </h3>
                  <p className="text-sm">
                    Dependent Variable:{" "}
                    <span className="font-semibold" style={{ color: C.gold }}>
                      {result.dependent_var}
                    </span>
                  </p>

                  {/* metrics table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid rgba(75,31,120,0.25)",
                          }}
                        >
                          <th className="text-left p-2">Metric</th>
                          <th className="text-right p-2">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(result.metrics || {}).map(([k, v]) => (
                          <tr
                            key={k}
                            className="hover:brightness-105"
                            style={{
                              borderBottom: "1px solid rgba(75,31,120,0.12)",
                            }}
                          >
                            <td className="p-2">{k}</td>
                            <td
                              className="text-right p-2 font-mono"
                              style={{ color: C.gold }}
                            >
                              {typeof v === "number" ? v.toFixed(6) : v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* importance table */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Feature Importance
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr
                            style={{
                              borderBottom: "1px solid rgba(75,31,120,0.25)",
                            }}
                          >
                            <th className="text-left p-2">Feature</th>
                            <th className="text-right p-2">Importance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.features?.map((feat, i) => (
                            <tr
                              key={feat}
                              className="hover:brightness-105"
                              style={{
                                borderBottom: "1px solid rgba(75,31,120,0.12)",
                              }}
                            >
                              <td className="p-2">{feat}</td>
                              <td
                                className="text-right p-2 font-mono"
                                style={{ color: C.gold }}
                              >
                                {result.importance[i]?.toFixed(6) || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Downloads */}
                  {result.downloads && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Downloads</h4>
                      <ul className="space-y-1 text-sm">
                        {result.downloads.model && (
                          <li>
                            <a
                              href={result.downloads.model}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:underline"
                              style={{ color: C.purple }}
                            >
                              📦 Model (.pkl)
                            </a>
                          </li>
                        )}
                        {result.downloads.report && (
                          <li>
                            <a
                              href={result.downloads.report}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:underline"
                              style={{ color: C.purple }}
                            >
                              📄 PDF Report
                            </a>
                          </li>
                        )}
                        {result.downloads.shapefile && (
                          <li>
                            <a
                              href={result.downloads.shapefile}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:underline"
                              style={{ color: C.purple }}
                            >
                              🗺️ Predicted Shapefile (.zip)
                            </a>
                          </li>
                        )}
                        {result.downloads.cama_csv && (
                          <li>
                            <a
                              href={result.downloads.cama_csv}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:underline"
                              style={{ color: C.purple }}
                            >
                              📊 Full CAMA Table (CSV)
                            </a>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={() => setShowResultsPanel((s) => !s)}
                    className={`${btnPrimary} w-full`}
                    style={{
                      background: C.purple,
                      color: C.offwhite,
                      borderColor: "rgba(75,31,120,0.25)",
                    }}
                  >
                    {showResultsPanel
                      ? "Hide Graphs & Tables"
                      : "Show Graphs & Tables"}
                  </button>
                </>
              ) : (
                <>
                  {result.downloads?.shapefile && (
                    <button
                      onClick={() => {
                        const link = `${API}/xgb/preview-geojson?file_path=${encodeURIComponent(
                          result.downloads.shapefile
                        )}`;
                        setPreviewPath(link);
                        setShowPredictedMap(true);
                      }}
                      className={`${btnPrimary} w-full`}
                      style={{
                        background: C.purple,
                        color: C.offwhite,
                        borderColor: "rgba(75,31,120,0.25)",
                      }}
                    >
                      🗺️ Show Predicted Values in the Map
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Graphs Modal */}
      {showResultsPanel && result?.metrics && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div
            className="rounded-2xl w-full max-w-7xl max-h-[90vh] overflow-y-auto border"
            style={{
              background: C.offwhite,
              borderColor: "rgba(75,31,120,0.2)",
              color: C.purple,
            }}
          >
            <div
              className="sticky top-0 px-6 py-4 flex justify-between items-center border-b"
              style={{
                background: C.purple,
                color: C.offwhite,
                borderColor: "rgba(75,31,120,0.2)",
              }}
            >
              <h2 className="text-lg font-semibold">
                📊 XGBoost Model Results
              </h2>
              <button
                onClick={() => setShowResultsPanel(false)}
                className={`${ring} ${trans} hover:brightness-110 text-2xl rounded-md px-2`}
                style={{ color: C.offwhite }}
              >
                ✕
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { key: "importance", title: "Feature Importance" },
                { key: "residuals", title: "Residual Distribution" },
                { key: "actual_pred", title: "Actual vs Predicted" },
                { key: "resid_pred", title: "Residuals vs Predicted" },
              ].map((g) => (
                <div
                  key={g.key}
                  className="rounded-xl p-4 border cursor-pointer hover:brightness-105"
                  onClick={() => setFullscreenGraph(g.key)}
                  style={{
                    background: C.offwhite,
                    borderColor: "rgba(75,31,120,0.2)",
                  }}
                >
                  <h4 className="font-medium mb-3">{g.title}</h4>

                  {g.key === "importance" && (
                    <Plot
                      data={[
                        {
                          x: result.features,
                          y: result.importance,
                          type: "bar",
                          marker: { color: C.gold },
                        },
                      ]}
                      layout={{
                        ...plotLayoutBase,
                        margin: { l: 40, r: 20, t: 20, b: 30 },
                        xaxis: { showticklabels: false },
                      }}
                      config={plotConfig(g.key)}
                      useResizeHandler
                      style={{ width: "100%", height: 250 }}
                    />
                  )}

                  {g.key === "residuals" && (
                    <Plot
                      data={[
                        {
                          type: "bar",
                          x: result.residual_bins,
                          y: result.residual_counts,
                          marker: {
                            color: C.gold,
                            line: { color: C.purple, width: 1 },
                          },
                        },
                      ]}
                      layout={{
                        ...plotLayoutBase,
                        margin: { l: 40, r: 20, t: 20, b: 30 },
                      }}
                      config={plotConfig("residual_distribution")}
                      useResizeHandler
                      style={{ width: "100%", height: 250 }}
                    />
                  )}

                  {g.key === "actual_pred" && (
                    <Plot
                      data={[
                        {
                          x: result.y_test,
                          y: result.preds,
                          mode: "markers",
                          type: "scatter",
                          marker: {
                            color: C.gold,
                            size: 6,
                            opacity: 0.8,
                            line: { color: C.purple, width: 0.5 },
                          },
                        },
                        {
                          x: result.y_test,
                          y: result.y_test,
                          mode: "lines",
                          line: { color: C.purple, dash: "dash", width: 2 },
                        },
                      ]}
                      layout={{
                        ...plotLayoutBase,
                        margin: { l: 40, r: 20, t: 20, b: 30 },
                        showlegend: false,
                      }}
                      config={plotConfig(g.key)}
                      useResizeHandler
                      style={{ width: "100%", height: 250 }}
                    />
                  )}

                  {g.key === "resid_pred" && (
                    <Plot
                      data={[
                        {
                          x: result.preds,
                          y: result.residuals,
                          mode: "markers",
                          type: "scatter",
                          marker: { color: C.purple, size: 6, opacity: 0.8 },
                        },
                        {
                          x: result.preds,
                          y: Array(result.preds?.length).fill(0),
                          mode: "lines",
                          line: { color: C.purple, dash: "dash", width: 2 },
                        },
                      ]}
                      layout={{
                        ...plotLayoutBase,
                        margin: { l: 40, r: 20, t: 20, b: 30 },
                        showlegend: false,
                      }}
                      config={plotConfig(g.key)}
                      useResizeHandler
                      style={{ width: "100%", height: 250 }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen chart */}
      {fullscreenGraph && result && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10001] p-4"
          onClick={() => setFullscreenGraph(null)}
        >
          <div
            className="rounded-2xl w-full max-w-6xl max-height-[90vh] overflow-hidden border"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.offwhite,
              borderColor: "rgba(75,31,120,0.2)",
              color: C.purple,
            }}
          >
            <div
              className="px-6 py-4 flex justify-between items-center"
              style={{ background: C.purple, color: C.offwhite }}
            >
              <h3 className="text-xl font-semibold">
                {fullscreenGraph === "importance" && "Feature Importance"}
                {fullscreenGraph === "residuals" && "Residual Distribution"}
                {fullscreenGraph === "actual_pred" && "Actual vs Predicted"}
                {fullscreenGraph === "resid_pred" && "Residuals vs Predicted"}
              </h3>
              <button
                className={`${ring} ${trans} hover:brightness-110 text-2xl rounded-md px-2`}
                onClick={() => setFullscreenGraph(null)}
                style={{ color: C.offwhite }}
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <Plot
                data={
                  fullscreenGraph === "importance"
                    ? [
                        {
                          x: result.features,
                          y: result.importance,
                          type: "bar",
                          marker: { color: C.gold },
                          name: "Importance",
                        },
                      ]
                    : fullscreenGraph === "residuals"
                      ? [
                          {
                            type: "bar",
                            x: result.residual_bins,
                            y: result.residual_counts,
                            marker: {
                              color: C.gold,
                              line: { color: C.purple, width: 1 },
                            },
                            name: "Frequency",
                          },
                        ]
                      : fullscreenGraph === "actual_pred"
                        ? [
                            {
                              x: result.y_test,
                              y: result.preds,
                              mode: "markers",
                              type: "scatter",
                              marker: {
                                color: C.gold,
                                size: 10,
                                opacity: 0.85,
                                line: { color: C.purple, width: 0.6 },
                              },
                              name: "Predicted",
                            },
                            {
                              x: result.y_test,
                              y: result.y_test,
                              mode: "lines",
                              line: { color: C.purple, dash: "dash", width: 3 },
                              name: "y = x",
                            },
                          ]
                        : [
                            {
                              x: result.preds,
                              y: result.residuals,
                              mode: "markers",
                              type: "scatter",
                              marker: {
                                color: C.purple,
                                size: 10,
                                opacity: 0.85,
                              },
                              name: "Residuals",
                            },
                            {
                              x: result.preds,
                              y: Array(result.preds?.length).fill(0),
                              mode: "lines",
                              line: { color: C.purple, dash: "dash", width: 3 },
                              name: "Zero Line",
                            },
                          ]
                }
                layout={{
                  ...plotLayoutBase,
                  xaxis: {
                    title: {
                      text:
                        fullscreenGraph === "importance"
                          ? "Features"
                          : fullscreenGraph === "residuals"
                            ? "Residual"
                            : fullscreenGraph === "actual_pred"
                              ? "Actual"
                              : "Predicted",
                      font: { color: C.purple, size: 16, weight: "bold" },
                    },
                    color: C.purple,
                    gridcolor: "#E2E3EA",
                  },
                  yaxis: {
                    title: {
                      text:
                        fullscreenGraph === "importance"
                          ? "Importance (Gain)"
                          : fullscreenGraph === "residuals"
                            ? "Frequency"
                            : fullscreenGraph === "actual_pred"
                              ? "Predicted"
                              : "Residuals",
                      font: { color: C.purple, size: 16, weight: "bold" },
                    },
                    color: C.purple,
                    gridcolor: "#E2E3EA",
                  },
                  legend: {
                    x: 0.05,
                    y: 0.95,
                    xanchor: "left",
                    yanchor: "top",
                    bgcolor: "rgba(245,246,250,0.9)",
                    bordercolor: "rgba(75,31,120,0.3)",
                    borderwidth: 1,
                    font: { color: C.purple, size: 14 },
                  },
                }}
                config={plotConfig(`${fullscreenGraph}_full`)}
                useResizeHandler
                style={{ width: "100%", height: "75vh" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Run Saved Model Modal */}
      {showRunModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000]"
          onClick={() => setShowRunModal(false)}
        >
          <div
            className="rounded-2xl w-full max-w-lg p-6 border"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.offwhite,
              borderColor: "rgba(75,31,120,0.2)",
              color: C.purple,
            }}
          >
            <h4 className="text-lg font-semibold mb-4">
              Run Saved XGBoost Model
            </h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Upload Model (.pkl)
                </label>
                <input
                  type="file"
                  accept=".pkl"
                  onChange={(e) => setModelFile(e.target.files?.[0] || null)}
                  className={`w-full rounded-lg px-3 py-2 border ${ring} ${trans} hover:brightness-105`}
                  style={{
                    background: C.offwhite,
                    borderColor: "rgba(75,31,120,0.25)",
                    color: C.purple,
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Data Upload Method
                </label>
                <div className="flex gap-2">
                  {["shapefile", "zip"].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setRunUploadMode(mode);
                        if (mode === "zip") setRunFiles([]);
                        else setRunZipFile(null);
                      }}
                      className={`${btnGhost} flex-1`}
                      style={{
                        background:
                          runUploadMode === mode ? C.purple : C.offwhite,
                        color: runUploadMode === mode ? C.offwhite : C.purple,
                        borderColor: "rgba(75,31,120,0.25)",
                      }}
                    >
                      {mode === "shapefile" ? "📄 Shapefile" : "📦 ZIP"}
                    </button>
                  ))}
                </div>
              </div>

              {runUploadMode === "shapefile" ? (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Upload Shapefile
                  </label>
                  <input
                    type="file"
                    id="runShpInput"
                    multiple
                    accept=".shp,.dbf,.shx,.prj"
                    className="hidden"
                    onChange={(e) =>
                      setRunFiles(Array.from(e.target.files || []))
                    }
                  />
                  <button
                    onClick={() =>
                      document.getElementById("runShpInput").click()
                    }
                    className={`${btnAccent} w-full`}
                    style={{
                      background: C.gold,
                      color: C.purple,
                      borderColor: "rgba(75,31,120,0.25)",
                    }}
                  >
                    📂 Select Files
                  </button>
                  {!!runFiles.length && (
                    <p className="text-xs mt-2 opacity-80">
                      {runFiles.length} file(s) selected
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Upload ZIP File
                  </label>
                  <input
                    type="file"
                    id="runZipInput"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => setRunZipFile(e.target.files?.[0] || null)}
                  />
                  <button
                    onClick={() =>
                      document.getElementById("runZipInput").click()
                    }
                    className={`${btnAccent} w-full`}
                    style={{
                      background: C.gold,
                      color: C.purple,
                      borderColor: "rgba(75,31,120,0.25)",
                    }}
                  >
                    📦 Select ZIP
                  </button>
                  {runZipFile && (
                    <p className="text-xs mt-2 opacity-80">{runZipFile.name}</p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleRunModel}
                  disabled={loading}
                  className={`${btnAccent} flex-1 disabled:opacity-50`}
                  style={{
                    background: C.gold,
                    color: C.purple,
                    borderColor: "rgba(75,31,120,0.25)",
                  }}
                >
                  {loading ? "Running..." : "Run"}
                </button>
                <button
                  onClick={() => {
                    setShowRunModal(false);
                    setModelFile(null);
                    setRunFiles([]);
                    setRunZipFile(null);
                  }}
                  className={`${btnPrimary} flex-1`}
                  style={{
                    background: C.purple,
                    color: C.offwhite,
                    borderColor: "rgba(75,31,120,0.25)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map preview */}
      {showPredictedMap && (
        <PredictedMapModal
          onClose={() => setShowPredictedMap(false)}
          geojsonUrl={previewPath}
        />
      )}
    </div>
  );
};

export default XGBoost;
