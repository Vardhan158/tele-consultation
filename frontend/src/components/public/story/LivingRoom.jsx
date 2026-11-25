import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { refineStorySurface } from './storySurfaces';
import ContactShadow from './ContactShadow';
import PatientScene from './PatientScene';
import PrescriptionProps from './PrescriptionProps';
import { finaleFrame, finaleProgress } from './finaleTimeline';

export default function LivingRoom({ controller, finaleController }) {
  const { scene } = useGLTF('/assets/house/living-room.glb', false);
  const windowFill = useRef(null);
  const warmFill = useRef(null);
  const room = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.receiveShadow = true;
      refineStorySurface(object);
      object.castShadow = ['Oatmeal linen', 'Sage upholstery', 'Oiled walnut'].includes(object.material.name);
    });
    return root;
  }, [scene]);
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
