import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { MathUtils, Quaternion, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { refineStorySurface } from './storySurfaces';
import { aim, reach } from './PatientScene';
import { bagCounter, counterPaper, pharmacyFrame, pharmacyProgress, pharmacyStart } from './pharmacyTimeline';

export default function PharmacyInterior({ controller }) {
  const { scene } = useGLTF('/assets/house/pharmacy-interior.glb', false);
  const { scene: person } = useGLTF('/assets/house/pharmacist.glb', false);
  const display = useRef(null);
  const sceneProps = useMemo(() => {
    const building = scene.clone(true);
    const interior = building.getObjectByName('PharmacyInterior');
    interior.traverse((object) => {
      if (!object.isMesh) return;
      object.receiveShadow = true;
      refineStorySurface(object);
    });
    const bag = building.getObjectByName('SealedMedicineBag');
    const doors = ['PharmacySliderLeft', 'PharmacySliderRight'].map((name) => interior.getObjectByName(name));
    const pharmacist = clone(person);
    pharmacist.traverse((mesh) => {
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
    const bone = (name) => pharmacist.getObjectByName(name);
    const left = ['LeftArm', 'LeftForeArm', 'LeftHand'].map(bone);
    const right = ['RightArm', 'RightForeArm', 'RightHand'].map(bone);
    const head = bone('Head'), crown = bone('head_end'), face = bone('headfront');
    const spine = bone('Spine');
    const rest = [...left, ...right, head, spine].map((part) => [part, new Quaternion().copy(part.quaternion)]);
    return { interior, bag, doors, pharmacist, left, right, head, crown, face, spine, rest, target: new Vector3(), pole: new Vector3(0, -1, .1) };
  }, [scene, person]);
  /* eslint-disable react-hooks/immutability -- Updating mutable Three.js scene objects in a frame. */
  useFrame(() => {
    const progress = pharmacyProgress(controller.progress);
    const state = pharmacyFrame(progress);
    sceneProps.doors[0].position.setX(-.51 - 1.06 * state.shopDoor);
    sceneProps.doors[1].position.setX(.51 + 1.06 * state.shopDoor);
    if (display.current) {
      display.current.visible = controller.progress > pharmacyStart && !state.carryBag;
      display.current.position.set(...bagCounter);
      display.current.position.z -= .46 * (1 - state.handoff);
      display.current.rotation.set(0, 0, 0);
    }
    for (const [bone, rotation] of sceneProps.rest) bone.quaternion.copy(rotation);
    if (controller.progress <= pharmacyStart) return;
    sceneProps.spine.rotateX(.075 * state.verify);
    sceneProps.pharmacist.updateWorldMatrix(true, true);
    const { target, pole } = sceneProps;
    target.set(counterPaper[0] - .06, 1.18 + .10 * state.verify, 3.67 + .30 * state.verify);
    reach(sceneProps.right, target, pole, .70 + .30 * state.verify);
    const greet = MathUtils.smoothstep(progress, .171, .224) * (1 - MathUtils.smoothstep(progress, .44, .484));
    const offerBag = MathUtils.smoothstep(progress, .376, .409) * (1 - MathUtils.smoothstep(progress, .431, .475));
    target.set(bagCounter[0] + .045, bagCounter[1] + .205, bagCounter[2] - .46 * (1 - state.handoff));
    reach(sceneProps.left, target, pole, .65 + .35 * offerBag);
    target.set(31.82, 1.58, 4.75);
    aim(sceneProps.head, sceneProps.face, target, .54 * greet * (1 - state.verify));
    sceneProps.crown.getWorldPosition(target);
    target.z += .05 * state.verify;
    aim(sceneProps.head, sceneProps.crown, target, state.verify);
    sceneProps.head.rotateZ(-.09 * state.verify + .06 * state.handoff);
    sceneProps.left[2].rotateX(-.16 * state.handoff);
  }, -1);
  /* eslint-enable react-hooks/immutability */
  return <>
    <group position={[32, .052, 8.17]}>
      <primitive object={sceneProps.interior} dispose={null} />
    </group>
    <group ref={display} name="SealedBagStory" visible={false}>
      <primitive object={sceneProps.bag} position={[0, 0, 0]} dispose={null} />
    </group>
    <group position={[32.10, .055, 3.25]}>
      <primitive object={sceneProps.pharmacist} dispose={null} />
    </group>
    <pointLight position={[32, 2.72, 6.75]} color="#ffefda" intensity={18} distance={7} />
    <pointLight position={[30.3, 2.66, 4.65]} color="#f4fffa" intensity={25} distance={6} />
    <pointLight position={[34.4, 2.71, 3.43]} color="#e1f7ff" intensity={26} distance={6} />
  </>;
}
