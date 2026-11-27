import React, { useState, useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

// Predefined Anatomical Segments with coordinates and default descriptors
const ANATOMICAL_REGIONS = [
  { id: "head", label: "Cranial / Head", pos: [0, 1.65, 0], scale: [0.24, 0.3, 0.24], shape: "sphere" },
  { id: "neck", label: "Cervical Spine / Neck", pos: [0, 1.38, 0], scale: [0.12, 0.16, 0.12], shape: "cylinder" },
  { id: "chest", label: "Thorax / Upper Chest", pos: [0, 1.15, 0], scale: [0.42, 0.32, 0.24], shape: "box" },
  { id: "abdomen", label: "Abdomen / Visceral Core", pos: [0, 0.82, 0], scale: [0.36, 0.30, 0.22], shape: "box" },
  { id: "lumbar_spine", label: "Lower Back / Lumbar Spine", pos: [0, 0.82, -0.1], scale: [0.28, 0.26, 0.12], shape: "box" },
  { id: "pelvis", label: "Pelvis / Hips", pos: [0, 0.52, 0], scale: [0.40, 0.25, 0.26], shape: "box" },
  
  // Upper Limbs
  { id: "right_shoulder", label: "Right Shoulder", pos: [-0.34, 1.25, 0], scale: [0.14, 0.14, 0.14], shape: "sphere" },
  { id: "left_shoulder", label: "Left Shoulder", pos: [0.34, 1.25, 0], scale: [0.14, 0.14, 0.14], shape: "sphere" },
  { id: "right_arm", label: "Right Arm / Biceps", pos: [-0.44, 0.98, 0], scale: [0.11, 0.36, 0.11], shape: "cylinder" },
  { id: "left_arm", label: "Left Arm / Biceps", pos: [0.44, 0.98, 0], scale: [0.11, 0.36, 0.11], shape: "cylinder" },
  { id: "right_elbow", label: "Right Elbow", pos: [-0.46, 0.76, 0], scale: [0.10, 0.10, 0.10], shape: "sphere" },
  { id: "left_elbow", label: "Left Elbow", pos: [0.46, 0.76, 0], scale: [0.10, 0.10, 0.10], shape: "sphere" },
  { id: "right_hand", label: "Right Hand / Wrist", pos: [-0.48, 0.50, 0], scale: [0.11, 0.22, 0.08], shape: "box" },
  { id: "left_hand", label: "Left Hand / Wrist", pos: [0.48, 0.50, 0], scale: [0.11, 0.22, 0.08], shape: "box" },

  // Lower Limbs
  { id: "right_thigh", label: "Right Thigh (Femur)", pos: [-0.16, 0.15, 0], scale: [0.15, 0.45, 0.15], shape: "cylinder" },
  { id: "left_thigh", label: "Left Thigh (Femur)", pos: [0.16, 0.15, 0], scale: [0.15, 0.45, 0.15], shape: "cylinder" },
  { id: "right_knee", label: "Right Knee / Patella", pos: [-0.16, -0.16, 0.02], scale: [0.12, 0.12, 0.12], shape: "sphere" },
  { id: "left_knee", label: "Left Knee / Patella", pos: [0.16, -0.16, 0.02], scale: [0.12, 0.12, 0.12], shape: "sphere" },
  { id: "right_leg", label: "Right Lower Leg (Shin/Calf)", pos: [-0.16, -0.48, 0], scale: [0.13, 0.46, 0.13], shape: "cylinder" },
  { id: "left_leg", label: "Left Lower Leg (Shin/Calf)", pos: [0.16, -0.48, 0], scale: [0.13, 0.46, 0.13], shape: "cylinder" },
  { id: "right_foot", label: "Right Ankle / Foot", pos: [-0.16, -0.80, 0.08], scale: [0.12, 0.10, 0.26], shape: "box" },
  { id: "left_foot", label: "Left Ankle / Foot", pos: [0.16, -0.80, 0.08], scale: [0.12, 0.10, 0.26], shape: "box" },
];

const PAIN_TYPES = ["Aching", "Sharp", "Stabbing", "Burning", "Throbbing", "Dull", "Cramping", "Numbness / Tingling"];

function getSeverityColor(sev) {
  if (sev <= 3) return "#eab308"; // Mild Yellow
  if (sev <= 6) return "#f97316"; // Moderate Amber
  return "#ef4444";               // Severe Red
}

// Interactive 3D Mesh Segment
function BodyPartMesh({ region, isSelected, hasPain, painSeverity, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef();

  const baseColor = useMemo(() => {
    if (hasPain) return getSeverityColor(painSeverity);
    if (isSelected) return "#06b6d4"; // Cyan
    if (hovered) return "#38bdf8";    // Sky
    return "#1e293b";                // Slate
  }, [hasPain, isSelected, hovered, painSeverity]);

  return (
    <mesh
      ref={meshRef}
      position={region.pos}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(region, e.point ? [e.point.x, e.point.y, e.point.z] : region.pos);
      }}
    >
      {region.shape === "sphere" && <sphereGeometry args={[region.scale[0], 24, 24]} />}
      {region.shape === "cylinder" && (
        <cylinderGeometry args={[region.scale[0], region.scale[0], region.scale[1], 24]} />
      )}
      {region.shape === "box" && (
        <boxGeometry args={[region.scale[0], region.scale[1], region.scale[2]]} />
      )}
      <meshStandardMaterial
        color={baseColor}
        roughness={0.3}
        metalness={0.2}
        wireframe={!hasPain && !isSelected && !hovered}
        emissive={hasPain ? getSeverityColor(painSeverity) : isSelected ? "#06b6d4" : "#000000"}
        emissiveIntensity={hasPain ? 0.35 : isSelected ? 0.25 : 0.0}
      />
    </mesh>
  );
}

