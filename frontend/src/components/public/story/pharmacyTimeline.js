import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

export const pharmacyStart = .76;
export const previousJourney = (progress) => MathUtils.clamp(progress / pharmacyStart, 0, 1);
export const pharmacyProgress = (progress) => MathUtils.clamp((progress - pharmacyStart) / (1 - pharmacyStart), 0, 1);
const ease = (t, start, end) => MathUtils.smoothstep(t, start, end);
const curve = (points) => new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
const intoShop = curve([[31.52,.04,10.35],[31.9,.065,9.2],[32,.065,8.44],[32,.065,7.65],[32,.065,5.28],[31.83,.065,4.78]]);
const toCar = curve([[31.83,.065,4.78],[32,.065,6.04],[32,.065,7.86],[32,.065,8.62],[31.6,.065,9.7],[31.52,.04,10.35]]);
const home = curve([[-4.45,.02,13.87],[-3.02,.03,13.76],[-2.63,.03,12],[-2.05,.035,10.4],
  [.78,.07,9.6],[1.4,.14,7.56],[1.4,.18,5.05],[1.4,.19,3.58],[1.4,.19,2.3],[2.35,.19,1.05]]);
export const counterPaper = [31.85, 1.143, 4.27];
export const bagCounter = [31.99, 1.144, 4.08];

export function pharmacyFrame(t) {
  const drive = ease(t, .685, .858);
  const turn = ease(t, .657, .694);
  const homeExit = ease(t, .864, .891);
  const forwardDrive = 37 * drive;
  return {
    carX: 32 - forwardDrive,
    carZ: 12.02 + 2.20 * Math.sin(Math.PI * .5 * turn) - .70 * ease(t, .824, .858),
    heading: Math.PI * turn,
    wheelOffset: -(forwardDrive + 2.2 * turn) / .34,
    carDoor: 1.04 * (
      ease(t, .006, .025) - ease(t, .046, .062) +
      ease(t, .591, .614) - ease(t, .638, .655) +
      ease(t, .859, .876) - ease(t, .891, .907)
    ),
    shopDoor: Math.max(ease(t,.067,.095) - ease(t,.181,.210), ease(t,.478,.509) - ease(t,.587,.610)),
    exit: ease(t, .024, .051),
    board: ease(t, .613, .641),
    homeExit,
    offer: ease(t, .234, .268),
    verify: ease(t,.286,.318) * (1 - ease(t,.377,.405)),
    handoff: ease(t,.389,.426),
    carryBag: t >= .427,
  };
}

export function samplePharmacyPatient(t, state, position, tangent) {
  let gait = 0;
  let track, cycles;
  let heading = Math.PI;
  if (t < .055) {
    position.set(31.49, MathUtils.lerp(-.36,.04,state.exit), MathUtils.lerp(12.02,10.35,state.exit));
  } else if (t < .455) {
    const move = ease(t,.055,.221);
    track = intoShop;
    track.getPointAt(move, position);
    intoShop.getTangentAt(move, tangent);
    heading = MathUtils.lerp(Math.PI, Math.atan2(tangent.x,tangent.z), ease(t,.055,.079));
    cycles = 5.9;
    gait = move * cycles;
  } else if (t < .611) {
    const move = ease(t,.466,.596);
    track = toCar;
    track.getPointAt(move, position);
    const turn = ease(t,.455,.473);
    intoShop.getTangentAt(1, tangent);
    const incoming = Math.atan2(tangent.x, tangent.z);
    toCar.getTangentAt(move, tangent);
    const angle = Math.atan2(tangent.x, tangent.z) - incoming;
    heading = incoming + Math.atan2(Math.sin(angle), Math.cos(angle)) * turn;
    cycles = 5.9;
    gait = move * cycles;
  } else if (t < .855) {
    position.set(31.52,MathUtils.lerp(.04,-.36,state.board),MathUtils.lerp(10.35,12.02,state.board));
    heading = 0;
  } else if (t < .898) {
    position.set(-4.45,MathUtils.lerp(-.36,.02,state.homeExit),MathUtils.lerp(13.52,14.76,state.homeExit));
    heading = 0;
  } else {
    const move = ease(t,.905,.998);
    track = home;
    track.getPointAt(move, position);
    position.z += .89 * (1 - ease(move, 0, .12));
    home.getTangentAt(move, tangent);
    heading = Math.atan2(tangent.x,tangent.z) * ease(t,.898,.925);
    cycles = 14;
    gait = move * cycles;
  }
  return { gait, heading, track, cycles, visible: t < .639 || t >= .866 };
}
