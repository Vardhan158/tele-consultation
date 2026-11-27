import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { refineStorySurface } from './storySurfaces';
import { carLaneZ, sampleTravel, travelProgress } from './travelTimeline';
import { pharmacyFrame, pharmacyProgress, pharmacyStart, previousJourney } from './pharmacyTimeline';

const contactVertex = `
  varying vec2 stamp;
  void main() {
    stamp = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const contactFragment = `
  varying vec2 stamp;
  void main() {
    float falloff = 1.0 - smoothstep(0.30, 1.0, dot(stamp, stamp));
    gl_FragColor = vec4(.045, .066, .064, .52 * falloff);
  }
`;

export default function PharmacyTravel({ controller }) {
  const { scene } = useGLTF('/assets/house/pharmacy-travel.glb', false);
  const assets = useMemo(() => {
    const copy = scene.clone(true);
    const car = copy.getObjectByName('TravelCar');
    const street = copy.getObjectByName('PharmacyStreet');
    // In the original export these material batches contain the solid shell,
    // fixed glass, mullions and handles. The new shell preserves their facade.
    for (const name of ['Canopy', 'Glazed frontage', 'Facade mullion', 'Entry door pull']) {
      // GLTFLoader sanitizes spaces in node names.
      const node = street.getObjectByName(name.replaceAll(' ', '_'));
      node?.removeFromParent();
    }
    const paint = new Map();
    car.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material.name.startsWith('Deep teal automotive lacquer')) return;
      if (!paint.has(mesh.material)) {
        const finish = mesh.material.clone();
        finish.roughness = .24;
        finish.envMapIntensity = 1.25;
        paint.set(mesh.material, finish);
      }
      mesh.material = paint.get(mesh.material);
    });
    street.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      refineStorySurface(mesh);
    });
    return {
      car,
      street,
      door: car.getObjectByName('TravelDoor'),
      wheels: ['00', '01', '10', '11'].map((id) => car.getObjectByName(`TravelWheel${id}`)),
    };
  }, [scene]);
  const moving = useRef(null);
  /* eslint-disable react-hooks/immutability -- Animated Three.js transforms are mutable. */
  useFrame(() => {
    if (!moving.current) return;
    const frame = sampleTravel(travelProgress(previousJourney(controller.progress)));
    if (controller.progress > pharmacyStart) {
      const next = pharmacyFrame(pharmacyProgress(controller.progress));
      frame.carX = next.carX;
      frame.carZ = next.carZ;
      frame.heading = next.heading;
      frame.door = next.carDoor;
      frame.wheel += next.wheelOffset;
    }
    moving.current.position.set(frame.carX, .012, frame.carZ);
    moving.current.rotation.y = frame.heading;
    assets.door.rotation.y = -frame.door;
    for (const wheel of assets.wheels) wheel.rotation.z = frame.wheel;
  });
  /* eslint-enable react-hooks/immutability */
  return <>
    <group position={[0, -.026, 14]}>
      <primitive object={assets.street} position={[0, 0, 0]} dispose={null} />
    </group>
    <group position={[32, .014, 12.94]}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[5.35, .065]} />
        <meshBasicMaterial color="#e6e8da" />
      </mesh>
      {[-2.675, 2.675].map((x) => <mesh key={x} position={[x, 0, -.84]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.065, 1.68]} />
        <meshBasicMaterial color="#e6e8da" />
      </mesh>)}
    </group>
    <group ref={moving} position={[-5, .012, carLaneZ]}>
      <mesh rotation-x={-Math.PI / 2} position-y={.008}>
        <planeGeometry args={[4.9, 2.45]} />
        <shaderMaterial vertexShader={contactVertex} fragmentShader={contactFragment} transparent depthWrite={false} />
      </mesh>
      <primitive object={assets.car} position={[0, 0, 0]} dispose={null} />
    </group>
  </>;
}
