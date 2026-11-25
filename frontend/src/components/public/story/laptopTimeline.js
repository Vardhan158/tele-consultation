import { MathUtils } from 'three';

export const patientEnd = .72;
export const screenOn = [.72, .746];
export const screenZoom = [.72, .79];
export const pages = [
  { name: 'landing', start: .72, click: .821 },
  { name: 'doctors', start: .826, click: .862 },
  { name: 'schedule', start: .867, click: .905 },
  { name: 'review', start: .91, click: .952 },
  { name: 'confirmed', start: .957 },
];

export function patientProgress(progress) {
  return MathUtils.clamp(progress / patientEnd, 0, 1);
}

export function screenFrame(progress) {
  let index = 0;
  while (index + 1 < pages.length && progress >= pages[index + 1].start) index++;
  const page = pages[index];
  return {
    index,
    cursor: page.click ? MathUtils.smoothstep(progress, Math.max(page.start, .789), page.click - .005) : 0,
    click: page.click ? 1 - Math.min(1, Math.abs(progress - page.click) / .005) : 0,
    power: MathUtils.smoothstep(progress, ...screenOn),
  };
}
