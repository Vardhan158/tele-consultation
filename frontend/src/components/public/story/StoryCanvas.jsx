import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Sky } from '@react-three/drei';
import { PCFShadowMap } from 'three';
import CameraRig from './CameraRig';
import HouseScene from './HouseScene';
import PharmacyTravel from './PharmacyTravel';
import PharmacyInterior from './PharmacyInterior';
import LivingRoom from './LivingRoom';
import FinaleProps from './FinaleProps';
import StoryDpr from './StoryDpr';
import StoryLights from './StoryLights';
import { previousStory } from './finaleTimeline';

function Fallback() {
  return <div className="care-story-fallback">A welcoming home, designed around everyday life.<br />The 3D view is unavailable on this device.</div>;
}

class CanvasBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}

function SceneReady({ onReady }) {
  useLayoutEffect(() => { onReady(true); }, [onReady]);
  return null;
}

export default function StoryCanvas({ controller, visible }) {
  const [baseReady, setBaseReady] = useState(false);
  const [loadLater, setLoadLater] = useState(false);
  const [laterReady, setLaterReady] = useState(false);
  useEffect(() => {
    if (!baseReady) return undefined;
    // Let the first house frame render before parsing the rest of the journey.
    let nextFrame;
    const firstFrame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => setLoadLater(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(nextFrame);
    };
  }, [baseReady]);

  const renderProgress = useMemo(() => ({
    get progress() { return laterReady ? controller.progress : Math.min(controller.progress, .055); },
    subscribe: (listener) => controller.subscribe(listener),
  }), [controller, laterReady]);
  // Keep the earlier chapters on their original timeline and one Canvas.
  const chapters = useMemo(() => ({
    get progress() { return previousStory(renderProgress.progress); },
    subscribe: renderProgress.subscribe,
  }), [renderProgress]);
  return (
    <CanvasBoundary>
      <Canvas
        frameloop={visible ? "demand" : "never"}
        shadows={{ type: PCFShadowMap }}
        onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; }}
        dpr={[1, 1.5]}
        camera={{ position: [16, 9, 25], fov: 40, near: 0.025, far: 180 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
        fallback={<Fallback />}
      >
        <color attach="background" args={['#dce8e9']} />
        <fog attach="fog" args={['#dce8e9', 55, 130]} />
        <StoryLights controller={renderProgress} />
        <StoryDpr controller={renderProgress} visible={visible} />
        <Sky sunPosition={[-12, 18, 12]} turbidity={3} rayleigh={0.7} />
        <CameraRig controller={renderProgress} />
        <Suspense fallback={null}>
          <Environment files="/assets/house/daylight.hdr" environmentIntensity={0.45} />
          <HouseScene controller={chapters} finaleController={renderProgress} />
          <PharmacyTravel controller={chapters} />
          <SceneReady onReady={setBaseReady} />
        </Suspense>
        {loadLater && <Suspense fallback={null}>
          <PharmacyInterior controller={chapters} />
          <LivingRoom controller={chapters} finaleController={renderProgress} />
          <FinaleProps controller={renderProgress} />
          <SceneReady onReady={setLaterReady} />
        </Suspense>}
      </Canvas>
    </CanvasBoundary>
  );
}
