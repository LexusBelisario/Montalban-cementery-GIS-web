import React, { useState } from "react";
import ReactDOM from "react-dom";
import "./toolbar.css";
import LinearRegression from "../PredictiveModelTools/LinearRegression/LinearRegression.jsx";
import GWR from "../PredictiveModelTools/GWR/GWR.jsx";
import XGBoost from "../PredictiveModelTools/XGBoost/XGBoost.jsx";
import SpatialLagModel from "../PredictiveModelTools/SpatialLagModel/SpatialLagModel.jsx";

const TBPredictiveModelTools = () => {
  // === AI Model states ===
  const [showLinearRegression, setShowLinearRegression] = useState(false);
  const [showXGBoost, setShowXGBoost] = useState(false);

  // === GEO-AI Model states ===
  const [showGWR, setShowGWR] = useState(false);

  // === AI Model handlers ===
  const handleLinearRegression = () => setShowLinearRegression(true);
  const handleXGBoost = () => setShowXGBoost(true);

  // === GEO-AI Model handlers ===
  const handleGWR = () => setShowGWR(true);

  const [showSLM, setShowSLM] = useState(false);
  const handleSLM = () => setShowSLM(true);

  // === Placeholder handlers (for future models) ===
  const handlePlaceholder = (modelName) => {
    alert(`${modelName} - Coming Soon!`);
  };

  return (
    <>
      <div className="predictive-tools-wrapper dual-column">
        {/* === AI MODEL COLUMN === */}
        <div className="column-section">
          <h4 className="section-title">AI MODEL</h4>
          <div className="predictive-grid ai-grid">
            {/* Linear Regression */}
            <button
              className="tool-button"
              onClick={handleLinearRegression}
              title="Run Linear Regression"
            >
              <img src="/icons/mlr.png" alt="Linear Regression" />
              <span>Linear Regression</span>
            </button>

            {/* XGBoost */}
            <button
              className="tool-button"
              onClick={handleXGBoost}
              title="Run XGBoost Model"
            >
              <img src="/icons/xgboost.png" alt="XGBoost" />
              <span>XGBoost</span>
            </button>

            {/* Random Forest */}
            <button
              className="tool-button"
              onClick={() => handlePlaceholder("Random Forest")}
              title="Run Random Forest Model"
            >
              <img src="/icons/randomforest.png" alt="Random Forest" />
              <span>Random Forest</span>
            </button>
          </div>
        </div>

        {/* === GEO-AI MODEL COLUMN === */}
        <div className="column-section">
          <h4 className="section-title">GEO-AI MODEL</h4>
          <div className="predictive-grid geo-grid">
            {/* Ordinary Least Squares */}
            <button
              className="tool-button"
              onClick={() => handlePlaceholder("Ordinary Least Squares")}
              title="Run Ordinary Least Squares"
            >
              <img src="/icons/ols.png" alt="Ordinary Least Squares" />
              <span>Ordinary Least Squares</span>
            </button>

            {/* Spatial Lag Model */}
            <button
              className="tool-button"
              onClick={handleSLM}
              title="Run Spatial Lag Model"
            >
              <img src="/icons/slm.png" alt="Spatial Lag Model" />
              <span>Spatial Lag Model</span>
            </button>

            {/* GWR */}
            <button
              className="tool-button"
              onClick={handleGWR}
              title="Run Geographically Weighted Regression"
            >
              <img src="/icons/gwr.png" alt="GWR" />
              <span>Geographically Weighted Regression</span>
            </button>
          </div>
        </div>
      </div>

      {/* === MODALS (Only for implemented components) === */}
      {showLinearRegression &&
        ReactDOM.createPortal(
          <LinearRegression onClose={() => setShowLinearRegression(false)} />,
          document.body
        )}

      {showXGBoost &&
        ReactDOM.createPortal(
          <XGBoost onClose={() => setShowXGBoost(false)} />,
          document.body
        )}

      {showGWR &&
        ReactDOM.createPortal(
          <GWR onClose={() => setShowGWR(false)} />,
          document.body
        )}

      {showSLM &&
        ReactDOM.createPortal(
          <SpatialLagModel onClose={() => setShowSLM(false)} />,
          document.body
        )}
    </>
  );
};

export default TBPredictiveModelTools;
