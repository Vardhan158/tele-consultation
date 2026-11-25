import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, InstancedMesh, LineCurve3, MathUtils, Quaternion, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { beat, pulledChair } from './patientTimeline';
import { patientProgress } from './laptopTimeline';
import { bookingProgress, sampleCall } from './consultationTimeline';
import { earlierProgress, prescriptionFrame } from './prescriptionTimeline';
import { carLaneZ, departureTrack, preTravelProgress, sampleTravel, travelProgress, travelStart, walkPose } from './travelTimeline';
import { bagCounter, counterPaper, pharmacyFrame, pharmacyProgress, pharmacyStart, previousJourney, samplePharmacyPatient } from './pharmacyTimeline';
import { bagOnTable, cupOnTable, finaleFrame, finaleProgress, finaleStart, sampleFinalePatient } from './finaleTimeline';
import { stanceAt, transferAt } from './characterMotion';
import calibration from './rigCalibration.json';
import ContactShadow from './ContactShadow';
import LaptopDisplay from './LaptopDisplay';

const approach = new Vector3(4.86, .19, 1.92);
const stoppingPoint = new Vector3(4.86, .19, -.80);
const seat = new Vector3(4.49, -.07, -1.29);
const approachTrack = new LineCurve3(approach, stoppingPoint);
const tabletop = new Vector3(3.22, .952, -1.34);
const up = new Vector3(0, 1, 0);
function instanceLaptopKeys(model) {
  const keys = model.children.filter((mesh) => mesh.isMesh && /^Key(?:[._]?\d+)?$/.test(mesh.name));
  if (keys.length < 2) return;
  const [first] = keys;
  const instances = new InstancedMesh(first.geometry, first.material, keys.length);
  instances.name = 'Laptop keys';
  keys.forEach((key, index) => {
    key.updateMatrix();
    instances.setMatrixAt(index, key.matrix);
    key.removeFromParent();
  });
  instances.computeBoundingSphere();
  model.add(instances);
  return instances;
}

function updatePatientShadow(gl, rig, actor, progress) {
  const outdoors = actor.visible && actor.position.z > 4.15 && actor.position.x < 12 && actor.position.z < 14;
  const frame = outdoors ? Math.round(progress * 5000) : -1;
  if (frame === rig.shadowFrame) return;
  if (outdoors !== (rig.shadowFrame >= 0)) {
    rig.model.traverse((object) => {
      if (object.isMesh) object.castShadow = outdoors;
    });
  }
  rig.shadowFrame = frame;
  gl.shadowMap.needsUpdate = true;
}

const carHandle = (world) => world.getObjectByName('TravelDoor')?.getObjectByName('Handle');

// Aim each joint in world space while preserving the rig's local bone axes.
const from = new Vector3(), to = new Vector3(), origin = new Vector3();
const worldRotation = new Quaternion(), parentRotation = new Quaternion();
const delta = new Quaternion();
export function aim(bone, child, point, weight) {
  bone.getWorldPosition(origin);
  child.getWorldPosition(from).sub(origin).normalize();
  to.copy(point).sub(origin).normalize();
  delta.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(worldRotation).premultiply(delta);
  bone.parent.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.slerp(parentRotation.multiply(worldRotation), weight);
  bone.updateWorldMatrix(false, true);
}

const a = new Vector3(), b = new Vector3(), c = new Vector3();
const direction = new Vector3(), bend = new Vector3(), elbow = new Vector3(), end = new Vector3();
export function reach(chain, target, pole, weight) {
  if (weight <= 0) return;
  const [upper, lower, tip] = chain;
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  tip.getWorldPosition(c);
  const first = a.distanceTo(b), second = b.distanceTo(c);
  direction.copy(target).sub(a);
  const distance = MathUtils.clamp(direction.length(), Math.abs(first - second) + .002, first + second - .002);
  if (direction.lengthSq() < 1e-8) return;
  direction.normalize();
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-6) {
    // At a straight reach, retain the current elbow or knee plane.
    bend.copy(b).sub(a);
    bend.addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() < 1e-6) return;
  }
  bend.normalize();
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  elbow.copy(a).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, first * first - along * along)));
  end.copy(a).addScaledVector(direction, distance);
  aim(upper, lower, elbow, weight);
  aim(lower, tip, end, weight);
}

