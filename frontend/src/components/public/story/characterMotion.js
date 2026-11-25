import { MathUtils } from 'three';

export function stanceAt(phase, { center, halfWidth }) {
  const anchor = Math.round(phase - center) + center;
  const weight = 1 - MathUtils.smoothstep(Math.abs(phase - anchor), halfWidth * .57, halfWidth);
  return { anchor, weight };
}

// Aim hips and spine toward the transfer before the pelvis crosses the sill.
export function transferAt(amount) {
  return {
    tuck: MathUtils.smoothstep(amount, .08, .53),
    inside: MathUtils.smoothstep(amount, .32, .96),
    lean: Math.sin(Math.PI * MathUtils.clamp(amount, 0, 1)),
  };
}
