import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import truckUrl from "../../assets/kaizenx_truck_v3.glb?url";

export default function AppLoadingSplash({ onFinished }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing Kaizen Care...");
  const [fadeOut, setFadeOut] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);

  const progressRef = useRef(0);
  const modelLoadedRef = useRef(false);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    modelLoadedRef.current = modelLoaded;
  }, [modelLoaded]);

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Smooth loading lifecycle linked to actual 3D asset preloading
  useEffect(() => {
    if (prefersReducedMotion) {
      setProgress(100);
      setStatusText("Welcome to Kaizen Care");
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => {
          if (onFinished) onFinished();
        }, 150);
      }, 200);
      return;
    }

    let p = 0;
    const interval = setInterval(() => {
      // Step up to 85% while preloading
      if (p < 85) {
        p += 15;
        setProgress(p);
        if (p < 30) setStatusText("Connecting to Telehealth Network...");
        else if (p < 60) setStatusText("Loading 3D Kaizen Mobile Unit...");
        else setStatusText("Preparing Clinical Workspace...");
      } else {
        // Hold at 85% until 3D model is confirmed loaded (or max timeout)
        if (modelLoadedRef.current || p >= 98) {
          p = 100;
          setProgress(100);
          setStatusText("Welcome to Kaizen Care");
          clearInterval(interval);

          setTimeout(() => {
            setFadeOut(true);
            setTimeout(() => {
              if (onFinished) onFinished();
            }, 600);
          }, 300);
        } else {
          p = Math.min(p + 2, 98);
          setProgress(p);
        }
      }
    }, 110);

    return () => clearInterval(interval);
  }, [onFinished, prefersReducedMotion]);

  // 3D Scene Setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId;
    let scene, camera, renderer;
    let wrapperGroup = new THREE.Group();

    scene = new THREE.Scene();
    scene.add(wrapperGroup);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0.6, 6.5);

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
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

    // Load Model with responsive scale and framing
    const loader = new GLTFLoader();
    const loadModel = (urlToLoad) => {
      loader.load(
        urlToLoad,
        (gltf) => {
          const model = gltf.scene;

          // Compute bounding box ONLY on visible mesh geometries
          const box = new THREE.Box3();
          model.traverse((child) => {
            if (child.isMesh && child.geometry) {
              child.geometry.computeBoundingBox();
              const childBox = child.geometry.boundingBox;

              // Hide floor/road plane mesh
              const childSize = childBox.getSize(new THREE.Vector3());
              const name = (child.name || "").toLowerCase();
              const isGround =
                name.includes("plane") ||
                name.includes("floor") ||
                name.includes("ground") ||
                name.includes("road") ||
                name.includes("base") ||
                name.includes("platform") ||
                (childSize.y < 0.8 && (childSize.x > 2.5 || childSize.z > 2.5));

              if (isGround) {
                child.visible = false;
              } else {
                box.expandByObject(child);
              }
            }
          });

          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;

          // Responsive sizing based on viewport width
          const isMobileViewport = width < 640;
          const targetSize = isMobileViewport ? 2.4 : 3.8;
          const scale = targetSize / maxDim;
          model.scale.set(scale, scale, scale);

          model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

          model.traverse((child) => {
            if (child.visible && child.isMesh) {
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
              }
            }
          });

          wrapperGroup.add(model);
          setModelLoaded(true);
        },
        undefined,
        (err) => {
          if (urlToLoad !== "/assets/kaizenx_truck_v3.glb") {
            loadModel("/assets/kaizenx_truck_v3.glb");
          } else {
            // Fallback so app doesn't hang on slow network
            setModelLoaded(true);
          }
        }
      );
    };

    loadModel(truckUrl || "/assets/kaizenx_truck_v3.glb");

    // Animation Loop
    const lerp = (start, end, factor) => start + (end - start) * factor;

    const isMobileViewport = width < 640;
    const moveRange = isMobileViewport ? 1.2 : 2.6; // Keep truck 100% inside visible camera frustum
    let currentPosX = -moveRange / 2;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (!prefersReducedMotion) {
        const pr = Math.min(Math.max(progressRef.current / 100, 0), 1);
        const targetPosX = -moveRange / 2 + pr * moveRange;

        currentPosX = lerp(currentPosX, targetPosX, 0.08);

        wrapperGroup.position.x = currentPosX;
        wrapperGroup.position.y = -0.2 + Math.sin(Date.now() * 0.003) * 0.06;

        // Angle headlights facing Right (towards movement direction) with 3D perspective angle
        wrapperGroup.rotation.y = Math.PI / 2 - 0.38;
        wrapperGroup.rotation.z = Math.sin(Date.now() * 0.003) * 0.015;
      } else {
        wrapperGroup.position.x = 0;
        wrapperGroup.position.y = -0.2;
        wrapperGroup.rotation.y = Math.PI / 2 - 0.38;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || window.innerWidth;
      const newHeight = container.clientHeight || window.innerHeight;
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
  }, [prefersReducedMotion]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-[#162623] text-white p-6 sm:p-8 select-none transition-opacity duration-600 ease-out ${
        fadeOut
          ? "opacity-0 pointer-events-none"
          : "opacity-100 pointer-events-auto"
      }`}
      aria-hidden={fadeOut}
      role="dialog"
      aria-label="Application Loading"
    >
      {/* Background Mesh Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center gap-3 pt-2 sm:pt-4">
        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
          <svg
            width="22"
            height="24"
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
        <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-poppins">
          Kaizen Care
        </span>
      </div>

      {/* Center 3D Truck Container */}
      <div className="relative z-10 w-full max-w-4xl flex-1 flex flex-col items-center justify-center my-2">
        <div
          ref={containerRef}
          className="w-full h-[300px] sm:h-[400px] lg:h-[460px] cursor-grab active:cursor-grabbing"
        />
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-md text-xs text-emerald-300 shadow-xl mt-[-10px]">
          <span
            className={`w-2 h-2 rounded-full bg-emerald-400 ${
              prefersReducedMotion ? "" : "animate-ping"
            }`}
          />
          <span>Kaizen 3D Mobile Unit Deploying</span>
        </div>
      </div>

      {/* Bottom Progress Bar & Loading Status */}
      <div className="relative z-10 w-full max-w-md text-center space-y-3 pb-4 sm:pb-6">
        <div className="flex justify-between items-center text-xs font-semibold tracking-wider text-emerald-200/90 uppercase">
          <span>{statusText}</span>
          <span>{progress}%</span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-300 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(52,211,153,0.8)]"
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