function sampleRig(rig, phase) {
  for (const [bone, sampled] of rig.rotations) bone.quaternion.copy(sampled);
  rig.hips.position.copy(rig.hipSample);
  rig.action.time = (phase % 1) * rig.clip.duration;
  rig.mixer.update(0);
  for (const [bone, sampled] of rig.rotations) sampled.copy(bone.quaternion);
  rig.hipSample.copy(rig.hips.position);
  rig.hips.position.x = rig.rest.x;
  rig.hips.position.z = rig.rest.z;
}

function plantFeet(actor, rig, scratch, weight) {
  if (weight <= 0) return;
  const heading = actor.rotation.y;
  scratch.pole.set(Math.sin(heading), 0, Math.cos(heading));
  for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
    const side = index ? -1 : 1;
    scratch.foot.set(side * .105, calibration.feet[index].ankle[1] - .032, side * .045).applyAxisAngle(up, heading).add(actor.position);
    reach(leg, scratch.foot, scratch.pole, weight);
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.fromArray(calibration.feet[index].toe).applyAxisAngle(up, heading));
    aim(leg[2], rig.toes[index], scratch.hand, weight);
  }
}

function lockWalkingFeet(rig, scratch, track, phase, cycles, strength) {
  if (!track || strength <= 0) return;
  for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
    const profile = calibration.feet[index];
    const { anchor, weight } = stanceAt(phase, profile);
    if (weight <= 0) continue;
    const at = MathUtils.clamp(anchor / cycles, 0, 1);
    track.getPointAt(at, scratch.support);
    track.getTangentAt(at, scratch.supportTangent);
    const heading = Math.atan2(scratch.supportTangent.x, scratch.supportTangent.z);
    scratch.pole.set(Math.sin(heading), 0, Math.cos(heading));
    scratch.foot.set(...profile.ankle, 0).applyAxisAngle(up, heading).add(scratch.support);
    reach(leg, scratch.foot, scratch.pole, strength * weight);
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.fromArray(profile.toe).applyAxisAngle(up, heading));
    aim(leg[2], rig.toes[index], scratch.hand, strength * weight);
  }
}

function cabinTransfer(actor, rig, scratch, amount, side) {
  if (amount <= 0) return;
  const { tuck, inside, lean } = transferAt(amount);
  rig.chest.getWorldPosition(scratch.hand);
  scratch.hand.add(scratch.foot.set(.10 * side, -.14, .23).applyAxisAngle(up, actor.rotation.y));
  aim(rig.spine, rig.chest, scratch.hand, .84 * lean);
  rig.crown.getWorldPosition(scratch.hand);
  scratch.hand.add(scratch.foot.set(0, -.03, .17).applyAxisAngle(up, actor.rotation.y));
  aim(rig.head, rig.crown, scratch.hand, .72 * lean);
  for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
    const fold = index === 0 ? tuck : inside;
    scratch.pole.set(0, .18, 1).applyAxisAngle(up, actor.rotation.y);
    scratch.foot.set(index ? -.14 : .13, .13 + .28 * fold, .20 + .15 * fold)
      .applyAxisAngle(up, actor.rotation.y).add(actor.position);
    reach(leg, scratch.foot, scratch.pole, fold);
  }
}

