import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { printerPosition, prescriptionFrame } from './prescriptionTimeline';
import { preTravelProgress, sampleTravel, travelProgress } from './travelTimeline';
import { pharmacyStart, previousJourney } from './pharmacyTimeline';

export default function PrescriptionProps({ controller }) {
  const { scene: printer } = useGLTF('/assets/house/demo-printer.glb', false);
  const { scene: paper } = useGLTF('/assets/house/demo-prescription-paper.glb', false);
  const sheet = useRef();
  useFrame(() => {
    if (!sheet.current) return;
    const journey = previousJourney(controller.progress);
    const progress = preTravelProgress(journey);
    const frame = prescriptionFrame(progress);
    sheet.current.visible = controller.progress <= pharmacyStart && progress >= .913 && sampleTravel(travelProgress(journey)).enter < .97;
    sheet.current.position.set(frame.paperX, frame.paperY, frame.paperZ);
    sheet.current.rotation.set(0, Math.PI / 2, frame.pickup * .38);
  }, -2);
  return <>
    <group position={printerPosition} rotation-y={Math.PI / 2}>
      <primitive object={printer} dispose={null} />
    </group>
    <group ref={sheet} name="TravelPrescription" visible={false}>
      <primitive object={paper} dispose={null} />
    </group>
  </>;
}
