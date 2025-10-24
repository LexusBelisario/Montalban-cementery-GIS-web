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
  const [isConfiguring, setIsConfiguring] = useState(false);

  // 🧩 Auto-fetch provincial DB name
  useEffect(() => {
    const interval = setInterval(() => {
      if (window._schemaSelectorData?.userAccess?.provincial) {
        setDbName(window._schemaSelectorData.userAccess.provincial);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // 🔹 Load saved credentials
  const fetchCreds = async (targetSchema) => {
    if (!targetSchema) return;
    try {
      const res = await ApiService.get(`/sync-config?schema=${targetSchema}`);
      if (res && res.status === "success") {
        setHost(res.host || "");
        setPort(res.port || "");
        setUsername(res.username || "");
      } else {
        setHost("");
        setPort("");
        setUsername("");
      }
    } catch (err) {
      console.error("Error fetching sync config:", err);
    }
  };

  // 🔹 Auto-load when schema changes
  useEffect(() => {
    if (isVisible && isConfiguring && schema) {
      fetchCreds(schema);
    }
  }, [schema, isVisible, isConfiguring]);

  // 🔹 Save credentials
  const handleSave = async () => {
    if (!schema) return;
    try {
      const payload = { schema, host, port, username };
      await ApiService.post("/sync-config", payload);
      alert("✅ Credentials saved successfully.");
    } catch (err) {
      console.error("Error saving sync config:", err);
      alert("❌ Failed to save credentials.");
    }
  };

  // 🔹 Placeholder push/pull
  const handlePush = () => alert("🚀 Push action triggered (placeholder).");
  const handlePull = () => alert("⬇️ Pull action triggered (placeholder).");

  if (!isVisible) return null;

  return (
    <div className="sync-panel">
      {/* Header */}
      <div className="sync-header">
        <h3 className="sync-title">RPT-GIS Sync Tool</h3>
        <button onClick={onClose} className="sync-close-btn">
          <X size={16} />
        </button>
      </div>

      {/* === INITIAL VIEW === */}
      {!isConfiguring ? (
        <div className="sync-placeholder">
          <div className="sync-main-buttons">
            <button className="sync-btn push" onClick={handlePush}>
              <Upload size={14} /> Update RPT
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
          {/* === CONFIGURATION VIEW === */}
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
              <label>Database</label>
              <input type="text" value={dbName || ""} readOnly />
            </div>

            <div>
              <label>Schema</label>
              <input type="text" value={schema || ""} readOnly />
            </div>
          </div>

          {/* === ACTION BUTTONS === */}
          <div className="sync-actions">
            <button
              onClick={() => setIsConfiguring(false)}
              className="sync-back-btn"
            >
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
