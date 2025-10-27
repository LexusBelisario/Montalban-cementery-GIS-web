// SchemaSelector.jsx
import { useState, useEffect, useRef } from "react";
import { ApiService } from "../../api_service.js";
import { useSchema } from "../SchemaContext";
import { useMap } from "react-leaflet";

const SchemaSelector = () => {
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState(null);
  const [error, setError] = useState(null);
  const { setSchema } = useSchema();
  const map = useMap();
  const hasZoomedToProvince = useRef(false);
  const hasAutoSelected = useRef(false);

  const normalize = (s) =>
    (s ?? "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  // ======================================================
  // 🔹 Helper: Fetch and zoom to provincial bounds
  // ======================================================
  const fetchProvincialBoundsAndZoom = async () => {
    try {
      const res = await ApiService.get("/province/provincial-bounds");
      if (res?.status === "success" && Array.isArray(res.bounds) && res.bounds.length === 4) {
        const [xmin, ymin, xmax, ymax] = res.bounds;
        const bounds = [
          [ymin, xmin],
          [ymax, xmax],
        ];
        console.log(`🗺️ Smooth zoom to provincial bounds (${res.prov_code}):`, bounds);

        const center = [(ymin + ymax) / 2, (xmin + xmax) / 2];
        const zoom = map.getBoundsZoom(bounds, false);
        map.flyTo(center, zoom, { animate: true, duration: 1.5 });
      } else {
        console.warn("⚠️ Invalid or missing provincial bounds:", res);
      }
    } catch (err) {
      console.error("❌ Failed to fetch provincial bounds:", err);
    }
  };

  // ======================================================
  // 🔹 Load schemas from backend (with provincial zoom always)
  // ======================================================
  useEffect(() => {
    const loadSchemas = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await ApiService.get("/list-schemas");
        console.log("🔍 Schemas response:", data);

        if (data?.schemas) {
          setSchemas(data.schemas);
          setUserAccess(data.user_access);

          // ✅ Always zoom to provincial bounds once on load
          if (!hasZoomedToProvince.current) {
            await fetchProvincialBoundsAndZoom();
            hasZoomedToProvince.current = true;
          }

          // --- Resolve municipal access from either key ---
          const municipalAccessRaw =
            data.user_access?.municipal_access ?? data.user_access?.municipal ?? "";
          const municipalAccess = municipalAccessRaw.toString().trim();
          const isAllAccess = /^all$/i.test(municipalAccess);

          console.log("👤 User Access:", data.user_access);
          console.log("📊 Number of schemas:", data.schemas.length);
          console.log("🏘️ Municipal Access (resolved):", municipalAccess);
          console.log("🔐 Is 'All' Access?", isAllAccess);

          // ✅ Auto-select ONLY when municipal access is specific (not 'All')
          if (!hasAutoSelected.current && !isAllAccess && data.schemas.length > 0) {
            const accessKey = normalize(municipalAccess); // e.g., "ph0403406calauan" or "ph0403406"
            const targetSchema =
              data.schemas.find((s) => normalize(s).startsWith(accessKey)) ||
              data.schemas.find((s) => normalize(s).startsWith(accessKey.slice(0, 9))) || // try pure code "ph0403406"
              null;

            if (targetSchema) {
              console.log(`✅ Auto-selecting schema for municipal access: ${targetSchema}`);
              setSelectedSchema(targetSchema);
              setSchema(targetSchema);
              hasAutoSelected.current = true;
            } else {
              console.log("⚠️ No matching schema found for municipal access:", municipalAccess);
            }
          } else if (isAllAccess && data.schemas.length === 1) {
            // 🚫 Do not auto-select when 'All' even if only one schema
            console.log("⏸️ 'All' access with one schema — waiting for manual selection.");
          } else if (data.schemas.length > 1) {
            console.log("⏸️ Multiple schemas available — waiting for manual selection.");
          }

          // 🚫 Handle empty schema list (tolerant provincial key)
          const provincialAccess =
            data.user_access?.provincial_access ?? data.user_access?.provincial;
          if (data.schemas.length === 0 && provincialAccess) {
            setError(
              `You have access to ${provincialAccess} but no municipal access assigned.`
            );
          }
        }
      } catch (err) {
        console.error("❌ Failed to load schemas:", err);
        if (err.response?.status === 403) {
          setError(err.response?.data?.detail || "Access pending admin approval");
        } else {
          setError("Failed to load schemas. Please try again.");
        }
        setSchemas([]);
      } finally {
        setLoading(false);
      }
    };

    loadSchemas();
  }, [setSchema, map]);

  // ======================================================
  // 🔹 Handle schema change (user selection)
  // ======================================================
  const handleSchemaChange = (schema) => {
    console.log("🔄 Manual schema change:", schema);
    setSelectedSchema(schema);
    setSchema(schema);
  };

  // ======================================================
  // 🔹 Zoom to municipal bounds when schema changes
  // ======================================================
  useEffect(() => {
    if (!selectedSchema) return;

    const fetchBoundsAndZoom = async () => {
      try {
        console.log("📍 Fetching bounds for schema:", selectedSchema);
        const res = await ApiService.get(`/municipal-bounds?schema=${selectedSchema}`);
        if (res?.status === "success" && Array.isArray(res.bounds) && res.bounds.length === 4) {
          const [xmin, ymin, xmax, ymax] = res.bounds;
          const bounds = [
            [ymin, xmin],
            [ymax, xmax],
          ];
          console.log(`📦 Smooth zoom to bounds of ${selectedSchema}:`, bounds);

          const center = [(ymin + ymax) / 2, (xmin + xmax) / 2];
          const zoom = map.getBoundsZoom(bounds, false);
          map.flyTo(center, zoom, { animate: true, duration: 1.5 });
        } else {
          console.warn("⚠️ Bounds not found or invalid:", res);
        }
      } catch (err) {
        console.error("❌ Failed to fetch bounds:", err);
      }
    };

    fetchBoundsAndZoom();
  }, [selectedSchema, map]);

  // ======================================================
  // 🔹 Expose state and handler globally for the UI panel
  // ======================================================
  useEffect(() => {
    window._schemaSelectorData = {
      schemas,
      selectedSchema,
      loading,
      error,
      userAccess,
    };
  }, [schemas, selectedSchema, loading, error, userAccess]);

  useEffect(() => {
    window._handleSchemaChange = handleSchemaChange;
    return () => {
      delete window._handleSchemaChange;
      delete window._schemaSelectorData;
    };
  }, [selectedSchema]);

  return null; // No UI, logic only
};

export default SchemaSelector;
