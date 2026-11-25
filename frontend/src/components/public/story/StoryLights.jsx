import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MathUtils } from 'three';
import { finaleFrame, finaleProgress } from './finaleTimeline';

const day = new Color('#fff2dc');
const evening = new Color('#a8bbef');
const gold = new Color('#ffdbac');
const sky = new Color('#e3efff');
const skyWarm = new Color('#fff0d0');

export default function StoryLights({ controller }) {
  const sun = useRef(null);
  const fill = useRef(null);
  useFrame(({ scene }) => {
    if (!sun.current || !fill.current) return;
    const frame = finaleFrame(finaleProgress(controller.progress));
    sun.current.color.copy(day).lerp(evening, frame.dusk).lerp(gold, frame.sunlight);
    sun.current.intensity = 2.38 - 2.09 * frame.dusk + .48 * frame.sunlight;
    fill.current.color.copy(sky).lerp(skyWarm, frame.sunlight);
    fill.current.intensity = MathUtils.lerp(.46, .17, frame.dusk);
    scene.environmentIntensity = MathUtils.lerp(.56, .17, frame.dusk);
  }, -3);
  return <>
    <hemisphereLight ref={fill} args={['#e3efff', '#7c8062', 0.5]} />
    <directionalLight
      ref={sun} position={[-12, 18, 12]} intensity={2.6} color="#fff2dc" castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-23}
      shadow-camera-right={23} shadow-camera-top={19} shadow-camera-bottom={-19}
      shadow-camera-near={1} shadow-camera-far={65}
      shadow-normalBias={0.022} shadow-bias={-0.00016} shadow-radius={3.8}
    />
  </>;
}
