import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { refineStorySurface } from './storySurfaces';
import { MathUtils } from 'three';
import { finaleProgress } from './finaleProgress';
import { sampleDoor } from './cameraPath';
import { entranceProgress } from './patientTimeline';
import { patientProgress } from './laptopTimeline';
import { bookingProgress } from './consultationTimeline';
import { earlierProgress } from './prescriptionTimeline';
import { preTravelProgress } from './travelTimeline';
import { homeEntry, pharmacyStart, pharmacyProgress, previousJourney } from './pharmacyTimeline';

export const HOUSE_MODEL_URL = '/assets/house/modern-house.glb';

// The exported hinge owns the leaf and its hardware. Keep it separate from the
// static shell so a later scene can open it without moving walls or glazing.
export default function HouseScene({ controller, finaleController }) {
  const { scene } = useGLTF(HOUSE_MODEL_URL, false);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const hingeRef = useRef(null);
  const house = useMemo(() => {
    const root = scene.clone(true);
    const omitted = [];
    root.traverse((object) => {
      if (object.isLight || object.isCamera) omitted.push(object);
      if (object.isMesh) {
        object.castShadow = !object.name.startsWith('ENV_');
        object.receiveShadow = true;
        refineStorySurface(object);
      }
    });
    omitted.forEach((object) => object.removeFromParent());
    return root;
  }, [scene]);

  // The renderer is a mutable Three.js object, outside React state.
  // eslint-disable-next-line react-hooks/immutability
  useLayoutEffect(() => {
    hingeRef.current = house.getObjectByName('EntranceDoor_Hinge');
    // Three.js owns this mutable renderer; it is not immutable React state.
    // eslint-disable-next-line react-hooks/immutability
    gl.shadowMap.needsUpdate = true;
    gl.domElement.dataset.houseReady = 'true';
    invalidate();
    return () => { delete gl.domElement.dataset.houseReady; };
  }, [house, invalidate, gl]);

  useFrame(({ gl: renderer }) => {
    const hinge = hingeRef.current;
    let angle = sampleDoor(entranceProgress(patientProgress(bookingProgress(earlierProgress(preTravelProgress(previousJourney(controller.progress)))))));
    if (controller.progress > pharmacyStart) {
      const t = pharmacyProgress(controller.progress);
      const garden = finaleProgress(finaleController.progress);
      angle = angle * (1 - MathUtils.smoothstep(t, 0, .05)) +
        1.43 * (homeEntry(t).open + MathUtils.smoothstep(garden,.845,.88));
    }
    if (hinge && hinge.rotation.y !== angle) {
      hinge.rotation.y = angle;
      renderer.shadowMap.needsUpdate = true;
    }
  }, -1);

  // useGLTF owns cached geometries/materials; route unmounts must not dispose
  // resources needed on return. Only the lightweight scene graph is cloned.
  return <primitive object={house} dispose={null} />;
}
