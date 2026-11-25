import { useMemo } from 'react';
import { CanvasTexture } from 'three';

let falloff;

function contactTexture() {
  if (falloff) return falloff;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.45, 'rgba(255,255,255,.54)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  falloff = new CanvasTexture(canvas);
  return falloff;
}

export default function ContactShadow({ position, size, opacity }) {
  const map = useMemo(() => contactTexture(), []);
  return <mesh position={position} rotation-x={-Math.PI / 2}>
    <planeGeometry args={size} />
    <meshBasicMaterial map={map} color="#27251e" toneMapped={false} transparent opacity={opacity} depthWrite={false} />
  </mesh>;
}
