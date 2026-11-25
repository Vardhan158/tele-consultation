import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

export { finaleStart, endCardStart, previousStory, finaleProgress } from './finaleProgress.js';

const ease = (p, start, end) => MathUtils.smoothstep(p, start, end);
const route = (points) => new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
const tableStance = new Vector3(2.55,.19,-.25);
const toSofa = route([[2.55,.19,-.25],[3.85,.19,.03],[4.86,.19,-.43],[4.90,.19,-1.57],[4.70,.19,-2.61],[4.44,.19,-2.56]]);
const toGarden = route([[4.44,.19,-2.56],[4.83,.19,-2.45],[4.91,.19,-.89],[4.69,.19,.38],[3.15,.19,1.93],[1.43,.19,2.86],[1.40,.18,4.37],[1.40,.18,5.34],[1.53,.14,7.16],[2.01,.11,8.20]]);
export const bagOnTable = [2.97, .949, -.96];
export const cupOnTable = [2.79, .949, -.84];
export const planOnTable = [2.39, .952, -1.19];

export function finaleFrame(t) {
  return {
    place: ease(t,.118,.22),
    read: ease(t,.214,.246) * (1 - ease(t,.296,.333)),
    sip: ease(t,.302,.357) * (1 - ease(t,.391,.435)),
    drinkTilt: ease(t,.356,.374) * (1 - ease(t,.382,.392)),
    holdCup: ease(t,.278,.302) * (1 - ease(t,.435,.447)),
    rest: ease(t,.568,.620) * (1 - ease(t,.789,.843)),
    dusk: ease(t,.601,.699) * (1 - ease(t,.719,.798)),
    sunrise: ease(t,.714,.846),
    sunlight: ease(t,.755,.967),
    pullback: ease(t,.93,1),
  };
}

export function sampleFinalePatient(t, state, position, tangent) {
  let track, walk, cycles;
  if (t < .438) {
    position.copy(tableStance);
    return { heading: Math.PI * ease(t,.105,.202), gait: 0, track: null, cycles: 0 };
  } else if (t < .830) {
    track = toSofa;
    walk = ease(t,.442,.560);
    cycles = 6;
  } else {
    track = toGarden;
    walk = ease(t,.845,.963);
    cycles = 13;
  }
  track.getPointAt(walk, position);
  track.getTangentAt(walk, tangent);
  let heading = Math.atan2(tangent.x, tangent.z);
  if (track === toSofa) {
    const faceForward = ease(t,.531,.565);
    heading += Math.atan2(Math.sin(-heading), Math.cos(heading)) * faceForward;
  } else if (track === toGarden) {
    heading *= ease(t,.827,.855);
  }
  return { heading, gait: walk * cycles, track, cycles };
}
