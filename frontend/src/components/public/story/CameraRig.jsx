import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createCameraScratch, sampleJourneyCamera } from './cameraJourney';

export default function CameraRig({ controller }) {
  const invalidate = useThree((state) => state.invalidate);
  const lookAt = useMemo(() => new Vector3(), []);
  const scratch = useMemo(() => createCameraScratch(), []);
  useEffect(() => controller.subscribe(invalidate), [controller, invalidate]);

  useFrame(({ camera, size }) => {
    if (size.width <= 0 || size.height <= 0) return;
    const fov = sampleJourneyCamera(controller.progress, size.width / size.height, camera.position, lookAt, scratch);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(lookAt);
  });
  return null;
}
