import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

// All scene camera choreography belongs here. Progress is absolute, so reverse
// scrolling and jumping to any point produce exactly the same camera pose.
const path = new CatmullRomCurve3([
  new Vector3(16, 9, 25),
  new Vector3(10, 5.8, 20),
  new Vector3(4.5, 2.8, 13.5),
  new Vector3(1.4, 1.7, 8.2),
], false, 'centripetal');

const approachEnd = 0.55;
const enterStart = 0.64;

export function sampleDoor(progress) {
  return MathUtils.smoothstep(progress, 0.45, enterStart) * Math.PI / 2;
}

export function sampleFov(progress, aspect) {
  return 40 + 18 * MathUtils.smoothstep(1 - aspect, 0, 0.45) * MathUtils.smoothstep(progress, 0.85, 1);
}

export function sampleCamera(progress, aspect, target) {
  if (progress > approachEnd) {
    const travel = MathUtils.smoothstep(progress, enterStart, 1);
    const portrait = MathUtils.smoothstep(1 - aspect, 0, 0.45);
    const endZ = 2 + 0.65 * portrait;
    const z = MathUtils.lerp(8.2, endZ, travel);
    const turn = 1 - MathUtils.smoothstep(z, endZ, 3.05);
    return target.set(1.4 + 0.67 * turn, 1.7 - 0.14 * turn,
      z);
  }
  const t = MathUtils.smoothstep(progress, 0, approachEnd);
  path.getPoint(t, target);
  // Pull back the establishing shot on portrait screens; converge on the same
  // accessible entrance without crossing the closed door or ground plane.
  const portrait = MathUtils.clamp(1 / Math.max(aspect, 0.35) - 1, 0, 1.4);
  target.z += portrait * 24 * (1 - t);
  target.y += portrait * 2 * (1 - t);
  return target;
}

export function sampleLookAt(progress, target) {
  if (progress > approachEnd) {
    const t = MathUtils.smoothstep(progress, approachEnd, 1);
    const frameRoom = MathUtils.smoothstep(progress, 0.88, 1);
    return target.set(MathUtils.lerp(1.4, 2.65, t) + 0.27 * frameRoom, MathUtils.lerp(1.55, 1.02, t), MathUtils.lerp(4.3, -1.3, t));
  }
  const t = MathUtils.smoothstep(progress, 0, approachEnd);
  return target.set(MathUtils.lerp(0, 1.4, t), MathUtils.lerp(1.8, 1.55, t), MathUtils.lerp(0, 4.3, t));
}
