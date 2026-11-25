import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

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

const forward = new Vector3();
const origin = new Vector3();
const targetPoint = new Vector3();
const up = new Vector3(0, 1, 0);
const rotation = new Matrix4();
const orientations = new WeakMap();

function shotOrientations(shots) {
  if (!orientations.has(shots)) {
    orientations.set(shots, shots.map(([, from, focus]) => {
      forward.fromArray(focus).sub(origin.fromArray(from));
      return {
        yaw: Math.atan2(forward.x, forward.z),
        distance: forward.length(),
        quaternion: new Quaternion().setFromRotationMatrix(rotation.lookAt(origin, targetPoint.fromArray(focus), up)),
      };
    }));
  }
  return orientations.get(shots);
}

const orientation = new Quaternion();

// For wide turns interpolate the view rotation so the focus cannot cross the lens.
function turnWithClearance(from, to, u, eye, target) {
  const angle = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  if (Math.abs(angle) < 1.55) return;
  const mix = MathUtils.smoothstep(u, 0, 1);
  orientation.slerpQuaternions(from.quaternion, to.quaternion, mix);
  forward.set(0, 0, -1).applyQuaternion(orientation);
  target.copy(eye).addScaledVector(forward, MathUtils.lerp(from.distance, to.distance, mix));
}

export function sampleCameraKeys(shots, progress, eye, target) {
  const next = shots.findIndex(([end]) => progress < end);
  const index = next < 0 ? shots.length - 2 : Math.max(0, next - 1);
  const u = MathUtils.clamp((progress - shots[index][0]) / (shots[index + 1][0] - shots[index][0]), 0, 1);
  eye.set(axisAt(shots, index, 1, 0, u), axisAt(shots, index, 1, 1, u), axisAt(shots, index, 1, 2, u));
  target.set(axisAt(shots, index, 2, 0, u), axisAt(shots, index, 2, 1, u), axisAt(shots, index, 2, 2, u));
  const keys = shotOrientations(shots);
  turnWithClearance(keys[index], keys[index + 1], u, eye, target);
}