function pharmacyPose(t, actor, rig, scratch, scene) {
  const state = pharmacyFrame(t);
  const motion = samplePharmacyPatient(t, state, actor.position, scratch.tangent);
  actor.rotation.y = motion.heading;
  actor.visible = motion.visible;
  const paper = scene.getObjectByName('TravelPrescription');
  const bag = scene.getObjectByName('SealedBagStory');
  if (paper) paper.visible = (motion.visible && t < .268) || (t >= .268 && t < .402);
  if (bag && state.carryBag) bag.visible = motion.visible;
  if (!motion.visible) return;
  sampleRig(rig, motion.gait);
  actor.updateWorldMatrix(true, true);
  const transfer = t < .055 ? 1 - state.exit : t < .855 ? state.board : 1 - state.homeExit;
  if (t < .055 || t > .611 && t < .898) cabinTransfer(actor, rig, scratch, transfer, -1);
  scratch.pole.set(0, -1, 0);
  scratch.hand.copy(actor.position).add(scratch.foot.set(.255, .90, .23).applyAxisAngle(up, motion.heading));
  if (t < .316) scratch.hand.lerp(scratch.foot.set(counterPaper[0] + .06, counterPaper[1] + .09, counterPaper[2] + .04), state.offer);
  if (t >= .382 && t < .454) {
    const receive = MathUtils.smoothstep(t, .382, .415) * (1 - MathUtils.smoothstep(t, .432, .454));
    scratch.hand.lerp(scratch.foot.set(bagCounter[0] + .055, bagCounter[1] + .235, bagCounter[2] + .045), receive);
  }
  reach(rig.left, scratch.hand, scratch.pole, .96);
  const swing = .11 * Math.sin(motion.gait * Math.PI * 2);
  scratch.hand.copy(actor.position).add(scratch.foot.set(-.23, .82, .07 + swing).applyAxisAngle(up, motion.heading));
  reach(rig.right, scratch.hand, scratch.pole, .78);
  const doorContact = Math.max(
    MathUtils.smoothstep(state.exit, .12, .37) * (1 - MathUtils.smoothstep(state.exit, .64, .96)),
    MathUtils.smoothstep(t, .596, .613) * (1 - MathUtils.smoothstep(state.board, .35, .78)),
    MathUtils.smoothstep(state.homeExit, .12, .39) * (1 - MathUtils.smoothstep(state.homeExit, .63, .95)),
  );
  const hardware = carHandle(scene);
  if (doorContact > 0 && hardware) {
    hardware.getWorldPosition(scratch.hand);
    reach(rig.right, scratch.hand, scratch.pole, doorContact);
  }
  const planted = Math.max(
    MathUtils.smoothstep(t, .205, .226) * (1 - MathUtils.smoothstep(t, .451, .474)),
    MathUtils.smoothstep(t, .987, 1),
  );
  const onFoot = Math.max(
    MathUtils.smoothstep(t, .055, .083) * (1 - MathUtils.smoothstep(t, .587, .611)),
    MathUtils.smoothstep(t, .903, .929),
  );
  lockWalkingFeet(rig, scratch, motion.track, motion.gait, motion.cycles, onFoot * (1 - planted));
  plantFeet(actor, rig, scratch, planted);
  if (t >= .23 && t < .45) {
    rig.crown.getWorldPosition(scratch.hand);
    scratch.hand.z -= .06 * state.verify;
    aim(rig.head, rig.crown, scratch.hand, state.verify);
  }
  if (paper?.visible) {
    rig.left[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.02, -.025, .09).applyAxisAngle(up, motion.heading));
    paper.position.copy(scratch.hand).lerp(scratch.foot.set(counterPaper[0], counterPaper[1] + .072 * state.verify, counterPaper[2] - .18 * state.verify), state.offer);
    paper.rotation.set(0, (motion.heading + Math.PI / 2) * (1 - state.offer), .58 * (1 - state.offer));
  }
  if (state.carryBag && bag) {
    rig.left[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.02, -.216, .065).applyAxisAngle(up, motion.heading));
    // The bag passes smoothly from the worktop to the patient's grip.
    bag.position.set(...bagCounter).lerp(scratch.hand, MathUtils.smoothstep(t, .427, .454));
    bag.rotation.set(0, motion.heading, .07 * Math.sin(motion.gait * Math.PI * 2));
  }
}

