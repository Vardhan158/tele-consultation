// Reduced motion reads the same timeline as a sequence of still shots.
const stills = [0, .106, .171, .216, .259, .347, .48, .609, .638, .726, .79, .839, .898, .951, .993, 1];

export function playbackProgress(progress, reducedMotion) {
  if (!reducedMotion) return progress;
  return stills[Math.min(stills.length - 1, Math.floor(progress * stills.length))];
}
