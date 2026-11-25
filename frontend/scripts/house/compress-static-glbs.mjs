import { readFile, writeFile } from 'node:fs/promises';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

// This pass only compresses isolated geometry streams in the two uncompressed
// static models. Every decoded byte is verified before replacing the export.
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
for (const name of ['living-room', 'patient-laptop']) {
  const path = new URL(`../../public/assets/house/${name}.glb`, import.meta.url);
  const file = await readFile(path);
  const jsonLength = file.readUInt32LE(12);
  const doc = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
  const extension = 'EXT_meshopt_compression';
  if (doc.extensionsUsed?.includes(extension)) continue;
  const binary = file.subarray(28 + jsonLength);
  if (name === 'patient-laptop') {
    const keyNodes = doc.nodes.filter(({ name }) => /^Key(?:[.]\d+)?$/.test(name));
    const canonical = keyNodes[0]?.mesh;
    const geometry = (mesh) => doc.meshes[mesh].primitives.flatMap(({ attributes, indices }) =>
      [...Object.values(attributes), indices].map((id) => {
        const { byteOffset, byteLength } = doc.bufferViews[doc.accessors[id].bufferView];
        return binary.subarray(byteOffset, byteOffset + byteLength);
      }));
    const canonicalViews = geometry(canonical);
    for (const node of keyNodes) {
      if (!geometry(node.mesh).every((view, index) => view.equals(canonicalViews[index]))) {
        throw new Error('Laptop keys have different geometry');
      }
      node.mesh = canonical;
    }
    const keep = (items, ids) => [...ids].map((id) => items[id]);
    const collect = (ids) => new Set(ids.filter((id) => id !== undefined));
    const usedMeshes = collect(doc.nodes.map(({ mesh }) => mesh));
    doc.meshes = keep(doc.meshes, usedMeshes);
    for (const node of doc.nodes) {
      if (node.mesh !== undefined) node.mesh = [...usedMeshes].indexOf(node.mesh);
    }
    const primitives = doc.meshes.flatMap((mesh) => mesh.primitives);
    const usedAccessors = collect(primitives.flatMap(({ attributes, indices }) => [...Object.values(attributes), indices]));
    doc.accessors = keep(doc.accessors, usedAccessors);
    const accessorIndex = (id) => [...usedAccessors].indexOf(id);
    for (const primitive of primitives) {
      primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, id]) => [name, accessorIndex(id)]));
      if (primitive.indices !== undefined) primitive.indices = accessorIndex(primitive.indices);
    }
    const usedViews = collect(doc.accessors.map(({ bufferView }) => bufferView));
    doc.bufferViews = keep(doc.bufferViews, usedViews);
    for (const accessor of doc.accessors) accessor.bufferView = [...usedViews].indexOf(accessor.bufferView);
  }
  const chunks = [];
  let encodedLength = 0;
  let fallbackLength = 0;
  const append = (data) => {
    const offset = encodedLength;
    const padding = (4 - data.byteLength % 4) % 4;
    chunks.push(data, Buffer.alloc(padding));
    encodedLength += data.byteLength + padding;
    return offset;
  };
  for (const [index, view] of doc.bufferViews.entries()) {
    const raw = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    const accessors = doc.accessors.filter(({ bufferView }) => bufferView === index);
    const count = accessors[0]?.count;
    const stride = view.byteLength / count;
    const mode = view.target === 34963 ? 'INDICES' : 'ATTRIBUTES';
    const supported = accessors.length === 1 && Number.isInteger(stride)
      && (mode === 'INDICES' ? stride === 2 || stride === 4 : stride % 4 === 0 && stride <= 256);
    if (!supported) {
      view.byteOffset = append(raw);
      continue;
    }
    const packed = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode);
    if (packed.byteLength + 32 >= raw.byteLength) {
      view.byteOffset = append(raw);
      continue;
    }
    const check = Buffer.alloc(raw.length);
    MeshoptDecoder.decodeGltfBuffer(check, count, stride, packed, mode, 'NONE');
    if (!check.equals(raw)) throw new Error(`Lossless check failed for ${name} view ${index}`);
    view.extensions = { [extension]: {
      buffer: 0, byteOffset: append(packed), byteLength: packed.byteLength, count, byteStride: stride, mode,
    } };
    view.buffer = 1;
    view.byteOffset = fallbackLength;
    fallbackLength += Math.ceil(raw.length / 4) * 4;
  }
  if (!fallbackLength) continue;
  doc.extensionsUsed = [...(doc.extensionsUsed ?? []), extension];
  doc.extensionsRequired = [...(doc.extensionsRequired ?? []), extension];
  doc.buffers = [{ byteLength: encodedLength }, { byteLength: fallbackLength, extensions: { [extension]: { fallback: true } } }];
  const text = Buffer.from(JSON.stringify(doc));
  const json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + encodedLength, 8);
  header.writeUInt32LE(json.length, 12);
  header.write('JSON', 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(encodedLength);
  binHeader.write('BIN', 4);
  const output = Buffer.concat([header, json, binHeader, ...chunks]);
  if (output.length >= file.length) continue;
  await writeFile(path, output);
  console.log(`${name}: ${file.length} -> ${output.length} bytes`);
}
