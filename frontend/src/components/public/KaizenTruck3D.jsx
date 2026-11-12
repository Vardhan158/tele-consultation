import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import truckUrl from "../../assets/kaizenx_truck_v3.glb?url";

export default function KaizenTruck3D() {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId;
    let scene, camera, renderer, model;
    let wrapperGroup = new THREE.Group();
    let isMouseOver = false;
    let mouseX = 0;
    let mouseY = 0;

    // Scroll state tracking for ultra-smooth lerp
    let currentScrollProgress = 0;
    let targetScrollProgress = 0;
    let currentRotY = 0;
    let currentRotX = 0;
    let currentPosX = 0;
    let currentPosY = 0;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.add(wrapperGroup);

    // 2. Camera Setup
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 6.5);

    // 3. Renderer Setup with Antialiasing & Shadow Support
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
    renderer.toneMappingExposure = 1.15;

    // Clear existing canvas if any
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 4. Lighting System for Studio-Quality Rendering
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
    mainLight.position.set(6, 12, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.bias = -0.0001;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x70b0a0, 1.2);
    fillLight.position.set(-8, 6, -6);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xffe8d0, 2.0, 20);
    rimLight.position.set(0, 8, -6);
    scene.add(rimLight);

    // 5. Load GLTF / GLB Model with fallback
    const loader = new GLTFLoader();
    const loadModel = (urlToLoad) => {
      loader.load(
        urlToLoad,
        (gltf) => {
          model = gltf.scene;

          // Hide floor/road/plane meshes inside the GLB model
          model.traverse((child) => {
            if (child.isMesh && child.geometry) {
              child.geometry.computeBoundingBox();
              const childBox = child.geometry.boundingBox;
              const childSize = childBox.getSize(new THREE.Vector3());
              const name = (child.name || "").toLowerCase();

              // Detect flat ground/road/plane mesh (e.g. name contains floor/plane/road or Y height is flat relative to X/Z)
              const isGround =
                name.includes("plane") ||
                name.includes("floor") ||
                name.includes("ground") ||
                name.includes("road") ||
                name.includes("base") ||
                name.includes("platform") ||
                (childSize.y < 0.8 && (childSize.x > 2.5 || childSize.z > 2.5));

              if (isGround) {
                child.visible = false; // Hide the giant grey floor plane completely!
              }
            }
          });

          // Compute bounding box ONLY on visible truck meshes
          const box = new THREE.Box3();
          model.traverse((child) => {
            if (child.visible && child.isMesh && child.geometry) {
              box.expandByObject(child);
            }
          });

          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 5.5 / maxDim;
          model.scale.set(scale, scale, scale);

          // Center position inside wrapper group
          model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

          // Enable shadows and double-sided materials for high visibility
          model.traverse((child) => {
            if (child.visible && child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
              }
            }
          });

          wrapperGroup.add(model);
          setLoading(false);
        },
        (xhr) => {
          if (xhr.total > 0) {
            setProgress(Math.round((xhr.loaded / xhr.total) * 100));
          }
        },
        (err) => {
          console.warn("Primary GLB url failed, attempting public fallback path...", err);
          if (urlToLoad !== "/assets/kaizenx_truck_v3.glb") {
            loadModel("/assets/kaizenx_truck_v3.glb");
          } else {
            console.error("Failed to load 3D Truck Model from all paths:", err);
            setError(true);
            setLoading(false);
          }
        }
      );
    };

    loadModel(truckUrl || "/assets/kaizenx_truck_v3.glb");

    // 6. Scroll Handler for Target Interpolation
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      const totalHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        targetScrollProgress = Math.min(Math.max(scrollY / totalHeight, 0), 1);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    // 7. Mouse Movement Handler for Parallax Effect
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseX = (x / rect.width - 0.5) * 2;
      mouseY = (y / rect.height - 0.5) * 2;
    };

    const handleMouseEnter = () => {
      isMouseOver = true;
    };
    const handleMouseLeave = () => {
      isMouseOver = false;
      mouseX = 0;
      mouseY = 0;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    // 8. Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);

    // 9. Ultra-Smooth 60FPS Lerp Animation Loop
    const lerp = (start, end, factor) => start + (end - start) * factor;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Poll scroll position 60fps
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const totalHeight = (document.documentElement.scrollHeight - window.innerHeight) || 1;
      targetScrollProgress = Math.min(Math.max(scrollY / totalHeight, 0), 1);

      // Smooth scroll progress lerp
      currentScrollProgress = lerp(
        currentScrollProgress,
        targetScrollProgress,
        0.06
      );

      if (wrapperGroup) {
        // Target Y-rotation and X-translation based on scroll
        const targetRotY =
          Math.PI / 4 + currentScrollProgress * Math.PI * 4 + mouseX * 0.3;
        const targetRotX = (currentScrollProgress - 0.5) * 0.25 + mouseY * 0.15;
        const targetPosX = (currentScrollProgress - 0.5) * 2.2 + mouseX * 0.25;
        const targetPosY = -0.2 + Math.sin(Date.now() * 0.0018) * 0.08;

        currentRotY = lerp(currentRotY, targetRotY, 0.08);
        currentRotX = lerp(currentRotX, targetRotX, 0.08);
        currentPosX = lerp(currentPosX, targetPosX, 0.06);
        currentPosY = lerp(currentPosY, targetPosY, 0.06);

        wrapperGroup.rotation.y = currentRotY;
        wrapperGroup.rotation.x = currentRotX;
        wrapperGroup.position.x = currentPosX;
        wrapperGroup.position.y = currentPosY;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Clean up
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseenter", handleMouseEnter);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
      renderer.dispose();
      scene.clear();
    };
  }, []);

  if (error) {
    return (
      <div className="w-full h-[400px] lg:h-[500px] flex items-center justify-center bg-zinc-900/40 rounded-3xl border border-white/10 text-white/70 text-sm">
        Unable to load 3D Mobile Unit.
      </div>
    );
  }

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] lg:h-[540px] flex items-center justify-center select-none overflow-hidden group">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#162623]/80 backdrop-blur-md rounded-3xl transition-opacity duration-500">
          <div className="w-12 h-12 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-emerald-100 tracking-wider uppercase">
            Loading Kaizen Mobile Unit 3D ({progress}%)
          </p>
        </div>
      )}

      {/* Interactive Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-500"
      />

      {/* Floating 3D Badge Indicator */}
      <div className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs text-white/90 shadow-lg pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>3D Scroll Interactive · Move Cursor / Scroll Page</span>
      </div>
    </div>
  );
}
