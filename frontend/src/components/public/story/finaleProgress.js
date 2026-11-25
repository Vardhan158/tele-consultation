export const finaleStart = .84;
export const endCardStart = .995;
const clamp = (p) => Math.max(0, Math.min(1, p));
export const previousStory = (p) => clamp(p / finaleStart);
export const finaleProgress = (p) => clamp((p - finaleStart) / (1 - finaleStart));
