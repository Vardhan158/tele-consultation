import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import stethoscopeGlbUrl from "../../assets/Stethoscope.glb?url";

export default function Stethoscope3D({ className = "", interactive = true, cinematic = false }) {
  const mountRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [fps, setFps] = useState(60);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8.2);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setUnavailable(true));
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 2. Studio Room Environment Map (Photorealistic Luxury Reflection Engine)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment(renderer);
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;

    // 3. Studio Lighting System
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 3.2);
    mainLight.position.set(6, 9, 6);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const cyanSpotLight = new THREE.PointLight(0x20c7a7, 4.5, 14);
    cyanSpotLight.position.set(-3.5, -2, 4);
    scene.add(cyanSpotLight);

    const rimLight = new THREE.DirectionalLight(0xa5f3fc, 2.0);
    rimLight.position.set(-6, -6, -3);
    scene.add(rimLight);

    // 4. Contact Drop Shadow Floor (Realistic Studio Floor Shadow)
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(18, 61, 53, 0.5)");
    grad.addColorStop(0.4, "rgba(18, 61, 53, 0.2)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowGeo = new THREE.PlaneGeometry(6, 6);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -2.8;
    scene.add(shadowMesh);

    // 5. Stethoscope 3D Model Group Container
    const stethoscopeGroup = new THREE.Group();
    scene.add(stethoscopeGroup);

    // --- PROCEDURAL FALLBACK MESH ---
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.96,
      roughness: 0.1,
      envMapIntensity: 2.0,
    });
    const tubingMaterial = new THREE.MeshStandardMaterial({
      color: 0x123d35,
      roughness: 0.28,
      metalness: 0.12,
      envMapIntensity: 1.2,
    });
    const rimRubberMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.65,
      metalness: 0.05,
    });
    const earTipMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
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
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.4, roughness: 0.08, envMapIntensity: 2.2 })
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
    stethoscopeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(tubePathMain, 64, 0.16, 24, false), tubingMaterial));

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

    // --- 6. LOAD ACTUAL GLTF / GLB ASSET ---
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      stethoscopeGlbUrl,
      (gltf) => {
        const model = gltf.scene;

        // Auto-center & auto-scale GLB asset
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim > 0) {
          const desiredScale = 4.2 / maxDim;
          model.scale.set(desiredScale, desiredScale, desiredScale);
          model.position.sub(center.multiplyScalar(desiredScale));
        }

        // Apply luxury reflections & shadows to meshes
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material.envMapIntensity = 2.2;
              child.material.roughness = Math.min(child.material.roughness, 0.3);
              child.material.needsUpdate = true;
            }
          }
        });

        stethoscopeGroup.clear();
        stethoscopeGroup.add(model);
        setLoaded(true);
      },
      undefined,
      (error) => {
        console.warn("GLB load fallback engaged:", error);
      }
    );

    // 7. Momentum Inertia Drag Physics (Like thewatch.60fps.fr)
    let currentRotationX = 0;
    let currentRotationY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let isDragging = false;
    let previousMouseX = 0;
    let previousMouseY = 0;

    const handlePointerDown = (e) => {
      if (!interactive) return;
      isDragging = true;
      previousMouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      previousMouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      velocityX = 0;
      velocityY = 0;
    };

    const handlePointerMove = (e) => {
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      if (isDragging && interactive) {
        const deltaX = clientX - previousMouseX;
        const deltaY = clientY - previousMouseY;

        velocityX = deltaX * 0.007;
        velocityY = deltaY * 0.007;

        currentRotationY += velocityX;
        currentRotationX += velocityY;

        previousMouseX = clientX;
        previousMouseY = clientY;
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

    // 8. Scroll-Driven 3D Story
    let scrollRotationY = 0;
    let cinematicProgress = 0;
    let cinematicTarget = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      scrollRotationY = scrollY * 0.0015;

      if (cinematic) {
        const story = container.closest("[data-stethoscope-story]");
        if (story) {
          const rect = story.getBoundingClientRect();
          const distance = Math.max(1, rect.height - window.innerHeight);
          cinematicTarget = THREE.MathUtils.clamp(-rect.top / distance, 0, 1);
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    // 9. Animation Loop (60 FPS Inertia & Floating)
    let clock = new THREE.Clock();
    let animFrameId;
    let lastFpsCheck = performance.now();
    let frameCount = 0;

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Inertia Momentum Decay
      if (!isDragging) {
        currentRotationY += velocityX;
        currentRotationX += velocityY;
        velocityX *= 0.94; // Friction decay
        velocityY *= 0.94;
      }

      // Cinematic mode maps the story's scroll progress to one continuous
      // camera/model timeline, similar to the persistent scene on The Watch.
      if (cinematic) {
        cinematicProgress = reduceMotion
          ? cinematicTarget
          : THREE.MathUtils.lerp(cinematicProgress, cinematicTarget, 0.075);
        const p = cinematicProgress;
        const orbit = p * Math.PI * 1.35;
        const focus = Math.sin(Math.min(1, p * 1.7) * Math.PI * 0.5);

        stethoscopeGroup.rotation.x = -0.18 + Math.sin(p * Math.PI * 2) * 0.32;
        stethoscopeGroup.rotation.y = -0.55 + orbit;
        stethoscopeGroup.rotation.z = -0.18 + Math.sin(p * Math.PI) * 0.24;
        stethoscopeGroup.position.x = Math.sin(p * Math.PI * 2) * 0.72;
        stethoscopeGroup.position.y = THREE.MathUtils.lerp(-0.15, 0.28, focus) + Math.sin(p * Math.PI * 3) * 0.18;
        const storyScale = 0.88 + Math.sin(p * Math.PI) * 0.28;
        stethoscopeGroup.scale.setScalar(storyScale);

        camera.position.z = THREE.MathUtils.lerp(9.4, 7.1, Math.sin(p * Math.PI));
        camera.position.x = Math.sin(p * Math.PI * 2) * 0.35;
        camera.lookAt(0, 0, 0);
        cyanSpotLight.position.x = Math.sin(orbit) * 5;
        cyanSpotLight.position.z = Math.cos(orbit) * 5;
        shadowMesh.material.opacity = THREE.MathUtils.lerp(0.35, 0.72, Math.sin(p * Math.PI));
      } else if (!isDragging && Math.abs(velocityX) < 0.0001 && Math.abs(velocityY) < 0.0001) {
        stethoscopeGroup.position.y = Math.sin(elapsedTime * 1.4) * 0.8; // top to bottom movement
        stethoscopeGroup.position.x = Math.sin(elapsedTime * 0.9) * 0.7; // left right left right combination
        stethoscopeGroup.rotation.y = currentRotationY + scrollRotationY + Math.sin(elapsedTime * 0.7) * 0.25;
        stethoscopeGroup.rotation.x = currentRotationX + Math.cos(elapsedTime * 1.1) * 0.2;
        stethoscopeGroup.rotation.z = -0.15 + Math.sin(elapsedTime * 0.8) * 0.12;
      } else {
        stethoscopeGroup.position.x += (0 - stethoscopeGroup.position.x) * 0.05;
        stethoscopeGroup.position.y += (0 - stethoscopeGroup.position.y) * 0.05;
      }

      if (!cinematic) {
        cyanSpotLight.position.x = Math.sin(elapsedTime * 1.2) * 4;
        cyanSpotLight.position.z = Math.cos(elapsedTime * 1.2) * 4;
      }

      renderer.render(scene, camera);

      // FPS Counter
      frameCount++;
      const nowTime = performance.now();
      if (nowTime - lastFpsCheck >= 1000) {
        setFps(Math.round((frameCount * 1000) / (nowTime - lastFpsCheck)));
        frameCount = 0;
        lastFpsCheck = nowTime;
      }

      animFrameId = requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && animFrameId === undefined) {
        lastFpsCheck = performance.now();
        frameCount = 0;
        animFrameId = requestAnimationFrame(animate);
      } else if (!entry.isIntersecting && animFrameId !== undefined) {
        cancelAnimationFrame(animFrameId);
        animFrameId = undefined;
      }
    });
    observer.observe(container);

    // 10. Responsive Resize Handler
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
      observer.disconnect();
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
      if (interactive) {
        domContainer.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }
      pmremGenerator.dispose();
      roomEnv.dispose();
      if (domContainer.contains(renderer.domElement)) {
        domContainer.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [interactive, cinematic]);

  return (
    <div
      ref={mountRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative w-full h-[400px] sm:h-[500px] lg:h-[600px] flex items-center justify-center ${interactive ? "cursor-grab active:cursor-grabbing" : ""} select-none ${className}`}
    >
      {/* Luxury Background Glow Ring */}
      <div className="pointer-events-none absolute size-72 sm:size-96 lg:size-[480px] rounded-full bg-gradient-to-tr from-[#20C7A7]/25 via-[#123D35]/15 to-transparent blur-3xl animate-pulse" />

      {unavailable && (
        <p role="status" className="relative z-20 rounded-lg bg-white/90 px-4 py-3 text-sm text-[#162623]">
          The 3D stethoscope is unavailable on this device.
        </p>
      )}

      {/* FS 60P Studio Style Badge */}
      {!unavailable && !cinematic && <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBEBEB] text-[#000000] text-[10px] font-mono font-medium border border-zinc-300 shadow-2xs">
        <span className="size-2 rounded-full bg-[#123D35] animate-ping" />
        <span>{loaded ? "Stethoscope.glb · Loaded" : "3D WebGL Engine"}</span>
        <span className="opacity-40">|</span>
        <span className="text-[#123D35] font-bold">{fps} FPS</span>
      </div>}

      {/* Interactive Helper Pill */}
      {!unavailable && interactive && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-[#000000]/80 text-[#FFFFFF] text-[11px] font-medium border border-white/20 backdrop-blur-md transition-all duration-300 pointer-events-none ${
          hovered ? "opacity-100 scale-102" : "opacity-75 scale-100"
        }`}>
          ✨ Spin, drag or scroll to inspect 3D Stethoscope
        </div>
      )}
    </div>
  );
}