// Pulsating Pain Pin Marker in 3D Space
function PainMarker({ point, onFocus }) {
  const markerRef = useRef();
  const color = getSeverityColor(point.severity);

  useFrame((state) => {
    if (markerRef.current) {
      const t = state.clock.getElapsedTime();
      const s = 1 + Math.sin(t * 4) * 0.15;
      markerRef.current.scale.set(s, s, s);
    }
  });

  const pos = point.coordinates || [0, 0, 0];

  return (
    <group position={pos}>
      <mesh ref={markerRef} onClick={(e) => { e.stopPropagation(); onFocus(point); }}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
      <Html distanceFactor={8} position={[0, 0.1, 0]}>
        <div className="pointer-events-none px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-bold text-white shadow whitespace-nowrap border border-white/20">
          {point.label || point.body_region}: {point.severity}/10
        </div>
      </Html>
    </group>
  );
}

export default function PainVisualizer3D({
  initialPoints = [],
  patientNotes = "",
  doctorNotes = "",
  readOnly = false,
  isDoctorMode = false,
  onSave,
}) {
  const [points, setPoints] = useState(initialPoints);
  const [activeRegion, setActiveRegion] = useState(null);
  const [clickCoords, setClickCoords] = useState(null);
  const [severity, setSeverity] = useState(5);
  const [painType, setPainType] = useState("Aching");
  const [durationDays, setDurationDays] = useState(3);
  const [pointNotes, setPointNotes] = useState("");
  const [overallNotes, setOverallNotes] = useState(patientNotes || "");
  const [docNotes, setDocNotes] = useState(doctorNotes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const controlsRef = useRef();

  const handleSelectRegion = (region, coords) => {
    setActiveRegion(region);
    setClickCoords(coords);
    // If region already has a recorded point, prefill its details
    const existing = points.find((p) => p.body_region === region.id);
    if (existing) {
      setSeverity(existing.severity);
      setPainType(existing.pain_type || "Aching");
      setDurationDays(existing.duration_days || 1);
      setPointNotes(existing.notes || "");
    } else {
      setSeverity(5);
      setPainType("Aching");
      setDurationDays(3);
      setPointNotes("");
    }
  };

  const handleAddOrUpdatePoint = () => {
    if (!activeRegion) return;
    const newPoint = {
      id: `pain-${Date.now()}`,
      body_region: activeRegion.id,
      label: activeRegion.label,
      severity: Number(severity),
      pain_type: painType,
      duration_days: Number(durationDays),
      coordinates: clickCoords || activeRegion.pos,
      notes: pointNotes,
    };

    setPoints((prev) => {
      const filtered = prev.filter((p) => p.body_region !== activeRegion.id);
      return [...filtered, newPoint];
    });
    setActiveRegion(null);
  };

  const handleRemovePoint = (regionId) => {
    setPoints((prev) => prev.filter((p) => p.body_region !== regionId));
    if (activeRegion?.id === regionId) setActiveRegion(null);
  };

  const handleSaveMap = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave({
        points,
        overall_severity: points.length ? Math.max(...points.map((p) => p.severity)) : 0,
        patient_notes: overallNotes,
        doctor_notes: docNotes,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save 3D pain map:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const overallMaxSeverity = useMemo(() => {
    return points.length ? Math.max(...points.map((p) => p.severity)) : 0;
  }, [points]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full h-[640px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* 3D Canvas Viewport */}
      <div className="relative flex-1 h-[360px] lg:h-full bg-gradient-to-b from-slate-900 to-slate-950">
        <Canvas camera={{ position: [0, 0.4, 2.8], fov: 45 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />
          <directionalLight position={[-5, -4, -5]} intensity={0.4} color="#38bdf8" />
          <pointLight position={[0, 0, 2]} intensity={0.5} />

          <Suspense fallback={null}>
            <group position={[0, -0.4, 0]}>
              {ANATOMICAL_REGIONS.map((region) => {
                const pt = points.find((p) => p.body_region === region.id);
                return (
                  <BodyPartMesh
                    key={region.id}
                    region={region}
                    isSelected={activeRegion?.id === region.id}
                    hasPain={Boolean(pt)}
                    painSeverity={pt?.severity || 0}
                    onSelect={handleSelectRegion}
                  />
                );
              })}

              {points.map((pt) => (
                <PainMarker
                  key={pt.id || pt.body_region}
                  point={pt}
                  onFocus={(p) => {
                    const reg = ANATOMICAL_REGIONS.find((r) => r.id === p.body_region);
                    if (reg) setActiveRegion(reg);
                  }}
                />
              ))}
            </group>
          </Suspense>

          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            minDistance={1.2}
            maxDistance={4.5}
            maxPolarAngle={Math.PI / 1.7}
            minPolarAngle={Math.PI / 6}
          />
        </Canvas>

        {/* Floating Viewport Controls */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-auto">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800 backdrop-blur">
            Interactive 3D Anatomical Map
          </span>
          {overallMaxSeverity > 0 && (
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg backdrop-blur"
              style={{ backgroundColor: getSeverityColor(overallMaxSeverity) }}
            >
              Peak Severity: {overallMaxSeverity}/10
            </span>
          )}
        </div>

        <button
          onClick={() => controlsRef.current?.reset()}
          className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 backdrop-blur transition"
        >
          Reset Camera
        </button>

        <div className="absolute bottom-3 right-3 text-[11px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
          Rotate: Drag • Zoom: Scroll • Select: Click Body Zone
        </div>
      </div>

      {/* Control Panel & Clinical Details */}
      <div className="w-full lg:w-96 flex flex-col justify-between p-5 bg-slate-900/95 border-t lg:border-t-0 lg:border-l border-slate-800 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center justify-between">
              <span>{isDoctorMode ? "Clinical Pain Assessment" : "Symptom & Pain Intake"}</span>
              <span className="text-xs font-normal text-slate-400">
                {points.length} {points.length === 1 ? "zone" : "zones"} marked
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isDoctorMode
                ? "Review patient symptom map or annotate palpation findings."
                : "Select affected anatomical zones and describe pain intensity."}
            </p>
          </div>

          {/* Active Selection / Edit Form */}
          {activeRegion ? (
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-cyan-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-cyan-300">{activeRegion.label}</span>
                <button
                  onClick={() => setActiveRegion(null)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  ✕ Close
                </button>
              </div>

              {/* Severity Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300">Severity:</span>
                  <span className="font-bold" style={{ color: getSeverityColor(severity) }}>
                    {severity} / 10 ({severity <= 3 ? "Mild" : severity <= 6 ? "Moderate" : "Severe"})
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Pain Sensation Type */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Pain Sensation:</label>
                <select
                  value={painType}
                  onChange={(e) => setPainType(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {PAIN_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Duration in Days */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Duration (approx. days):</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Point Clinical Note */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Specific Symptoms / Triggers:</label>
                <input
                  type="text"
                  placeholder="e.g. Worse with exertion, sharp radiating ache"
                  value={pointNotes}
                  onChange={(e) => setPointNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAddOrUpdatePoint}
                  className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  Confirm Zone
                </button>
                {points.some((p) => p.body_region === activeRegion.id) && (
                  <button
                    type="button"
                    onClick={() => handleRemovePoint(activeRegion.id)}
                    className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-medium transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
              💡 Tap or click any anatomical zone on the 3D model to record pain or tenderness.
            </div>
          )}

          {/* List of Marked Zones */}
          <div>
            <h4 className="text-xs font-semibold text-slate-300 mb-2">Marked Zones:</h4>
            {points.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No pain zones added yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {points.map((p) => (
                  <div
                    key={p.id || p.body_region}
                    onClick={() => {
                      const reg = ANATOMICAL_REGIONS.find((r) => r.id === p.body_region);
                      if (reg) handleSelectRegion(reg, p.coordinates);
                    }}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 cursor-pointer text-xs transition"
                  >
                    <div>
                      <div className="font-medium text-slate-200">{p.label || p.body_region}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.pain_type} • {p.duration_days ? `${p.duration_days}d` : "Recent"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-bold text-white"
                        style={{ backgroundColor: getSeverityColor(p.severity) }}
                      >
                        {p.severity}/10
                      </span>
                      {!readOnly && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePoint(p.body_region);
                          }}
                          className="text-slate-400 hover:text-rose-400 text-xs px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Context Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {isDoctorMode ? "Attending Doctor Clinical Evaluation:" : "Patient General Notes:"}
            </label>
            <textarea
              rows={2}
              value={isDoctorMode ? docNotes : overallNotes}
              onChange={(e) => (isDoctorMode ? setDocNotes(e.target.value) : setOverallNotes(e.target.value))}
              placeholder={
                isDoctorMode
                  ? "Record clinical palpation findings, radiating dermatomes, or referral notes..."
                  : "Describe when the discomfort began and what relieves or worsens it..."
              }
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Bottom Save Action */}
        {!readOnly && (
          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={handleSaveMap}
              disabled={isSaving}
              className="w-full py-2 px-4 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 shadow-lg shadow-cyan-900/30 transition disabled:opacity-50"
            >
              {isSaving
                ? "Saving Pain Map..."
                : saveSuccess
                ? "✓ Saved Successfully!"
                : isDoctorMode
                ? "Save Clinical Findings"
                : "Save 3D Pain Profile"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
