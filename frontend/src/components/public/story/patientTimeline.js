import { MathUtils } from 'three';

export const patientBeats = {
  walk: [0.64, 0.79],
  turn: [0.78, 0.815],
  grip: [0.792, 0.817],
  pull: [0.817, 0.852],
  sit: [0.852, 0.906],
  place: [0.907, 0.951],
  open: [0.959, 0.989],
};

export function beat(progress, name) {
  return MathUtils.smoothstep(progress, ...patientBeats[name]);
}

export const pulledChair = 0.56;

export function entranceProgress(progress) {
  return Math.min(1, progress / 0.77);
}
