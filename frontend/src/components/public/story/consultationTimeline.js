import { MathUtils } from 'three';

export const bookingEnd = .80;
export const joinStart = .81;
export const joinClick = .846;
export const connectingStart = .852;
export const callStart = .872;

export function bookingProgress(progress) {
  return MathUtils.clamp(progress / bookingEnd, 0, 1);
}

export function sampleCall(progress) {
  const dialogue = MathUtils.clamp((progress - callStart) / (1 - callStart), 0, 1);
  return {
    phase: progress >= callStart ? 'active' : progress >= connectingStart ? 'connecting' : 'booking',
    join: MathUtils.smoothstep(progress, joinStart, joinClick),
    frame: Math.min(35, Math.floor(dialogue * 36)),
    nod: Math.sin(dialogue * Math.PI * 8) * MathUtils.smoothstep(dialogue, 0, .15) * (1 - MathUtils.smoothstep(dialogue, .84, 1)),
    gesture: Math.sin(Math.PI * MathUtils.clamp((dialogue - .44) / .38, 0, 1)),
  };
}
