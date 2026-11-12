import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import truckUrl from "../../assets/kaizenx_truck_v3.glb?url";

export default function AppLoadingSplash({ onFinished }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing Kaizen Care...");
  const [fadeOut, setFadeOut] = useState(false);

  // Simulated progress timer for ultra-smooth splash feel
  useEffect(() => {
    const steps = [
      { p: 25, text: "Connecting to Telehealth Network..." },
      { p: 55, text: "Loading 3D Kaizen Mobile Unit..." },
      { p: 85, text: "Preparing Clinical Workspace..." },
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
    }, 450);

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
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 6.0);

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.8);
    mainLight.position.set(6, 12, 8);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x70b0a0, 1.4);
    fillLight.position.set(-8, 6, -6);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 2.5, 20);
    rimLight.position.set(0, 6, -5);
    scene.add(rimLight);

    // Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(10, 10);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.1;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Load Model
    const loader = new GLTFLoader();
    const loadModel = (urlToLoad) => {
      loader.load(
        urlToLoad,
        (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 3.4 / (maxDim || 1);
          model.scale.set(scale, scale, scale);

          model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.side = THREE.DoubleSide;
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

    // Continuous 360 Spin & Floating Motion
    let rot = Math.PI / 4;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      rot += 0.012;
      wrapperGroup.rotation.y = rot;
      wrapperGroup.rotation.x = Math.sin(rot * 0.5) * 0.08;
      wrapperGroup.position.y = -0.2 + Math.sin(Date.now() * 0.002) * 0.08;

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
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[120px]" />
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
      <div className="relative z-10 w-full max-w-2xl flex-1 flex flex-col items-center justify-center my-4">
        <div
          ref={containerRef}
          className="w-full h-[320px] sm:h-[400px] lg:h-[460px] cursor-grab active:cursor-grabbing"
        />
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-md text-xs text-emerald-300 shadow-xl mt-[-20px]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Kaizen 3D Mobile Unit Active</span>
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
