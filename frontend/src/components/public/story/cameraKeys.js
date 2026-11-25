import { MathUtils } from 'three';

function tangent(a, b) {
  return a * b > 0 ? 2 * a * b / (a + b) : 0;
}

function axisAt(shots, index, channel, axis, u) {
  const [start] = shots[index];
  const [end] = shots[index + 1];
  const previous = shots[index - 1];
  const next = shots[index + 2];
  const a = shots[index][channel][axis];
  const b = shots[index + 1][channel][axis];
  const span = end - start;
  const velocity = (b - a) / span;
  // Stop at direction changes and preserve the bounds set by the doorway keys.
  const m0 = previous ? span * tangent((a - previous[channel][axis]) / (start - previous[0]), velocity) : 0;
  const m1 = next ? span * tangent(velocity, (next[channel][axis] - b) / (next[0] - end)) : 0;
  return MathUtils.lerp(a, b, u * u * (3 - 2 * u)) + u * (1 - u) * ((1 - u) * m0 - u * m1);
}

function viewAngles(eye, target) {
  const x = target[0] - eye[0];
  const y = target[1] - eye[1];
  const z = target[2] - eye[2];
  const length = Math.hypot(x, y, z);
  return { yaw: Math.atan2(x, z), pitch: Math.asin(y / length), length };
}

// A straight interpolation of focus points can sweep through the camera during a turn.
function turnWithClearance(from, to, u, eye, target) {
  const angle = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  if (Math.abs(angle) < 1.55) return;
  const mix = u * u * (3 - 2 * u);
  const yaw = from.yaw + angle * mix;
  const pitch = MathUtils.lerp(from.pitch, to.pitch, mix);
  const length = MathUtils.lerp(from.length, to.length, mix);
  const horizontal = length * Math.cos(pitch);
  target.set(eye.x + horizontal * Math.sin(yaw), eye.y + length * Math.sin(pitch),
    eye.z + horizontal * Math.cos(yaw));
}

export function sampleCameraKeys(shots, progress, eye, target) {
  const next = shots.findIndex(([end]) => progress < end);
  const index = next < 0 ? shots.length - 2 : Math.max(0, next - 1);
  const u = MathUtils.clamp((progress - shots[index][0]) / (shots[index + 1][0] - shots[index][0]), 0, 1);
  eye.set(axisAt(shots, index, 1, 0, u), axisAt(shots, index, 1, 1, u), axisAt(shots, index, 1, 2, u));
  target.set(axisAt(shots, index, 2, 0, u), axisAt(shots, index, 2, 1, u), axisAt(shots, index, 2, 2, u));
  const [, from, focus] = shots[index];
  const [, to, nextFocus] = shots[index + 1];
  turnWithClearance(viewAngles(from, focus), viewAngles(to, nextFocus), u, eye, target);
}
