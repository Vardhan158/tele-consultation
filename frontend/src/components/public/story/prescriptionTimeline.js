import { MathUtils } from 'three';

export const consultationEnd = .79;
export const printerPosition = [2.76, .949, -.98];

export function earlierProgress(progress) {
  return MathUtils.clamp(progress / consultationEnd, 0, 1);
}

export function prescriptionFrame(progress) {
  const feed = MathUtils.smoothstep(progress, .913, .949);
  const pickup = MathUtils.smoothstep(progress, .969, .998);
  return {
    phase: progress < consultationEnd ? null : progress < .812 ? 'ended'
      : progress < .875 ? 'prescription' : progress < .909 ? 'downloaded'
      : progress < .949 ? 'printing' : 'printed',
    cursor: MathUtils.smoothstep(progress, .825, .869),
    printCursor: MathUtils.smoothstep(progress, .878, .903),
    feed,
    reach: MathUtils.smoothstep(progress, .943, .968),
    pickup,
    paperX: printerPosition[0] + MathUtils.lerp(.042, .265, feed) + .54 * pickup,
    paperY: printerPosition[1] + MathUtils.lerp(.085, .066, feed) + .22 * pickup,
    paperZ: printerPosition[2] - .20 * pickup,
  };
}
