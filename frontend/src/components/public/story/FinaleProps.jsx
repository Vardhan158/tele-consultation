import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { cupOnTable, finaleStart, planOnTable } from './finaleTimeline';

export default function FinaleProps({ controller }) {
  const { scene } = useGLTF('/assets/house/care-finale.glb', false);
  const container = useRef(null);
  const mug = useRef(null);
  const props = useMemo(() => {
    const model = scene.clone(true);
    return {
      cup: model.getObjectByName('CareWaterCup'),
      plan: model.getObjectByName('CarePlanCard'),
    };
  }, [scene]);
  useFrame(() => {
    if (!container.current || !mug.current) return;
    container.current.visible = controller.progress >= finaleStart;
    mug.current.position.set(...cupOnTable);
    mug.current.rotation.set(0, 0, 0);
  }, -1);
  return <group ref={container} visible={false}>
    <group ref={mug} name="FinaleCup">
      <primitive object={props.cup} position={[0, 0, 0]} dispose={null} />
    </group>
    <group position={planOnTable} rotation-y={.12}>
      <primitive object={props.plan} position={[0, 0, 0]} dispose={null} />
    </group>
  </group>;
}
