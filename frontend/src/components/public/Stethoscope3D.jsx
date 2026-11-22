import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import stethoscopeGlbUrl from "../../assets/Stethoscope.glb?url";

export default function Stethoscope3D({ className = "", interactive = true }) {
  const mountRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 2. Lighting System
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
    mainLight.position.set(5, 8, 5);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const tealGlowLight = new THREE.PointLight(0x20c7a7, 3.5, 12);
    tealGlowLight.position.set(-3, -2, 3);
    scene.add(tealGlowLight);

    const rimLight = new THREE.DirectionalLight(0xa5f3fc, 1.5);
    rimLight.position.set(-5, -5, -2);
    scene.add(rimLight);

    // 3. Stethoscope 3D Model Group Container
    const stethoscopeGroup = new THREE.Group();
    scene.add(stethoscopeGroup);

    // --- PROCEDURAL PROCEDURAL FALLBACK MESH ---
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.15,
    });
    const tubingMaterial = new THREE.MeshStandardMaterial({
      color: 0x123d35,
      roughness: 0.35,
      metalness: 0.1,
    });
    const rimRubberMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.05,
    });
    const earTipMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.1,
    });

    const fallbackGroup = new THREE.Group();

    // Diaphragm
    const diaphragmMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.22, 64), chromeMaterial);
    diaphragmMesh.rotation.x = Math.PI / 2;
    fallbackGroup.add(diaphragmMesh);

    const rimRingMesh = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 24, 64), rimRubberMaterial);
    fallbackGroup.add(rimRingMesh);

    const faceMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 64),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.3, roughness: 0.1 })
    );
    faceMesh.position.z = 0.12;
    fallbackGroup.add(faceMesh);

    const bellMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 0.4, 48), chromeMaterial);
    bellMesh.position.z = -0.28;
    bellMesh.rotation.x = Math.PI / 2;
    fallbackGroup.add(bellMesh);

    fallbackGroup.position.set(0, -1.8, 0.2);

    // Tubing Main
    const tubePathMain = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.8, 0.1),
      new THREE.Vector3(0, -0.2, 0.3),
      new THREE.Vector3(0, 0.5, 0.2),
      new THREE.Vector3(0, 1.1, 0.0),
    ]);
    const tubeMainMesh = new THREE.Mesh(new THREE.TubeGeometry(tubePathMain, 64, 0.16, 24, false), tubingMaterial);
    stethoscopeGroup.add(tubeMainMesh);

    const tubeLeftPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.1, 0),
      new THREE.Vector3(-0.5, 1.4, -0.1),
      new THREE.Vector3(-1.0, 1.9, -0.2),
    ]);
    stethoscopeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(tubeLeftPath, 32, 0.14, 20, false), tubingMaterial));

    const tubeRightPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.1, 0),
      new THREE.Vector3(0.5, 1.4, -0.1),
      new THREE.Vector3(1.0, 1.9, -0.2),
    ]);
    stethoscopeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(tubeRightPath, 32, 0.14, 20, false), tubingMaterial));

    const earLeftPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.0, 1.9, -0.2),
      new THREE.Vector3(-1.3, 2.5, -0.1),
      new THREE.Vector3(-1.1, 3.1, 0.1),
      new THREE.Vector3(-0.6, 3.4, 0.2),
    ]);
    stethoscopeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(earLeftPath, 48, 0.1, 20, false), chromeMaterial));

    const earRightPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.0, 1.9, -0.2),
      new THREE.Vector3(1.3, 2.5, -0.1),
      new THREE.Vector3(1.1, 3.1, 0.1),
      new THREE.Vector3(0.6, 3.4, 0.2),
    ]);
    stethoscopeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(earRightPath, 48, 0.1, 20, false), chromeMaterial));

    const leftTip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 24), earTipMaterial);
    leftTip.position.set(-0.6, 3.4, 0.2);
    stethoscopeGroup.add(leftTip);

    const rightTip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 24), earTipMaterial);
    rightTip.position.set(0.6, 3.4, 0.2);
    stethoscopeGroup.add(rightTip);

    stethoscopeGroup.add(fallbackGroup);
    stethoscopeGroup.rotation.z = -0.15;
    stethoscopeGroup.scale.set(0.95, 0.95, 0.95);

    // --- 4. LOAD ACTUAL GLTF / GLB ASSET ---
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      stethoscopeGlbUrl,
      (gltf) => {
        const model = gltf.scene;

        // Auto-center & auto-scale GLB asset to fit container viewport
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim > 0) {
          const desiredScale = 4.2 / maxDim;
          model.scale.set(desiredScale, desiredScale, desiredScale);
          model.position.sub(center.multiplyScalar(desiredScale));
        }

        // Enable shadows & metallic highlights
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material.envMapIntensity = 1.6;
              child.material.needsUpdate = true;
            }
          }
        });

        // Swap out fallback mesh for real GLTF model
        stethoscopeGroup.clear();
        stethoscopeGroup.add(model);
        setLoaded(true);
      },
      undefined,
      (error) => {
        console.warn("GLB load fallback engaged:", error);
      }
    );

    // 5. Interactive Mouse Rotation State
    let targetRotationX = 0;
    let targetRotationY = 0;
    let isDragging = false;
    let previousMouseX = 0;
    let previousMouseY = 0;

    const handlePointerDown = (e) => {
      if (!interactive) return;
      isDragging = true;
      previousMouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      previousMouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    };

    const handlePointerMove = (e) => {
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      if (isDragging && interactive) {
        const deltaX = clientX - previousMouseX;
        const deltaY = clientY - previousMouseY;

        targetRotationY += deltaX * 0.008;
        targetRotationX += deltaY * 0.008;

        previousMouseX = clientX;
        previousMouseY = clientY;
      } else {
        const rect = container.getBoundingClientRect();
        const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;

        targetRotationY = mouseX * 0.35;
        targetRotationX = -mouseY * 0.25;
      }
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const domContainer = container;
    if (interactive) {
      domContainer.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    // 6. Animation Loop
    let clock = new THREE.Clock();
    let animFrameId;

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      stethoscopeGroup.rotation.y += (targetRotationY - stethoscopeGroup.rotation.y) * 0.05;
      stethoscopeGroup.rotation.x += (targetRotationX - stethoscopeGroup.rotation.x) * 0.05;

      if (!isDragging) {
        stethoscopeGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.12;
        stethoscopeGroup.rotation.z = -0.15 + Math.cos(elapsedTime * 1.2) * 0.04;
      }

      tealGlowLight.position.x = Math.sin(elapsedTime * 1.2) * 4;
      tealGlowLight.position.z = Math.cos(elapsedTime * 1.2) * 4;

      renderer.render(scene, camera);
      animFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 7. Responsive Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 400;
      const newH = container.clientHeight || 400;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", handleResize);
      if (interactive) {
        domContainer.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }
      if (domContainer.contains(renderer.domElement)) {
        domContainer.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [interactive]);

  return (
    <div
      ref={mountRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative w-full h-[380px] sm:h-[480px] lg:h-[560px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none ${className}`}
    >
      {/* Subtle Background Glow Ring */}
      <div className="pointer-events-none absolute size-64 sm:size-80 lg:size-96 rounded-full bg-gradient-to-tr from-[#20C7A7]/20 via-[#1A7D67]/10 to-transparent blur-3xl animate-pulse" />

      {/* FS 60P Style Badge */}
      <div className="absolute top-4 right-4 z-20 px-3 py-1 rounded-full bg-[#EBEBEB] text-[#000000] text-[10px] font-mono font-medium border border-zinc-300 shadow-2xs">
        {loaded ? "Stethoscope.glb · Loaded" : "3D WebGL Engine"}
      </div>

      {/* Interactive Helper Pill */}
      {interactive && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#000000]/80 text-[#FFFFFF] text-[11px] font-medium border border-white/20 backdrop-blur-md transition-opacity duration-300 pointer-events-none ${
          hovered ? "opacity-100" : "opacity-70"
        }`}>
          ✨ Drag or move cursor to inspect 3D Stethoscope
        </div>
      )}
    </div>
  );
}
