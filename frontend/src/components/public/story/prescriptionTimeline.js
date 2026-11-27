import { MathUtils } from 'three';

export const consultationEnd = .79;
export const printerPosition = [2.97, .949, -.98];

export function earlierProgress(progress) {
  return MathUtils.clamp(progress / consultationEnd, 0, 1);
}

export function prescriptionFrame(progress) {
  const feed = MathUtils.smoothstep(progress, .913, .949);
  const pickup = MathUtils.smoothstep(progress, .970, .983);
  const retract = MathUtils.smoothstep(progress, .978, .998);
  return {
    phase: progress < consultationEnd ? null : progress < .812 ? 'ended'
      : progress < .875 ? 'prescription' : progress < .909 ? 'downloaded'
      : progress < .949 ? 'printing' : 'printed',
    cursor: MathUtils.smoothstep(progress, .825, .869),
    printCursor: MathUtils.smoothstep(progress, .878, .903),
    feed,
    reach: MathUtils.smoothstep(progress, .943, .968),
    pickup,
    paperX: printerPosition[0] + MathUtils.lerp(.042, .265, feed) + .30 * retract,
    paperY: printerPosition[1] + MathUtils.lerp(.085, .066, feed) + .13 * pickup + .07 * retract,
    paperZ: printerPosition[2] - .13 * retract,
  };
}
