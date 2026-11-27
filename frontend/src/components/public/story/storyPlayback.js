// Reduced motion reads the same timeline as a sequence of still shots.
const stills = [0, .106, .171, .216, .259, .347, .48, .609, .638, .726, .79, .839, .898, .951, .993, 1];

export function playbackProgress(progress, reducedMotion) {
  if (!reducedMotion) return progress;
  return stills[Math.min(stills.length - 1, Math.floor(progress * stills.length))];
}

// Match the stethoscope's 7.5% interpolation at 60 Hz on any refresh rate.
export function easeStoryProgress(current, target, elapsedMs) {
  const difference = target - current;
  if (Math.abs(difference) <= .0002) return target;
  return current + difference * (1 - .925 ** (Math.min(elapsedMs, 64) / (1000 / 60)));
}