function finalePose(t, actor, rig, scratch, scene) {
  const state = finaleFrame(t);
  const motion = sampleFinalePatient(t, state, actor.position, scratch.tangent);
  actor.visible = true;
  actor.rotation.y = motion.heading;
  sampleRig(rig, motion.gait);
  actor.updateWorldMatrix(true, true);
  const { place, read, sip, holdCup, rest } = state;
  const walking = Math.max(
    MathUtils.smoothstep(t, 0, .03) * (1 - MathUtils.smoothstep(t, .103, .13)),
    MathUtils.smoothstep(t, .445, .47) * (1 - MathUtils.smoothstep(t, .546, .572)),
    MathUtils.smoothstep(t, .855, .882) * (1 - MathUtils.smoothstep(t, .950, .976)),
  );
  lockWalkingFeet(rig, scratch, motion.track, motion.gait, motion.cycles, walking * (1 - rest));
  const standing = Math.max(
    MathUtils.smoothstep(t,.103,.130) * (1 - MathUtils.smoothstep(t,.427,.452)),
    MathUtils.smoothstep(t,.950,.976),
  );
  scratch.pole.set(0,-1,0);
  scratch.hand.copy(actor.position).add(scratch.foot.set(.24,.91,.21).applyAxisAngle(up,motion.heading));
  const bagReach = MathUtils.smoothstep(t,.116,.170) * (1 - MathUtils.smoothstep(t,.23,.275));
  scratch.hand.lerp(scratch.foot.set(bagOnTable[0],bagOnTable[1]+.235,bagOnTable[2]+.045),bagReach);
  if (rest > 0) scratch.hand.lerp(scratch.foot.set(4.71,.77,-2.72),rest);
  reach(rig.left,scratch.hand,scratch.pole,Math.max(.88 * (1 - place),bagReach,rest));

  scratch.hand.set(cupOnTable[0] - .039, cupOnTable[1] + .060, cupOnTable[2] + .075);
  scratch.hand.lerp(scratch.foot.set(2.52,1.66,-.39),sip);
  scratch.hand.lerp(scratch.foot.set(4.25,.77,-2.72),rest);
  reach(rig.right,scratch.hand,scratch.pole,Math.max(holdCup,rest));
  rig.crown.getWorldPosition(scratch.hand);
  scratch.hand.z -= .087 * read + .025 * rest;
  scratch.hand.x += .04 * rest - .013 * read;
  aim(rig.head,rig.crown,scratch.hand,Math.max(read,rest));
  rig.head.rotateZ(.045 * read - .07 * rest);
  rig.spine.rotateX(.028 * rest * Math.sin(t * 82));

  for (const [index, leg] of [rig.leftLeg,rig.rightLeg].entries()) {
    scratch.pole.set(Math.sin(motion.heading),0,Math.cos(motion.heading));
    scratch.foot.set(index ? -.118 : .118,.095,.03).applyAxisAngle(up,motion.heading).add(actor.position);
    reach(leg,scratch.foot,scratch.pole,standing);
    if (rest > 0) {
      leg[0].getWorldPosition(scratch.hand);
      const x = scratch.hand.x;
      // Place the knee ahead of the cushion, with the shin dropping to the floor.
      scratch.hand.y -= .055;
      scratch.hand.z += .43;
      aim(leg[0], leg[1], scratch.hand, rest);
      scratch.foot.set(x, .253, -2.58);
      aim(leg[1], leg[2], scratch.foot, rest);
    }
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(0,-.083,.13).applyAxisAngle(up,motion.heading));
    aim(leg[2],rig.toes[index],scratch.hand,Math.max(standing,rest));
  }

  const bag = scene.getObjectByName('SealedBagStory');
  if (bag) {
    bag.visible = true;
    rig.left[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.02,-.216,.065).applyAxisAngle(up,motion.heading));
    bag.position.copy(scratch.hand).lerp(scratch.foot.set(...bagOnTable),place);
    bag.rotation.set(0,MathUtils.lerp(motion.heading,.07,place),.04 * (1 - place) * Math.sin(motion.gait * Math.PI * 2));
  }
  const cup = scene.getObjectByName('FinaleCup');
  if (cup) {
    rig.right[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.033 - .081 * sip,-.053 + .112 * sip,-.029));
    cup.position.set(...cupOnTable).lerp(scratch.hand,holdCup);
    cup.rotation.set(.72 * sip,0,-.05 * sip);
  }
}

