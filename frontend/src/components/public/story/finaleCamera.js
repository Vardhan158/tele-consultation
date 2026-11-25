import { MathUtils } from 'three';
import { sampleCameraKeys } from './cameraKeys.js';

const shots = [
  [0,[1.55,1.70,2.89],[2.64,1.20,-.10]],
  [.115,[1.25,1.74,1.09],[2.64,1.27,-.89]],
  [.22,[.99,1.66,.18],[2.62,1.28,-.70]],
  [.372,[.84,1.67,-.82],[2.54,1.43,-.42]],
  [.438,[1.72,1.71,1.5],[3.32,1.23,-.69]],
  [.55,[3.38,1.53,.34],[4.45,1.25,-2.79]],
  [.628,[3.47,1.54,-.10],[4.47,1.12,-3.03]],
  [.791,[3.66,1.55,-.28],[4.47,1.16,-3.03]],
  [.845,[3.23,1.76,1.24],[4.39,1.26,-2.61]],
  [.888,[2.85,1.84,1.03],[2.81,1.38,2.28]],
  [.915,[1.40,1.82,3.45],[1.43,1.38,6.17]],
  [.929,[1.40,1.86,5.24],[.70,1.36,6.55]],
  [.951,[3.55,2.10,8.27],[1.83,1.36,7.75]],
  [1,[13.2,7.25,24.65],[.3,2.05,1.0]],
];

export function sampleFinaleCamera(t, aspect, eye, target) {
  // Let the patient clear the threshold before the camera follows.
  const followDelay = .013 * MathUtils.smoothstep(t, .888, .902) * (1 - MathUtils.smoothstep(t, .930, .969));
  sampleCameraKeys(shots, t - followDelay, eye, target);
  const pullback = MathUtils.smoothstep(t, .941, 1);
  const portrait = MathUtils.smoothstep(1 - aspect, 0, .48);
  const interior = MathUtils.smoothstep(t, .024, .10) * (1 - MathUtils.smoothstep(t, .83, .909));
  const portraitRetreat = MathUtils.smoothstep(t, .957, 1);
  eye.y += portrait * portraitRetreat * 2.3;
  eye.z += portrait * (interior * .42 + portraitRetreat * 8);
  return MathUtils.lerp(53 + 16 * portrait, 43 + 12 * portrait, pullback);
}
