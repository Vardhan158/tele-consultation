import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import truckUrl from "../../assets/kaizenx_truck_v3.glb?url";

export default function AppLoadingSplash({ onFinished }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing Kaizen Care...");
  const [fadeOut, setFadeOut] = useState(false);
  const progressRef = useRef(0);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Simulated progress timer for ultra-smooth splash feel
  useEffect(() => {
    const steps = [
      { p: 15, text: "Connecting to Telehealth Network..." },
      { p: 40, text: "Deploying 3D Kaizen Mobile Unit..." },
      { p: 70, text: "Preparing Clinical Workspace..." },
      { p: 90, text: "Finalizing Security Credentials..." },
      { p: 100, text: "Welcome to Kaizen Care" },
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setProgress(steps[currentStep].p);
        setStatusText(steps[currentStep].text);
        currentStep++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setFadeOut(true);
          setTimeout(() => {
            if (onFinished) onFinished();
          }, 600);
        }, 400);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [onFinished]);

  // 3D Truck Scene inside Splash
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId;
    let scene, camera, renderer;
    let wrapperGroup = new THREE.Group();

    scene = new THREE.Scene();
    scene.add(wrapperGroup);

    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0.2, 7.0);

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Bright Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 3.5);
    mainLight.position.set(8, 12, 10);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x70b0a0, 1.8);
    fillLight.position.set(-10, 6, -6);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 3.0, 25);
    rimLight.position.set(0, 8, -6);
    scene.add(rimLight);

    // NO GRAY SHADOW PLANE TO KEEP BACKGROUND 100% CLEAN & TRANSPARENT

    // Load Model
    const loader = new GLTFLoader();
    const loadModel = (urlToLoad) => {
      loader.load(
        urlToLoad,
        (gltf) => {
          const model = gltf.scene;

          // Calculate bounding box ONLY on mesh geometries to prevent huge scale shrinkage
          const box = new THREE.Box3();
          model.traverse((child) => {
            if (child.isMesh && child.geometry) {
              child.geometry.computeBoundingBox();
              box.expandByObject(child);
            }
          });

          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          // Scale model up significantly so it is large, bold and clear
          const scale = 5.2 / maxDim;
          model.scale.set(scale, scale, scale);

          model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

          model.traverse((child) => {
            if (child.isMesh) {
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
              }
            }
          });

          wrapperGroup.add(model);
        },
        undefined,
        (err) => {
          if (urlToLoad !== "/assets/kaizenx_truck_v3.glb") {
            loadModel("/assets/kaizenx_truck_v3.glb");
          }
        }
      );
    };

    loadModel(truckUrl || "/assets/kaizenx_truck_v3.glb");

    // Smooth Lerp Animation: Drive from Right (+6.5) to Left (-6.5)
    const lerp = (start, end, factor) => start + (end - start) * factor;
    let currentPosX = 6.5;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Map progress 0% -> 100% to X position from Right (+6.5) to Left (-6.5)
      const p = Math.min(Math.max(progressRef.current / 100, 0), 1);
      const targetPosX = 6.5 - p * 13.0;

      currentPosX = lerp(currentPosX, targetPosX, 0.08);

      wrapperGroup.position.x = currentPosX;
      wrapperGroup.position.y = -0.3 + Math.sin(Date.now() * 0.003) * 0.06;

      // Angle headlights facing Left (towards movement direction) with slight 3D perspective angle
      wrapperGroup.rotation.y = -Math.PI / 2 + 0.38;
      wrapperGroup.rotation.z = Math.sin(Date.now() * 0.003) * 0.015;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-[#162623] text-white p-8 select-none transition-all duration-700 ease-in-out ${
        fadeOut ? "opacity-0 pointer-events-none scale-105" : "opacity-100 scale-100"
      }`}
    >
      {/* Background Cinematic Mesh & Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[130px]" />
      </div>

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center gap-3 pt-4">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
          <svg
            width="24"
            height="26"
            viewBox="0 0 35 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14.451 5.223A7.466 7.466 0 0 1 24.9 15.891q-.3.293-.584.512L13.933 5.802q.22-.285.518-.579M7.093 25.239A7.466 7.466 0 0 0 17.607 35.84a7 7 0 0 0 .518-.574L7.675 24.73a6 6 0 0 0-.582.508"
              fill="currentColor"
            />
            <rect
              width="12.629"
              height="32.626"
              rx="6.315"
              transform="rotate(-45 16.202 6.711)"
              fill="currentColor"
            />
          </svg>
        </div>
        <span className="text-2xl font-bold tracking-tight text-white font-poppins">
          Kaizen Care
        </span>
      </div>

      {/* Center 3D Kaizen Truck Canvas */}
      <div className="relative z-10 w-full max-w-5xl flex-1 flex flex-col items-center justify-center my-2">
        <div
          ref={containerRef}
          className="w-full h-[360px] sm:h-[460px] lg:h-[520px]"
        />
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-md text-xs text-emerald-300 shadow-xl mt-[-10px]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>3D Kaizen Mobile Unit Deploying</span>
        </div>
      </div>

      {/* Bottom Progress Bar & Loading Status */}
      <div className="relative z-10 w-full max-w-md text-center space-y-3 pb-6">
        <div className="flex justify-between items-center text-xs font-semibold tracking-wider text-emerald-200/90 uppercase">
          <span>{statusText}</span>
          <span>{progress}%</span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-300 transition-all duration-500 ease-out shadow-[0_0_12px_rgba(52,211,153,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-[11px] text-white/50 tracking-tight">
          Next-generation Telehealth & Mobile Medical Unit Engine
        </p>
      </div>
    </div>
  );
}
