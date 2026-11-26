import { MathUtils } from 'three';

// Aim hips and spine toward the transfer before the pelvis crosses the sill.
export function transferAt(amount) {
  return {
    tuck: MathUtils.smoothstep(amount, .08, .53),
    inside: MathUtils.smoothstep(amount, .32, .96),
    lean: Math.sin(Math.PI * MathUtils.clamp(amount, 0, 1)),
  };
}

// Contact remains fixed from heel plant through toe-off. Swing bridges adjacent contacts.
export function gaitContact(phase, { center, halfWidth }) {
  const anchor = Math.round(phase - center) + center;
  const offset = phase - anchor;
  const stance = halfWidth + .018;
  if (Math.abs(offset) <= stance) return { from: anchor, to: anchor, swing: 0 };
  const from = offset > 0 ? anchor : anchor - 1;
  return { from, to: from + 1, swing: MathUtils.clamp((phase - from - stance) / (1 - 2 * stance), 0, 1) };
}
