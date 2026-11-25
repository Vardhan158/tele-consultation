import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

export const travelStart = .76;
export const carStartX = -5;
export const carLaneZ = 12.65;
export const wheelRadius = .34;
const route = new CatmullRomCurve3([
  [3.93, .19, -1.29], [4.57, .19, -.80], [4.35, .19, .78],
  [1.42, .19, 2.29], [1.40, .18, 3.58], [1.40, .18, 5.12],
  [1.39, .12, 7.85], [.54, .06, 10.15], [-2.24, .025, 10.75], [-5.54, .025, 11.34],
].map((p) => new Vector3(...p)));

export function preTravelProgress(progress) {
  return MathUtils.clamp(progress / travelStart, 0, 1);
}

export function travelProgress(progress) {
  return MathUtils.clamp((progress - travelStart) / (1 - travelStart), 0, 1);
}

export function sampleTravel(t) {
  const drive = MathUtils.smoothstep(t, .59, .969);
  const distance = 37 * drive;
  const curb = MathUtils.smoothstep(t, .84, .969);
  return {
    stand: MathUtils.smoothstep(t, 0, .105),
    walk: MathUtils.smoothstep(t, .08, .44),
    enter: MathUtils.smoothstep(t, .479, .55),
    door: (MathUtils.smoothstep(t, .434, .48) - MathUtils.smoothstep(t, .55, .587)) * 1.04,
    carX: carStartX + distance,
    carZ: carLaneZ - .63 * curb,
    heading: .10 * Math.sin(Math.PI * curb),
    wheel: -distance / wheelRadius,
    parked: t >= .969,
  };
}

export const departureTrack = route;

export function walkPose(t, position, tangent) {
  route.getPointAt(t, position);
  route.getTangentAt(t, tangent);
  return Math.atan2(tangent.x, tangent.z);
}
