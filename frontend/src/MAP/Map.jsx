import { useState } from "react";
import { MapContainer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import BaseMapSelector from "./BasemapSelector/BaseMapSelector.jsx";
import SchemaSelector from "./SchemaSelector/SchemaSelector";
import AdminBoundaries from "./AdminBoundaries/AdminBoundaries.jsx";
import Orthophoto from "./Orthophoto/Orthophoto.jsx";
import ParcelLoader from "./ParcelLoader";
import LoadingHandler from "./LoadingHandler";
// import Toolbar from "./Toolbar/toolbar.jsx";
import { SchemaProvider } from "./SchemaContext.jsx";
import CoordinatesDisplay from "./CoordinatesDisplay/CoordinatesDisplay.jsx";
import MapRefRegisterer from "./MapRefRegister.jsx";
import RightControls from "./RightSideControls.jsx";

function MapView() {
  const [activeTool, setActiveTool] = useState(null);

  return (
    <SchemaProvider>
      <MapContainer
        center={[12.8797, 121.774]}
        zoom={6}
        zoomControl={false}        // ✅ Remove default zoom controls
        attributionControl={false} // ✅ Remove Leaflet attribution
        style={{ height: "100vh", width: "100%", position: "relative", zIndex: 0 }}
        className="leaflet-map-container"
      >
        {/* 🌍 Base Layers + Map registration */}
        <BaseMapSelector />
        <MapRefRegisterer />
        <ParcelLoader />
        <LoadingHandler />
        <CoordinatesDisplay />

        {/* 🧭 LEFT TOOLBAR (GIS Tools) */}
        {/* <Toolbar /> */}

        {/* 🧩 RIGHT PANEL (Zoom + Tools) */}
        <RightControls activeTool={activeTool} setActiveTool={setActiveTool} />

        {/* 🔘 Tool Panels — only show when active */}
        <SchemaSelector
          isVisible={activeTool === "schema"}
          onClose={() => setActiveTool(null)}
        />
        <Orthophoto
          isVisible={activeTool === "ortho"}
          onClose={() => setActiveTool(null)}
        />
        <AdminBoundaries
          isVisible={activeTool === "admin"}
          onClose={() => setActiveTool(null)}
        />
        {/* 🔜 Parcel Styling soon */}
      </MapContainer>
    </SchemaProvider>
  );
}

export default MapView;