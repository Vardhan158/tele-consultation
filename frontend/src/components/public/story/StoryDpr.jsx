import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export default function StoryDpr({ controller, visible }) {
  const sample = useRef({ time: 0, progress: -1, elapsed: 0, frames: 0, good: 0 });
  useFrame(({ viewport, size, setDpr }) => {
    const state = sample.current;
    const time = performance.now();
    const progress = controller.progress;
    const elapsed = time - state.time;
    const moving = visible && progress !== state.progress && elapsed < 180;
    state.time = time;
    state.progress = progress;
    if (!moving) {
      state.elapsed = 0;
      state.frames = 0;
      state.good = 0;
      return;
    }
    state.elapsed += elapsed;
    state.frames++;
    if (state.elapsed < 700) return;
    const portrait = size.width < size.height;
    const fps = 1000 * state.frames / state.elapsed;
    const ceiling = Math.min(window.devicePixelRatio || 1, 1.5);
    const floor = Math.min(ceiling, portrait ? 1 : .875);
    if (fps < (portrait ? 31 : 48)) {
      setDpr(Math.max(floor, viewport.dpr - .125));
      state.good = 0;
    } else if (fps > (portrait ? 44 : 57)) {
      state.good++;
      if (state.good >= 3) {
        setDpr(Math.min(ceiling, viewport.dpr + .125));
        state.good = 0;
      }
    } else {
      state.good = 0;
    }
    state.elapsed = 0;
    state.frames = 0;
  }, -4);
  return null;
}