export default function PatientScene({ controller, finaleController, chair }) {
  const { scene, animations } = useGLTF('/assets/house/patient.glb', false);
  const { scene: laptopSource } = useGLTF('/assets/house/patient-laptop.glb', false);
  const body = useRef(null), prop = useRef(null), floorContact = useRef(null);
  const rig = useMemo(() => {
    const model = clone(scene);
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
        if (object.isSkinnedMesh) object.frustumCulled = false;
      }
    });
    const bones = (names) => names.map((name) => model.getObjectByName(name));
    const mixer = new AnimationMixer(model);
    const clip = animations.find(({ name }) => name.toLowerCase().includes('walk'));
    const action = mixer.clipAction(clip).play();
    const [hips, spine, chest, head, crown, face] = bones(['Hips', 'Spine', 'Spine02', 'Head', 'head_end', 'headfront']);
    const left = bones(['LeftArm', 'LeftForeArm', 'LeftHand']);
    const right = bones(['RightArm', 'RightForeArm', 'RightHand']);
    const leftLeg = bones(['LeftUpLeg', 'LeftLeg', 'LeftFoot']);
    const rightLeg = bones(['RightUpLeg', 'RightLeg', 'RightFoot']);
    const toes = bones(['LeftToeBase', 'RightToeBase']);
    const rotations = [spine, head, ...left, ...right, ...leftLeg, ...rightLeg].map((bone) => [bone, bone.quaternion.clone()]);
    return { model, shadowFrame: -1, mixer, action, clip, hips, rest: hips.position.clone(), hipSample: hips.position.clone(),
      spine, chest, head, crown, face, left, right, leftLeg, rightLeg, toes, rotations };
  }, [scene, animations]);
  const laptop = useMemo(() => {
    const model = laptopSource.clone(true);
    const instances = instanceLaptopKeys(model);
    return { model, instances, hinge: model.getObjectByName('LaptopHinge') };
  }, [laptopSource]);
  useEffect(() => () => { laptop.instances?.dispose(); }, [laptop]);
  const scratch = useMemo(() => ({ carry: new Vector3(), hand: new Vector3(), pole: new Vector3(), foot: new Vector3(), path: new Vector3(), tangent: new Vector3(), support: new Vector3(), supportTangent: new Vector3() }), []);

  /* eslint-disable react-hooks/immutability -- The frame callback updates mutable Three.js scene objects. */
  useFrame(({ gl, scene: world }) => {
    const journey = previousJourney(controller.progress);
    const stage = preTravelProgress(journey);
    const travelling = journey > travelStart;
    const travel = travelProgress(journey);
    const trip = sampleTravel(travel);
    const story = earlierProgress(stage);
    const booking = bookingProgress(story);
    const progress = patientProgress(booking);
    const call = sampleCall(story);
    const prescription = prescriptionFrame(stage);
    if (!body.current || !prop.current) return;
    const actor = body.current;
    const object = prop.current;
    if (controller.progress > pharmacyStart) {
      object.visible = true;
      object.position.copy(tabletop);
      object.rotation.set(0, 0, 0);
      laptop.hinge.rotation.z = 1.83;
      chair.position.setX(3.93 + pulledChair - .56 * .82);
      if (finaleController.progress > finaleStart) {
        finalePose(finaleProgress(finaleController.progress), actor, rig, scratch, world);
      } else {
        pharmacyPose(pharmacyProgress(controller.progress), actor, rig, scratch, world);
      }
      updatePatientShadow(gl, rig, actor, finaleController.progress);
      return;
    }
    const walk = beat(progress, 'walk');
    const turn = beat(progress, 'turn');
    const pull = beat(progress, 'pull');
    const sit = beat(progress, 'sit') * (1 - trip.stand);
    const place = beat(progress, 'place');
    const open = beat(progress, 'open');
    actor.visible = progress >= .63 && trip.enter < .97;
    object.visible = progress >= .63;
    const scoot = .56 * MathUtils.smoothstep(progress, .895, .923);
    chair.position.x = 3.93 + pulledChair * pull - scoot * .82;
    if (!actor.visible) {
      updatePatientShadow(gl, rig, actor, finaleController.progress);
      return;
    }

    actor.position.lerpVectors(approach, stoppingPoint, walk).lerp(seat, sit);
    actor.position.x += .14 * pull * (1 - sit) - scoot;
    actor.rotation.y = MathUtils.lerp(Math.PI, -Math.PI / 2 + Math.PI * 2, turn);
    if (travelling) {
      const heading = walkPose(trip.walk, scratch.path, scratch.tangent);
      actor.position.lerp(scratch.path, trip.stand);
      actor.rotation.y += Math.atan2(Math.sin(heading - actor.rotation.y), Math.cos(heading - actor.rotation.y)) * trip.stand;
      // Step around the trailing edge of the open door before sliding into the seat.
      const seatTurn = MathUtils.smoothstep(trip.enter, .30, .88);
      const driverHeading = Math.PI / 2 - actor.rotation.y;
      actor.rotation.y += Math.atan2(Math.sin(driverHeading), Math.cos(driverHeading)) * seatTurn;
      actor.position.set(actor.position.x + .64 * MathUtils.smoothstep(trip.enter, .16, .63),
        actor.position.y - .34 * trip.enter - .08 * Math.sin(Math.PI * trip.enter),
        MathUtils.lerp(actor.position.z, carLaneZ, trip.enter));
    }
    sampleRig(rig, travelling ? trip.walk * 13 : walk * 3);
    rig.hips.position.y = MathUtils.lerp(rig.hips.position.y, rig.rest.y, sit);
    actor.updateWorldMatrix(true, true);
    const settleFeet = MathUtils.smoothstep(progress, .778, .810) * (1 - sit) * (1 - trip.stand);
    const walking = travelling
      ? trip.stand * (1 - MathUtils.smoothstep(travel, .422, .46)) * (1 - trip.enter)
      : (1 - sit) * (1 - settleFeet);
    lockWalkingFeet(rig, scratch, travelling ? departureTrack : approachTrack,
      travelling ? trip.walk * 13 : walk * 3, travelling ? 13 : 3, walking);
    plantFeet(actor, rig, scratch, settleFeet);
    rig.chest.getWorldPosition(scratch.hand);
    const settleLean = Math.sin(Math.PI * sit);
    const riseLean = Math.sin(Math.PI * trip.stand);
    scratch.hand.x -= .14 + .095 * Math.sin(Math.PI * open) + .15 * Math.max(settleLean, riseLean);
    aim(rig.spine, rig.chest, scratch.hand, Math.max(place * (1 - .45 * open), settleLean, riseLean));
    const attend = MathUtils.smoothstep(progress, .905, .98) * sit;
    scratch.hand.set(3.20, 1.17, -1.34);
    aim(rig.head, rig.face, scratch.hand, .62 * attend);

    // The laptop begins in the left hand, then comes to rest on the tabletop.
    scratch.carry.set(.20, 1.06, .385).applyAxisAngle(up, actor.rotation.y).add(actor.position);
    object.position.copy(scratch.carry).lerp(tabletop, place);
    object.rotation.set(0, (actor.rotation.y - Math.PI * 1.5) * (1 - place), -1.35 * (1 - place));
    laptop.hinge.rotation.z = open * 1.83;

    const grip = beat(progress, 'grip') * (1 - sit);
    scratch.pole.set(0, -1, .16);
    scratch.hand.set(MathUtils.lerp(.024, .16, place), -.012, .133);
    object.localToWorld(scratch.hand);
    reach(rig.left, scratch.hand, scratch.pole, 1 - MathUtils.smoothstep(progress, .951, .961));
    scratch.hand.set(chair.position.x + .245, 1.105, -1.035);
    reach(rig.right, scratch.hand, scratch.pole, grip);
    laptop.hinge.localToWorld(scratch.hand.set(.221, .004, .093));
    scratch.hand.x += .035;
    scratch.hand.lerp(scratch.foot.set(3.39, .99, -1.24), MathUtils.smoothstep(progress, .986, 1));
    const lowerHand = MathUtils.smoothstep(booking, .735, .775);
    reach(rig.right, scratch.hand, scratch.pole, MathUtils.smoothstep(progress, .941, .966) * (1 - lowerHand));
    if (call.phase === 'active' && !prescription.phase) {
      rig.crown.getWorldPosition(scratch.hand);
      scratch.hand.x -= .034 + .045 * call.nod;
      scratch.hand.z += .022 * call.gesture;
      aim(rig.head, rig.crown, scratch.hand, 1);
      scratch.hand.set(3.58, .93 + .18 * call.gesture, -1.48 + .10 * call.gesture);
      reach(rig.right, scratch.hand, scratch.pole, call.gesture);
      rig.right[2].rotateX(-.19 * call.gesture);
    }
    if (prescription.reach > 0 && trip.stand < 1) {
      rig.chest.getWorldPosition(scratch.hand);
      scratch.hand.x -= .32 * prescription.reach * (1 - .56 * prescription.pickup);
      scratch.hand.z += .09 * prescription.reach;
      aim(rig.spine, rig.chest, scratch.hand, 1);
      scratch.hand.set(prescription.paperX + .095, prescription.paperY + .018, prescription.paperZ - .04);
      reach(rig.left, scratch.hand, scratch.pole, prescription.reach * (1 - trip.stand));
      const sheet = world.getObjectByName('TravelPrescription');
      if (sheet && prescription.pickup > 0) {
        rig.left[2].getWorldPosition(scratch.hand);
        sheet.position.lerp(scratch.hand.add(scratch.foot.set(-.095, -.018, .04)), prescription.pickup);
      }
      scratch.hand.set(3.89, .79, -1.43);
      reach(rig.right, scratch.hand, scratch.pole, prescription.reach * (1 - trip.stand));
    }

    scratch.pole.set(-1, 0, 0);
    for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
      const side = index ? -1 : 1;
      scratch.foot.set(3.97 - scoot * .59, .232, -1.29 + side * .165);
      reach(leg, scratch.foot, scratch.pole, sit);
      leg[2].getWorldPosition(scratch.hand);
      scratch.hand.add(scratch.foot.set(-.14, -.048, 0));
      aim(leg[2], rig.toes[index], scratch.hand, sit);
    }
    if (travelling) {
      scratch.hand.copy(actor.position).add(scratch.foot.set(.25, 1.02, .27).applyAxisAngle(up, actor.rotation.y));
      scratch.pole.set(0, -1, 0);
      reach(rig.left, scratch.hand, scratch.pole, trip.stand);
      const swing = .12 * Math.sin(trip.walk * 13 * Math.PI * 2);
      scratch.hand.copy(actor.position).add(scratch.foot.set(-.25, .83, .05 + swing).applyAxisAngle(up, actor.rotation.y));
      reach(rig.right, scratch.hand, scratch.pole, .74 * trip.stand);
      const handle = MathUtils.smoothstep(travel, .414, .458) * (1 - MathUtils.smoothstep(travel, .484, .53));
      const hardware = carHandle(world);
      if (hardware && handle > 0) {
        hardware.getWorldPosition(scratch.hand);
        reach(rig.right, scratch.hand, scratch.pole, handle);
      }
      cabinTransfer(actor, rig, scratch, trip.enter, 1);
      const paper = actor.parent.getObjectByName('TravelPrescription');
      if (paper) {
        rig.left[2].getWorldPosition(scratch.hand);
        scratch.hand.add(scratch.foot.set(.04, .015, .095).applyAxisAngle(up, actor.rotation.y));
        paper.position.lerp(scratch.hand, trip.stand);
        paper.rotation.set(0, actor.rotation.y + Math.PI / 2, .38 + trip.stand * .58);
      }
    }
    updatePatientShadow(gl, rig, actor, finaleController.progress);
  });
  useFrame(() => {
    if (!floorContact.current || !body.current) return;
    const { position, visible } = body.current;
    const inside = position.x > 1.65 && position.x < 6.4 && position.z < 3.8;
    const onRug = position.x > 1.99 && position.x < 5.82 && position.z > -3.07 && position.z < -.05;
    const inShop = position.x > 28 && position.z < 8.1;
    floorContact.current.visible = visible && (inside || inShop);
    floorContact.current.position.set(position.x, inShop ? .076 : onRug ? .215 : .185, position.z);
    floorContact.current.rotation.y = body.current.rotation.y;
  });
  /* eslint-enable react-hooks/immutability */

  return <>
    <group ref={floorContact} visible={false}>
      <ContactShadow size={[.95, .82]} opacity={.40} />
    </group>
    <group ref={body} visible={false}><primitive object={rig.model} dispose={null} /></group>
    <group ref={prop} visible={false}><primitive object={laptop.model} dispose={null} /></group>
    <LaptopDisplay hinge={laptop.hinge} controller={controller} />
  </>;
}
