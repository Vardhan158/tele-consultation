import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { refineStorySurface } from './storySurfaces';
import ContactShadow from './ContactShadow';
import PatientScene from './PatientScene';
import PrescriptionProps from './PrescriptionProps';
import { finaleFrame, finaleProgress } from './finaleTimeline';

export default function LivingRoom({ controller, finaleController }) {
  const { scene } = useGLTF('/assets/house/living-room.glb', false);
  const { scene: sofa } = useGLTF('/assets/house/lounge-sofa.glb', false);
  const windowFill = useRef(null);
  const warmFill = useRef(null);
  const room = useMemo(() => {
    const root = scene.clone(true);
    root.getObjectByName('LivingRoom_Sage_upholstery').removeFromParent();
    // The original export batches the six cushions together with the rug borders.
    const linen = root.getObjectByName('LivingRoom_Oatmeal_linen');
    linen.updateWorldMatrix(true, false);
    const source = linen.geometry;
    const borderIndices = [];
    const vertex = new Vector3();
    for (let i = 0; i < source.index.count; i += 3) {
      const first = source.index.getX(i);
      vertex.fromBufferAttribute(source.attributes.position, first).applyMatrix4(linen.matrixWorld);
      if (vertex.y < .23) borderIndices.push(first, source.index.getX(i + 1), source.index.getX(i + 2));
    }
    linen.geometry = source.clone();
    linen.geometry.setIndex(borderIndices);
    const replacement = sofa.clone(true);
    replacement.position.set(4.42, .188, -3.26);
    replacement.traverse((part) => {
      if (part.isMesh) part.castShadow = part.receiveShadow = true;
    });
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.receiveShadow = true;
      refineStorySurface(object);
      object.castShadow = ['Oatmeal linen', 'Sage upholstery', 'Oiled walnut'].includes(object.material.name);
    });
    root.add(replacement);
    return root;
  }, [scene, sofa]);
  useFrame(() => {
    const { dusk, sunlight } = finaleFrame(finaleProgress(finaleController.progress));
    if (windowFill.current) windowFill.current.intensity = 38 - 27 * dusk;
    if (warmFill.current) warmFill.current.intensity = 34 - 17 * dusk + 5 * sunlight;
  }, -3);

  return (
    <>
      <primitive object={room} dispose={null} />
      <ContactShadow position={[3.20, .212, -1.34]} size={[2.55, 1.75]} opacity={.29} />
      <ContactShadow position={[4.45, .213, -3.27]} size={[3.25, 1.52]} opacity={.33} />
      <PatientScene controller={controller} finaleController={finaleController} chair={room.getObjectByName('PatientChair')} />
      <PrescriptionProps controller={controller} />
      {/* Broad daylight spill from the existing side windows into the shell. */}
      <pointLight ref={windowFill} position={[6.4, 2.18, 1.6]} color="#e5efff" intensity={38} distance={9} />
      <pointLight ref={warmFill} position={[6.4, 2.25, -2.05]} color="#ffeed5" intensity={34} distance={8} />
    </>
  );
}
