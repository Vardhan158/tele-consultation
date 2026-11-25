import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

export { finaleStart, endCardStart, previousStory, finaleProgress } from './finaleProgress.js';

const ease = (p, start, end) => MathUtils.smoothstep(p, start, end);
const route = (points) => new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
const toTable = route([[2.35,.19,1.05],[2.44,.19,.30],[2.55,.19,-.25]]);
const toSofa = route([[2.55,.19,-.25],[3.85,.19,.03],[4.86,.19,-.43],[4.90,.19,-1.57],[4.70,.19,-2.61],[4.48,.19,-2.87]]);
const toGarden = route([[4.48,.19,-2.87],[4.83,.19,-2.45],[4.91,.19,-.89],[4.69,.19,.38],[3.15,.19,1.93],[1.43,.19,2.86],[1.40,.18,4.37],[1.40,.18,5.34],[1.53,.14,7.16],[2.01,.11,8.20]]);
export const bagOnTable = [2.97, .949, -.96];
export const cupOnTable = [2.18, .957, -.96];
export const planOnTable = [2.39, .952, -1.19];

export function finaleFrame(t) {
  return {
    place: ease(t,.118,.22),
    read: ease(t,.214,.246) * (1 - ease(t,.296,.333)),
    sip: ease(t,.302,.357) * (1 - ease(t,.391,.435)),
    holdCup: ease(t,.290,.319) * (1 - ease(t,.419,.444)),
    rest: ease(t,.552,.620) * (1 - ease(t,.789,.843)),
    dusk: ease(t,.601,.699) * (1 - ease(t,.719,.798)),
    sunrise: ease(t,.714,.846),
    sunlight: ease(t,.755,.967),
    pullback: ease(t,.93,1),
  };
}

export function sampleFinalePatient(t, state, position, tangent) {
  let track, walk, cycles;
  if (t < .438) {
    track = toTable;
    walk = ease(t,0,.124);
    cycles = 1.25;
  } else if (t < .830) {
    track = toSofa;
    walk = ease(t,.442,.560);
    cycles = 5.55;
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
    position.y -= .22 * state.rest;
    position.z -= .14 * state.rest;
  } else if (track === toGarden) {
    heading *= ease(t,.827,.855);
    position.y -= .22 * state.rest;
    position.z -= .14 * state.rest;
  }
  return { heading, gait: walk * cycles, track, cycles };
}
