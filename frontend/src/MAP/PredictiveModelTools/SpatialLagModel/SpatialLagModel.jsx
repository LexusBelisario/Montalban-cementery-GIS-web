import React, { useState } from "react";
import Plot from "react-plotly.js";
import API from "../../../api.js";
import PredictedMapModal from "../PredictedMapModal.jsx";

const SpatialLagModel = ({ onClose }) => {
  const [files, setFiles] = useState([]);
  const [fields, setFields] = useState([]);
  const [independentVars, setIndependentVars] = useState([]);
  const [dependentVar, setDependentVar] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [modelFile, setModelFile] = useState(null);
  const [runFiles, setRunFiles] = useState([]);
  const [showPredictedMap, setShowPredictedMap] = useState(false);
  const [previewPath, setPreviewPath] = useState(null);

  // === Load fields from shapefile or zip ===
  const handleFileChange = async (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length === 0) return;
    setFiles(selected);
    setResult(null);

    try {
      const formData = new FormData();
      let endpoint;

      if (selected.some((f) => f.name.endsWith(".zip"))) {
        formData.append("zip_file", selected[0]);
        endpoint = `${API}/spatial-lag/fields-zip`;
      } else {
        selected.forEach((f) => formData.append("shapefiles", f));
        endpoint = `${API}/spatial-lag/fields`;
      }

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) setFields(data.fields || []);
      else alert(data.error || "Error reading shapefile fields.");
    } catch (err) {
      console.error(err);
      alert("Failed to extract fields.");
    }
  };

  // === Select independent vars ===
  const toggleIndependent = (f) => {
    setIndependentVars((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  };

  // === Train model ===
  const handleTrain = async () => {
    if (!files.length) return alert("Please upload a shapefile or ZIP file.");
    if (!dependentVar) return alert("Select dependent variable.");
    if (!independentVars.length)
      return alert("Select at least one independent variable.");

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      let endpoint;
      if (files.length === 1 && files[0].name.endsWith(".zip")) {
        formData.append("zip_file", files[0]);
        endpoint = `${API}/spatial-lag/train-zip`;
      } else {
        files.forEach((f) => formData.append("shapefiles", f));
        endpoint = `${API}/spatial-lag/train`;
      }

      formData.append("independent_vars", JSON.stringify(independentVars));
      formData.append("dependent_var", dependentVar);

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) setResult(data);
      else alert(data.error || "Training failed.");
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  // === Run saved model ===
  const handleRunModel = async () => {
    if (!modelFile) return alert("Please select a saved model file.");
    if (!runFiles.length) return alert("Upload shapefile or ZIP to predict.");

    setLoading(true);
    const formData = new FormData();
    formData.append("model_file", modelFile);
    if (runFiles.some((f) => f.name.endsWith(".zip")))
      formData.append("zip_file", runFiles[0]);
    else runFiles.forEach((f) => formData.append("shapefiles", f));

    try {
      const res = await fetch(`${API}/spatial-lag/run-saved-model`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else alert(data.error || "Run failed.");
    } catch (err) {
      console.error(err);
      alert("Failed to run saved model.");
    } finally {
      setLoading(false);
      setShowRunModal(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] backdrop-blur-sm">
      <div className="bg-[#151922] text-[#e0e0e0] rounded-2xl p-6 w-[480px] max-h-[90vh] overflow-y-auto border border-[#2e2e3a] shadow-lg">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[#f7c800] text-lg font-semibold">
            Spatial Lag Model (SLM)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[#f7c800] text-xl"
          >
            ✕
          </button>
        </div>

        {/* Upload */}
        <label className="block text-sm font-medium mb-1">
          Upload Shapefile or ZIP
        </label>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="file"
            id="slmUpload"
            accept=".zip,.shp,.dbf,.shx,.prj"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => document.getElementById("slmUpload").click()}
            className="bg-[#f7c800] text-black px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-[#f7c800cc] transition"
          >
            Choose File
          </button>
          <span className="text-xs truncate">
            {files.length ? files.map((f) => f.name).join(", ") : "No file selected"}
          </span>
        </div>

        {/* Variables */}
        <p className="text-sm font-medium mb-1">Independent Variables</p>
        <div className="bg-[#1b1f2e] border border-[#2f3242] rounded-md p-2 mb-3 max-h-[150px] overflow-y-auto">
          {fields.length ? (
            fields.map((f) => (
              <label
                key={f}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[#2a2f43] px-2 py-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={independentVars.includes(f)}
                  onChange={() => toggleIndependent(f)}
                  className="accent-[#00c0c7]"
                />
                {f}
              </label>
            ))
          ) : (
            <p className="text-xs text-gray-500 text-center py-2">
              No fields loaded
            </p>
          )}
        </div>

        <p className="text-sm font-medium mb-1">Dependent Variable</p>
        <select
          value={dependentVar}
          onChange={(e) => setDependentVar(e.target.value)}
          className="w-full bg-[#1b1f2e] border border-[#2f3242] rounded-md p-2 text-sm mb-4"
        >
          <option value="">-- Select --</option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        {/* Buttons */}
        <div className="flex justify-between gap-2 mb-4">
          <button
            onClick={handleTrain}
            disabled={loading}
            className="flex-1 bg-[#f7c800] text-black py-2 rounded-md text-sm font-semibold hover:bg-[#f7c800cc] transition disabled:opacity-60"
          >
            {loading ? "Processing..." : "Train Model"}
          </button>
          <button
            onClick={() => setShowRunModal(true)}
            className="flex-1 bg-[#2b2e3b] border border-[#f7c80060] py-2 rounded-md text-sm hover:bg-[#323548] transition"
          >
            Run Saved Model
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-[#1b1f2e] border border-[#2f3242] rounded-md p-3 text-sm">
            <h3 className="text-[#f7c800] font-semibold mb-2">Model Summary</h3>

            {result.metrics && (
              <div className="mb-3">
                <table className="w-full text-xs border border-[#2f3242]">
                  <thead className="bg-[#2a2f43]">
                    <tr>
                      {Object.keys(result.metrics).map((k) => (
                        <th key={k} className="px-2 py-1 text-left">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {Object.values(result.metrics).map((v, i) => (
                        <td key={i} className="px-2 py-1">{v.toFixed(4)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {result.coefficients && (
              <div>
                <p className="text-xs font-semibold text-[#00c0c7] mb-1">
                  Coefficients
                </p>
                <ul className="space-y-1">
                  {Object.entries(result.coefficients).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="text-[#f7c800] font-mono">
                        {v.toFixed(4)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.downloads && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-[#00c0c7] mb-1">
                  Downloads
                </p>
                <ul className="space-y-1">
                  {Object.entries(result.downloads).map(([key, url]) => (
                    <li key={key}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#f7c800] hover:underline"
                      >
                        {key === "model" && "📦 Model (.pkl)"}
                        {key === "report" && "📄 PDF Report"}
                        {key === "shapefile" && "🗺️ Predicted Shapefile"}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.downloads?.shapefile && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => {
                    const geojsonUrl = `${API}/spatial-lag/preview-geojson?file_path=${encodeURIComponent(
                      result.downloads.shapefile
                    )}`;
                    setPreviewPath(geojsonUrl);
                    setShowPredictedMap(true);
                  }}
                  className="bg-[#1f2233] border border-[#00c0c7] text-[#00c0c7] px-3 py-1.5 rounded-md text-sm hover:bg-[#2b2e3f] transition"
                >
                  Show Predicted Map
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Run Modal */}
      {showRunModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000]"
          onClick={() => setShowRunModal(false)}
        >
          <div
            className="bg-[#151922] p-5 rounded-xl border border-[#2e2e3a] w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[#f7c800] font-semibold mb-3">
              Run Saved SLM Model
            </h3>
            <label className="block text-sm mb-1">Model (.pkl)</label>
            <input
              type="file"
              accept=".pkl"
              onChange={(e) => setModelFile(e.target.files[0])}
              className="w-full bg-[#1b1f2e] border border-[#2f3242] rounded-md p-2 text-sm mb-3"
            />
            <label className="block text-sm mb-1">Shapefile or ZIP</label>
            <input
              type="file"
              multiple
              accept=".zip,.shp,.dbf,.shx,.prj"
              onChange={(e) => setRunFiles(Array.from(e.target.files))}
              className="w-full bg-[#1b1f2e] border border-[#2f3242] rounded-md p-2 text-sm mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleRunModel}
                className="bg-[#f7c800] text-black px-4 py-1.5 rounded-md font-semibold text-sm hover:bg-[#f7c800cc]"
              >
                Run
              </button>
              <button
                onClick={() => setShowRunModal(false)}
                className="bg-[#2b2e3b] border border-[#444] px-4 py-1.5 rounded-md text-sm hover:bg-[#33364a]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPredictedMap && (
        <PredictedMapModal
          onClose={() => setShowPredictedMap(false)}
          geojsonUrl={previewPath}
        />
      )}
    </div>
  );
};

export default SpatialLagModel;
