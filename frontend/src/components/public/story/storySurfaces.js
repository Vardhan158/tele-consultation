import { CanvasTexture, RepeatWrapping } from 'three';

// Shared procedural height maps keep the existing GLBs and their color maps intact.
const profiles = [
  [/limestone|plaster|paving|terrazzo/i, 'mineral', .014, .74],
  [/asphalt|mulch/i, 'mineral', .017, .91],
  [/garden lawn/i, 'mineral', .005, .94],
  [/oak|walnut|olive bark/i, 'wood', .011, .49],
  [/linen|upholstery|jute/i, 'textile', .012, .84],
];

const heightMaps = new Map();

function heightMap(kind) {
  if (heightMaps.has(kind)) return heightMaps.get(kind);
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(size, size);
  const period = 2 * Math.PI / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = 4 * (y * size + x);
      const noise = ((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 10) & 63;
      const grain = kind === 'wood'
        ? 30 * Math.sin(13 * x * period + 1.4 * Math.sin(2 * y * period))
        : kind === 'textile'
          ? 27 * Math.sin(24 * x * period) * Math.cos(24 * y * period)
          : 13 * Math.sin((11 * x + 5 * y) * period) * Math.cos((9 * y - 3 * x) * period);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 100 + noise + grain;
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  heightMaps.set(kind, texture);
  return texture;
}

const materialVariants = new WeakMap();

export function refineStorySurface(object) {
  const original = object.material;
  const profile = profiles.find(([name]) => name.test(original?.name));
  if (!profile || !original.isMeshStandardMaterial || !object.geometry.hasAttribute('uv')) return;
  if (!materialVariants.has(original)) {
    const [, kind, relief, roughness] = profile;
    const material = original.clone();
    if (!material.normalMap && !material.bumpMap) {
      material.bumpMap = heightMap(kind);
      material.bumpScale = relief;
    }
    if (!material.roughnessMap) material.roughness = roughness;
    materialVariants.set(original, material);
  }
  object.material = materialVariants.get(original);
}
