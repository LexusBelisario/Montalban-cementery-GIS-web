import React, { useState, useEffect } from "react";
import { X, Save, Settings, ArrowLeft, Upload, Download } from "lucide-react";
import { useSchema } from "../SchemaContext.jsx";
import { ApiService } from "../../api_service.js";
import "./JoinedTableSyncPanel.css";

const JoinedTableSyncPanel = ({ isVisible, onClose }) => {
  const { schema } = useSchema();
  const [dbName, setDbName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [loading, setLoading] = useState(false);

  // ======================================================
  // 🔹 Load actual connected DB name once when panel opens
  // ======================================================
  useEffect(() => {
    const fetchDbName = async () => {
      try {
        const data = window._schemaSelectorData;
        if (data?.userAccess?.actual_dbname) {
          setDbName(data.userAccess.actual_dbname);
          return;
        }
        const res = await ApiService.get("/list-schemas");
        if (res?.user_access?.actual_dbname) {
          setDbName(res.user_access.actual_dbname);
        } else if (data?.userAccess?.provincial) {
          setDbName(data.userAccess.provincial);
        }
      } catch (err) {
        console.error("❌ Error fetching actual DB name:", err);
      }
    };

    if (isVisible) fetchDbName();
  }, [isVisible]);

  // ======================================================
  // 🔹 Load saved credentials
  // ======================================================
  const fetchCreds = async (targetSchema) => {
    if (!targetSchema) return;
    try {
      const res = await ApiService.get(`/sync-config?schema=${targetSchema}`);
      if (res && res.status === "success") {
        setHost(res.host || "");
        setPort(res.port || "");
        setUsername(res.username || "");
        setPassword(res.password || "");
      } else {
        setHost("");
        setPort("");
        setUsername("");
        setPassword("");
      }
    } catch (err) {
      console.error("Error fetching sync config:", err);
    }
  };

  // ======================================================
  // 🔹 Save credentials
  // ======================================================
  const handleSave = async () => {
    if (!schema) return;
    try {
      const payload = { schema, host, port, username, password };
      await ApiService.post("/sync-config", payload);
      alert("✅ Credentials saved successfully.");
    } catch (err) {
      console.error("Error saving sync config:", err);
      alert("❌ Failed to save credentials.");
    }
  };

  // ======================================================
  // 🔹 Push only pin, bounds, computed_area
  // ======================================================
  const handlePush = async () => {
    if (!schema) return alert("⚠️ No schema selected.");
    setLoading(true);
    try {
      const res = await ApiService.post("/sync-push", { schema });
      if (res?.status === "success") {
        alert(`✅ ${res.message}`);
      } else {
        alert(`⚠️ ${res?.message || "Push failed."}`);
      }
    } catch (err) {
      console.error("❌ Push error:", err);
      alert("❌ Push failed. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  const handlePull = () => alert("⬇️ Pull action coming soon...");

  if (!isVisible) return null;

  // ======================================================
  // 🔹 Render UI
  // ======================================================
  return (
    <div className="sync-panel">
      <div className="sync-header">
        <h3 className="sync-title">RPT-GIS Sync Tool</h3>
        <button onClick={onClose} className="sync-close-btn">
          <X size={16} />
        </button>
      </div>

      {!isConfiguring ? (
        <div className="sync-placeholder">
          <div className="sync-main-buttons">
            <button className="sync-btn push" onClick={handlePush} disabled={loading}>
              <Upload size={14} /> {loading ? "Pushing..." : "Update RPT"}
            </button>
            <button className="sync-btn pull" onClick={handlePull}>
              <Download size={14} /> Update GIS
            </button>
            <button
              className="sync-btn configure"
              onClick={() => {
                setIsConfiguring(true);
                if (schema) fetchCreds(schema);
              }}
            >
              <Settings size={14} /> Configure Database Link
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sync-box">
            <div>
              <label>Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. 104.199.142.35"
              />
            </div>

            <div>
              <label>Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="e.g. 5432"
              />
            </div>

            <div>
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. postgres"
              />
            </div>

            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div>
              <label>Database</label>
              <input type="text" value={dbName || ""} readOnly />
            </div>

            <div>
              <label>Schema</label>
              <input type="text" value={schema || ""} readOnly />
            </div>
          </div>

          <div className="sync-actions">
            <button onClick={() => setIsConfiguring(false)} className="sync-back-btn">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={handleSave} className="sync-save-btn prominent">
              <Save size={14} /> Save
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default JoinedTableSyncPanel;
